import {
  create,
  ExternalPluginAdapterSchema,
  fetchAsset,
  fetchCollection,
  mplCore,
  writeData,
  type CollectionV1,
} from "@metaplex-foundation/mpl-core";
import {
  createSignerFromKeypair,
  generateSigner,
  publicKey,
  signerIdentity,
  signTransaction,
  type KeypairSigner,
  type TransactionBuilder,
  type Umi,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { lerDados, montarDados, type DadosNoNft } from "./badges";
import {
  chaveDeBadges,
  chaveDeMint,
  colecaoNft,
  ConfigNftError,
  conexaoNft,
} from "./config";

/**
 * As duas transações do NFT, montadas com o SDK da Metaplex (programa Core):
 *  - mint: cria o NFT na coleção, com a carteira do usuário como dona, e já
 *    grava o hash da ficha;
 *  - badges: reescreve a lista inteira de badges do NFT.
 *
 * Quem assina é sempre o servidor (o usuário nunca assina transação):
 *  - a chave de mint cria e paga a taxa — é delegada na coleção;
 *  - a chave de badges é a única que escreve no AppData do NFT.
 * O NFT nasce congelado pela coleção (PermanentFreezeDelegate): não sai da
 * carteira e não pode ser queimado. Só a autoridade raiz descongela.
 *
 * As transações voltam ASSINADAS e ainda não enviadas, com a assinatura: quem
 * chama grava a assinatura antes de transmitir (lib/nft/mint.ts).
 */
interface Contexto {
  umi: Umi;
  mint: KeypairSigner;
  badge: KeypairSigner;
}

let contexto: { de: string; valor: Contexto } | null = null;

function ctx(): Contexto {
  const mintKp = chaveDeMint();
  const badgeKp = chaveDeBadges();
  if (!mintKp || !badgeKp) throw new ConfigNftError("NFT não configurado.");
  const conexao = conexaoNft();
  const de = `${conexao.rpcEndpoint}|${mintKp.publicKey.toBase58()}|${badgeKp.publicKey.toBase58()}`;
  if (contexto?.de === de) return contexto.valor;
  const umi = createUmi(conexao).use(mplCore());
  const mint = createSignerFromKeypair(
    umi,
    umi.eddsa.createKeypairFromSecretKey(mintKp.secretKey),
  );
  const badge = createSignerFromKeypair(
    umi,
    umi.eddsa.createKeypairFromSecretKey(badgeKp.secretKey),
  );
  umi.use(signerIdentity(mint));
  contexto = { de, valor: { umi, mint, badge } };
  return contexto.valor;
}

/** A coleção, lida da rede (vale 10 min na memória). */
let colecaoLida: { ate: number; valor: CollectionV1 } | null = null;

async function colecao(umi: Umi): Promise<CollectionV1> {
  const endereco = colecaoNft();
  if (!endereco) throw new ConfigNftError("NFT não configurado.");
  if (
    colecaoLida &&
    colecaoLida.ate > Date.now() &&
    colecaoLida.valor.publicKey === endereco.toBase58()
  )
    return colecaoLida.valor;
  const valor = await fetchCollection(umi, publicKey(endereco.toBase58()));
  colecaoLida = { ate: Date.now() + 10 * 60_000, valor };
  return valor;
}

/** Onde os badges ficam no NFT: AppData escrito só pela chave de badges. */
const chaveDoAppData = (badge: KeypairSigner) =>
  ({
    type: "AppData",
    dataAuthority: { type: "Address", address: badge.publicKey },
  }) as const;

export interface TransacaoAssinada {
  /** Assinatura (id da transação), em base58. */
  assinatura: string;
  /** Transação pronta para transmitir. */
  bytes: Uint8Array;
  /** Depois deste bloco a rede não aceita mais a transação. */
  validoAteBloco: number;
}

async function assinar(
  umi: Umi,
  builder: TransactionBuilder,
): Promise<TransacaoAssinada> {
  const bloco = await umi.rpc.getLatestBlockhash({ commitment: "confirmed" });
  const pronto = builder.setBlockhash(bloco);
  if (!pronto.fitsInOneTransaction(umi))
    throw new Error("A transação do NFT ficou grande demais.");
  const tx = await signTransaction(pronto.build(umi), pronto.getSigners(umi));
  return {
    assinatura: base58.deserialize(tx.signatures[0])[0],
    bytes: umi.transactions.serialize(tx),
    validoAteBloco: bloco.lastValidBlockHeight,
  };
}

/**
 * Monta e assina o mint. O endereço do NFT é sorteado aqui e devolvido junto,
 * para ser gravado antes do envio.
 */
export async function montarMint(o: {
  /** Carteira do usuário: dona do NFT. */
  carteira: string;
  nome: string;
  /** Endereço dos metadados, a partir do endereço do NFT. */
  uri: (asset: string) => string;
  fichaHash: string;
}): Promise<TransacaoAssinada & { asset: string }> {
  const { umi, mint, badge } = ctx();
  const col = await colecao(umi);
  const asset = generateSigner(umi);
  const builder = create(umi, {
    asset,
    collection: col,
    authority: mint,
    payer: mint,
    owner: publicKey(o.carteira),
    name: o.nome,
    uri: o.uri(asset.publicKey),
    plugins: [
      {
        ...chaveDoAppData(badge),
        schema: ExternalPluginAdapterSchema.Json,
      },
    ],
  }).add(
    writeData(umi, {
      key: chaveDoAppData(badge),
      authority: badge,
      payer: mint,
      asset: asset.publicKey,
      collection: col.publicKey,
      data: montarDados(o.fichaHash, []),
    }),
  );
  return { ...(await assinar(umi, builder)), asset: asset.publicKey };
}

/** Monta e assina a escrita dos badges (a lista inteira, sempre). */
export async function montarEscritaDeBadges(o: {
  asset: string;
  fichaHash: string;
  badges: Array<{ id: string; em: Date }>;
}): Promise<TransacaoAssinada> {
  const { umi, mint, badge } = ctx();
  const col = await colecao(umi);
  return assinar(
    umi,
    writeData(umi, {
      key: chaveDoAppData(badge),
      authority: badge,
      payer: mint,
      asset: publicKey(o.asset),
      collection: col.publicKey,
      data: montarDados(o.fichaHash, o.badges),
    }),
  );
}

export interface NftNaRede {
  dono: string;
  nome: string;
  uri: string;
  /** O que a chave de badges gravou (null = nada ou fora do formato). */
  dados: DadosNoNft | null;
}

/** O NFT como está na rede agora. null = a conta não existe. */
export async function lerNftNaRede(asset: string): Promise<NftNaRede | null> {
  const { umi, badge } = ctx();
  let a;
  try {
    a = await fetchAsset(umi, publicKey(asset), { commitment: "confirmed" });
  } catch (e) {
    if ((e as Error).name === "AccountNotFoundError") return null;
    throw e;
  }
  const app = a.appDatas?.find(
    (d) =>
      d.dataAuthority.type === "Address" &&
      d.dataAuthority.address === badge.publicKey,
  );
  return {
    dono: a.owner,
    nome: a.name,
    uri: a.uri,
    dados: lerDados(app?.data),
  };
}
