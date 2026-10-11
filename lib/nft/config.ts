import { Connection, Keypair, PublicKey } from "@solana/web3.js";

/**
 * Configuração do NFT do influencer (Metaplex Core, na Solana). Server-side.
 *
 * Env:
 *  - NFT_REDE: "devnet" ou "mainnet". Sem ela, o NFT fica desligado.
 *  - NFT_COLECAO: endereço da coleção (criada por scripts/nft-colecao.mjs).
 *  - NFT_MINT_SECRET_KEY: chave quente que minta e paga as taxas, em JSON
 *    ([12,34,…], 64 números). É delegada na coleção e a raiz pode revogar.
 *  - NFT_BADGE_SECRET_KEY: chave quente que só escreve os badges, no mesmo
 *    formato. Não precisa de saldo (quem paga a taxa é a chave de mint).
 *  - NFT_RPC_URL (opcional): RPC desta rede. Sem ela usa SOLANA_RPC_URL na
 *    mainnet e o RPC público na devnet.
 *  - NFT_BASE_URL (opcional): endereço público do app para os metadados
 *    (padrão: BETTER_AUTH_URL).
 *  - NFT_TETO_DIA (opcional): máximo de mints em 24h, todas as contas (padrão 200).
 *  - NFT_SALDO_MINIMO (opcional): abaixo deste saldo em SOL a chave de mint
 *    para de mintar e o log grita (padrão 0.02).
 *
 * As duas chaves são diferentes da carteira de saques e da que recebe
 * pagamentos. A autoridade raiz da coleção NÃO fica no servidor.
 */
export type RedeNft = "devnet" | "mainnet";

/** Hash do primeiro bloco de cada rede: identifica em qual rede o RPC está. */
const GENESE: Record<RedeNft, string> = {
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
};

/** Programa Core da Metaplex (o mesmo endereço em todas as redes). */
export const PROGRAMA_CORE = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";

export function redeNft(): RedeNft | null {
  const r = process.env.NFT_REDE?.trim().toLowerCase();
  return r === "devnet" || r === "mainnet" ? r : null;
}

export function rpcNft(): string {
  const proprio = process.env.NFT_RPC_URL?.trim();
  if (proprio) return proprio;
  if (redeNft() === "devnet") return "https://api.devnet.solana.com";
  return (
    process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com"
  );
}

function endereco(nome: string): PublicKey | null {
  const v = process.env[nome]?.trim();
  if (!v) return null;
  try {
    return new PublicKey(v);
  } catch {
    return null;
  }
}

export const colecaoNft = (): PublicKey | null => endereco("NFT_COLECAO");

function chave(nome: string): Keypair | null {
  const bruto = process.env[nome]?.trim();
  if (!bruto) return null;
  try {
    const bytes = JSON.parse(bruto) as number[];
    return Array.isArray(bytes) && bytes.length === 64
      ? Keypair.fromSecretKey(Uint8Array.from(bytes))
      : null;
  } catch {
    return null;
  }
}

export const chaveDeMint = (): Keypair | null => chave("NFT_MINT_SECRET_KEY");
export const chaveDeBadges = (): Keypair | null => chave("NFT_BADGE_SECRET_KEY");

/** O NFT está ligado neste deploy (rede, coleção e as duas chaves)? */
export function nftConfigurado(): boolean {
  return !!(redeNft() && colecaoNft() && chaveDeMint() && chaveDeBadges());
}

/** Endereço público do app, sem barra no fim (para os metadados do NFT). */
export function baseUrlNft(): string | null {
  const url = (
    process.env.NFT_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim()
  )?.replace(/\/+$/, "");
  if (!url) return null;
  // Na mainnet o endereço fica gravado no NFT: tem de ser o público, em https.
  if (redeNft() === "mainnet" && !/^https:\/\/[^/]+\.[a-z]{2,}/i.test(url))
    return null;
  return /^https?:\/\//.test(url) ? url : null;
}

/** Endereço dos metadados de um NFT (fica gravado na rede). */
export const uriDoNft = (base: string, asset: string) =>
  `${base}/api/nft/meta/${asset}`;

function numero(nome: string, padrao: number): number {
  const n = Number(process.env[nome]);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

/** Máximo de mints em 24 horas, somando todas as contas. */
export const tetoDiarioNft = () => numero("NFT_TETO_DIA", 200);
/** Saldo mínimo (SOL) da chave de mint para aceitar um mint. */
export const saldoMinimoNft = () => numero("NFT_SALDO_MINIMO", 0.02);

let conexao: Connection | null = null;
let conexaoDe = "";

export function conexaoNft(): Connection {
  const url = rpcNft();
  if (!conexao || conexaoDe !== url) {
    conexao = new Connection(url, "confirmed");
    conexaoDe = url;
  }
  return conexao;
}

/** Link do explorer (a devnet precisa do parâmetro da rede). */
export function linkExplorerNft(
  tipo: "address" | "tx",
  valor: string,
  rede: RedeNft,
): string {
  return `https://explorer.solana.com/${tipo}/${valor}${rede === "devnet" ? "?cluster=devnet" : ""}`;
}

export class ConfigNftError extends Error {}

let conferida: string | null = null;

/**
 * Confere, uma vez por processo, que o RPC está na rede de NFT_REDE e que a
 * coleção existe nela e é do programa Core. Pega o erro clássico de ambiente
 * misturado (coleção de devnet com RPC de mainnet) antes de qualquer cobrança.
 */
export async function conferirAmbienteNft(): Promise<void> {
  const rede = redeNft();
  const colecao = colecaoNft();
  if (!rede || !colecao || !chaveDeMint() || !chaveDeBadges())
    throw new ConfigNftError("NFT não configurado.");
  const marca = `${rede}|${rpcNft()}|${colecao.toBase58()}`;
  if (conferida === marca) return;
  const c = conexaoNft();
  const genese = await c.getGenesisHash();
  if (genese !== GENESE[rede])
    throw new ConfigNftError(
      `O RPC do NFT não está na ${rede} (NFT_REDE × NFT_RPC_URL).`,
    );
  const conta = await c.getAccountInfo(colecao, "confirmed");
  if (!conta || conta.owner.toBase58() !== PROGRAMA_CORE)
    throw new ConfigNftError(
      `A coleção ${colecao.toBase58()} não existe na ${rede} (NFT_COLECAO).`,
    );
  conferida = marca;
}
