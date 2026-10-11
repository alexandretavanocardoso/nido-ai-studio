// Confere as regras do NFT do influencer contra o programa Core DE VERDADE, por
// simulação: nada é gravado na rede e não custa nada. Não precisa de chave nem
// de SOL — as chaves são sorteadas na hora e quem "paga" na simulação é uma
// conta qualquer que tenha saldo (achada sozinha, ou --pagador <endereço>).
//
//   node scripts/nft-simular.mjs              (devnet)
//   node scripts/nft-simular.mjs --rede mainnet [--rpc <url>]
//
// O que confere, com a mesma coleção e as mesmas transações do app
// (scripts/nft-colecao.mjs e lib/nft/core.ts):
//   - a chave de mint delegada cria o NFT com a carteira do usuário como dona;
//   - o NFT não pode ser transferido nem queimado pelo dono (soulbound);
//   - só a chave de badges escreve os badges;
//   - a chave de mint não descongela; a raiz descongela e revoga a chave de mint;
//   - quanto custa um mint.
// Sai com erro se alguma regra não valer.
import {
  burn,
  create,
  createCollection,
  ExternalPluginAdapterSchema,
  mplCore,
  transfer,
  update,
  updateCollectionPlugin,
  writeData,
} from "@metaplex-foundation/mpl-core";
import {
  createNoopSigner,
  generateSigner,
  publicKey,
  signerIdentity,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";

const CORE = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
// O pior caso do que é gravado no NFT (lib/nft/badges.ts, montarDados): seis
// métricas com dez degraus cada, todos conquistados.
const LETRAS = ["v", "l", "c", "r", "q", "s"];
const TODOS_OS_DEGRAUS = Object.fromEntries(LETRAS.map((l) => [l, 10]));

const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const rede = opcao("rede") === "mainnet" ? "mainnet" : "devnet";
const rpc =
  opcao("rpc") ??
  (rede === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

const conexao = new Connection(rpc, "confirmed");
const umi = createUmi(rpc).use(mplCore());

/** Conta com saldo para pagar na simulação: quem pagou uma transação recente do Core. */
async function acharPagador() {
  const dado = opcao("pagador");
  if (dado) return dado;
  const recentes = await conexao.getSignaturesForAddress(new PublicKey(CORE), { limit: 15 });
  for (const s of recentes) {
    const tx = await conexao.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    const chaves = tx?.transaction.message.staticAccountKeys ?? tx?.transaction.message.accountKeys;
    const pagador = chaves?.[0];
    if (pagador && (await conexao.getBalance(pagador)) > 0.05 * 1e9) return pagador.toBase58();
  }
  throw new Error("Não achei uma conta com saldo; passe --pagador <endereço>.");
}

const pagador = createNoopSigner(publicKey(await acharPagador()));
umi.use(signerIdentity(pagador));

const raiz = generateSigner(umi);
const mint = generateSigner(umi);
const badge = generateSigner(umi);
const estranho = generateSigner(umi);
const dono = generateSigner(umi);
const outro = generateSigner(umi);
const colecao = generateSigner(umi);
const asset = generateSigner(umi);
const col = { publicKey: colecao.publicKey, oracles: [], lifecycleHooks: [] };
const noAppData = { type: "AppData", dataAuthority: { type: "Address", address: badge.publicKey } };
/** Bytes no formato do app: por métrica, o dia em que cada degrau foi conquistado. */
const dados = (degraus) =>
  new TextEncoder().encode(
    JSON.stringify({
      v: 2,
      ficha: "a".repeat(64),
      b: Object.fromEntries(
        Object.entries(degraus).map(([letra, n]) => [letra, Array(n).fill(20736)]),
      ),
    }),
  );

// A coleção, como scripts/nft-colecao.mjs cria.
const criarColecao = () =>
  createCollection(umi, {
    collection: colecao,
    payer: pagador,
    updateAuthority: raiz.publicKey,
    name: "NIDO Influencers",
    uri: "https://aistudio.nido.global/api/nft/meta/colecao",
    plugins: [
      { type: "PermanentFreezeDelegate", frozen: true, authority: { type: "Address", address: raiz.publicKey } },
      { type: "UpdateDelegate", additionalDelegates: [mint.publicKey], authority: { type: "UpdateAuthority" } },
    ],
  });
// O mint, como lib/nft/core.ts monta.
const criarNft = (autoridade) =>
  create(umi, {
    asset,
    collection: col,
    authority: autoridade,
    payer: pagador,
    owner: dono.publicKey,
    name: "Lila Nova",
    uri: `https://aistudio.nido.global/api/nft/meta/${asset.publicKey}`,
    plugins: [{ ...noAppData, schema: ExternalPluginAdapterSchema.Json }],
  });
const escrever = (autoridade, degraus = {}) =>
  writeData(umi, {
    key: noAppData,
    authority: autoridade,
    payer: pagador,
    asset: asset.publicKey,
    collection: colecao.publicKey,
    data: dados(degraus),
  });
const base = () => transactionBuilder().add(criarColecao()).add(criarNft(mint));
const doDono = { asset: { publicKey: asset.publicKey, owner: dono.publicKey }, collection: col, payer: pagador };
const naColecao = { collection: colecao.publicKey, payer: pagador };

async function simular(builder) {
  const pronto = builder.setFeePayer(pagador).setBlockhash(await umi.rpc.getLatestBlockhash());
  const tx = VersionedTransaction.deserialize(umi.transactions.serialize(pronto.build(umi)));
  const antes = await conexao.getBalance(new PublicKey(pagador.publicKey));
  const { value } = await conexao.simulateTransaction(tx, {
    sigVerify: false,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [pagador.publicKey] },
  });
  return { ok: !value.err, erro: value.err, custo: antes - (value.accounts?.[0]?.lamports ?? antes) };
}

let falhas = 0;
async function conferir(nome, builder, esperado) {
  let r;
  try {
    r = await simular(builder);
  } catch (e) {
    falhas++;
    console.log(`ERRO    ${nome}\n        ${e.message.split("\n")[0]}`);
    return null;
  }
  const certo = r.ok === (esperado === "passa");
  if (!certo) falhas++;
  console.log(
    `${certo ? "OK  " : "FALHOU"}  ${nome} — ${r.ok ? "a rede aceita" : `a rede recusa ${JSON.stringify(r.erro)}`}`,
  );
  return r;
}

console.log(`\nRede: ${rede} (${rpc}) · simulação, nada é gravado\n`);

const soColecao = await conferir("criar a coleção", transactionBuilder().add(criarColecao()), "passa");
const completo = await conferir(
  "chave de mint delegada minta para a carteira do usuário e a chave de badges grava",
  base().add(escrever(badge, { v: 1 })),
  "passa",
);
await conferir("dono NÃO consegue transferir o NFT (soulbound)", base().add(transfer(umi, { ...doDono, newOwner: outro.publicKey, authority: dono })), "recusa");
await conferir("dono NÃO consegue queimar o NFT", base().add(burn(umi, { ...doDono, authority: dono })), "recusa");
await conferir("chave qualquer NÃO minta na coleção", transactionBuilder().add(criarColecao()).add(criarNft(estranho)), "recusa");
await conferir("chave qualquer NÃO escreve badges", base().add(escrever(estranho, { v: 10 })), "recusa");
await conferir("chave de mint NÃO escreve badges", base().add(escrever(mint, { v: 10 })), "recusa");
await conferir(
  "chave de mint NÃO descongela a coleção",
  base().add(updateCollectionPlugin(umi, { ...naColecao, authority: mint, plugin: { type: "PermanentFreezeDelegate", frozen: false } })),
  "recusa",
);
await conferir(
  "a raiz descongela e então o dono transfere",
  base()
    .add(updateCollectionPlugin(umi, { ...naColecao, authority: raiz, plugin: { type: "PermanentFreezeDelegate", frozen: false } }))
    .add(transfer(umi, { ...doDono, newOwner: outro.publicKey, authority: dono })),
  "passa",
);
await conferir(
  "a raiz revoga a chave de mint e ela para de mintar",
  transactionBuilder()
    .add(criarColecao())
    .add(updateCollectionPlugin(umi, { ...naColecao, authority: raiz, plugin: { type: "UpdateDelegate", additionalDelegates: [] } }))
    .add(criarNft(mint)),
  "recusa",
);
// Poder que a delegação dá (não é uma regra, é um risco conhecido): a chave de
// mint consegue trocar nome e endereço dos metadados dos NFTs até ser revogada.
const troca = await simular(
  base().add(update(umi, { asset: { publicKey: asset.publicKey }, collection: col, authority: mint, payer: pagador, name: "Trocado", uri: "https://x.y/z" })),
).catch(() => null);
console.log(
  `AVISO   a chave de mint ${troca?.ok ? "CONSEGUE" : "não consegue"} trocar nome/metadados de um NFT (por isso ela é revogável e fica com pouco saldo)`,
);

// A escrita do catálogo inteiro sozinha (como o app envia) tem de caber numa transação.
const escrita = escrever(badge, TODOS_OS_DEGRAUS).setFeePayer(pagador).setBlockhash("11111111111111111111111111111111");
const cabe = escrita.fitsInOneTransaction(umi);
if (!cabe) falhas++;
console.log(`${cabe ? "OK  " : "FALHOU"}  o catálogo inteiro de badges (6 métricas × 10 degraus) cabe numa transação (${escrita.getTransactionSize(umi)} de 1232 bytes)`);

if (soColecao?.ok && completo?.ok) {
  const sol = (completo.custo - soColecao.custo) / 1e9;
  console.log(`\nCusto de um mint (aluguel da conta do NFT + taxas), pago pela chave de mint: ${sol.toFixed(6)} SOL`);
}
console.log(falhas ? `\n${falhas} conferência(s) falharam.\n` : "\nTodas as regras valem.\n");
process.exit(falhas ? 1 : 0);
