import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { chaveDeMint, conexaoNft, saldoMinimoNft } from "./config";
import type { Situacao } from "./decisao";

/**
 * Conversa com a rede sobre uma transação já assinada: simular, transmitir e
 * saber como ela está. Separado de ./core.ts (que monta as transações) para a
 * regra de "o que aconteceu com a transação" ficar num lugar só.
 */

/** Erro da simulação em texto curto, ou null se a transação passaria. */
export async function simular(bytes: Uint8Array): Promise<string | null> {
  const r = await conexaoNft().simulateTransaction(
    VersionedTransaction.deserialize(bytes),
    { sigVerify: true, commitment: "confirmed" },
  );
  if (!r.value.err) return null;
  const log = (r.value.logs ?? [])
    .filter((l) => /error|failed/i.test(l))
    .slice(-2)
    .join(" · ");
  return `${JSON.stringify(r.value.err)}${log ? ` (${log})` : ""}`;
}

/** Transmite (sem esperar). Pode ser chamado de novo com a mesma transação. */
export async function transmitir(bytes: Uint8Array): Promise<void> {
  await conexaoNft().sendRawTransaction(bytes, {
    skipPreflight: true,
    maxRetries: 0,
  });
}

/**
 * Como a transação está na rede. Um registro que só chegou a "processed" ainda
 * pode sumir (bloco de um fork que caiu), por isso vale como desconhecido: nem
 * o estorno de um mint nem a marca de "badges gravados" saem de um bloco assim.
 */
export async function situacaoDaTransacao(assinatura: string): Promise<Situacao> {
  const { value } = await conexaoNft().getSignatureStatuses([assinatura], {
    searchTransactionHistory: true,
  });
  const s = value[0];
  if (!s || s.confirmationStatus === "processed") return "sem_registro";
  if (s.err) return "revertida";
  return s.confirmationStatus === "finalized" ? "finalizada" : "pendente";
}

/** Altura do último bloco finalizado. */
export const alturaFinalizada = (): Promise<number> =>
  conexaoNft().getBlockHeight("finalized");

/** A conta existe na rede (em bloco finalizado)? */
export async function contaExiste(endereco: string): Promise<boolean> {
  return !!(await conexaoNft().getAccountInfo(new PublicKey(endereco), "finalized"));
}

/** Saldo, em SOL, da chave que paga as taxas. */
export async function saldoDaChaveDeMint(): Promise<number> {
  const chave = chaveDeMint();
  if (!chave) return 0;
  return (await conexaoNft().getBalance(chave.publicKey, "confirmed")) / LAMPORTS_PER_SOL;
}

/**
 * O resultado, ou null se o RPC falhar ou passar de `ms`. Para o que a tela só
 * mostra (saldos): a página não pode ficar esperando a rede.
 */
function comPrazo<T>(consulta: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((pronto) => {
    const relogio = setTimeout(() => pronto(null), ms);
    consulta
      .then(pronto, () => pronto(null))
      .finally(() => clearTimeout(relogio));
  });
}

/** Saldo de uma carteira nesta rede, em SOL. null = a rede não respondeu a tempo. */
export async function saldoDaCarteira(endereco: string): Promise<number | null> {
  let chave: PublicKey;
  try {
    chave = new PublicKey(endereco);
  } catch {
    return null;
  }
  const lamports = await comPrazo(conexaoNft().getBalance(chave, "confirmed"), 4_000);
  return lamports === null ? null : lamports / LAMPORTS_PER_SOL;
}

/**
 * A chave de mint tem saldo para mintar agora? É isso — e não o saldo de quem
 * minta — que decide se o mint sai: quem paga a taxa da rede é ela.
 * null = a rede não respondeu (o mint confere de novo na hora).
 */
export async function chaveDeMintComSaldo(): Promise<boolean | null> {
  const saldo = await comPrazo(saldoDaChaveDeMint(), 4_000);
  return saldo === null ? null : saldo >= saldoMinimoNft();
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Transmite e acompanha por até `ms`, retransmitindo de tempos em tempos (a
 * rede pode perder a primeira). Volta assim que a transação chega a `ate`, ou
 * com a última situação vista.
 */
export async function transmitirEAcompanhar(
  bytes: Uint8Array,
  assinatura: string,
  ms: number,
  ate: "pendente" | "finalizada",
): Promise<Situacao> {
  const fim = Date.now() + ms;
  let situacao: Situacao = "sem_registro";
  let proximoEnvio = 0;
  while (Date.now() < fim) {
    if (situacao === "sem_registro" && Date.now() >= proximoEnvio) {
      await transmitir(bytes).catch((e) =>
        console.warn("[nft] retransmissão:", (e as Error).message),
      );
      proximoEnvio = Date.now() + 4_000;
    }
    await dormir(2_000);
    try {
      situacao = await situacaoDaTransacao(assinatura);
    } catch (e) {
      console.warn("[nft] consulta da transação:", (e as Error).message);
      continue;
    }
    if (situacao === "revertida" || situacao === "finalizada") return situacao;
    if (situacao === "pendente" && ate === "pendente") return situacao;
  }
  return situacao;
}
