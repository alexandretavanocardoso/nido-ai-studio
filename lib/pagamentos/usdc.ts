import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { getPool } from "@/lib/db";
import { PACOTES, precoAvulso, precoPlano } from "@/lib/planos";
import { aplicarCompra, lerCompra, type Compra } from "./aplicar";
import {
  carteiraEvm,
  conferirTransacao,
  hashDaTransacao,
  linkEip681,
  microDoPreco,
  redesEvmAtivas,
  type RedeEvm,
} from "./evm";
import type { RedeUsdc } from "./redes-usdc";

/**
 * Pagamento em USDC — Solana (Solana Pay) ou redes EVM (ver ./evm.ts).
 * Sempre pré-pago (não existe débito recorrente on-chain).
 *
 * Cada pagamento recebe uma "referência" única (endereço aleatório) que a
 * carteira inclui na transação. O servidor acha a transação por essa
 * referência e confere, no próprio bloco, que a carteira da NIDO recebeu o
 * valor em USDC. Sem intermediário e sem taxa além da rede.
 *
 * Env: SOLANA_MERCHANT_WALLET (carteira que recebe), SOLANA_RPC_URL (opcional),
 * SOLANA_USDC_MINT (opcional; padrão = USDC da mainnet).
 */
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DECIMAIS = 6;
/** Depois disso sem pagamento, a cobrança expira e o usuário gera outra. */
const VALIDADE_HORAS = 24;
/** Folga para relógios: a transação pode ter até isso antes da criação da cobrança. */
const FOLGA_MS = 2 * 60_000;

const rpcUrl = () =>
  process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
const mint = () => process.env.SOLANA_USDC_MINT?.trim() || USDC_MAINNET;
const carteira = () => process.env.SOLANA_MERCHANT_WALLET?.trim() || "";

const ALFABETO = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (formato dos endereços Solana). */
export function base58(bytes: Uint8Array): string {
  let n = BigInt("0x" + (Buffer.from(bytes).toString("hex") || "0"));
  let s = "";
  while (n > BigInt(0)) {
    s = ALFABETO[Number(n % BigInt(58))] + s;
    n /= BigInt(58);
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}

export function valorUSD(compra: Compra): number {
  if (compra.tipo === "pacote") return PACOTES[compra.pacote].precoUSD;
  if (compra.tipo === "avulso") return precoAvulso(compra.creditos, "USD");
  return precoPlano(compra.plano, compra.intervalo, "USD");
}

/** Link do Solana Pay (transfer request). */
export function linkSolanaPay(o: {
  valor: number;
  referencia: string;
  id: string;
  rotulo: string;
}): string {
  const params = new URLSearchParams({
    amount: o.valor.toFixed(2),
    "spl-token": mint(),
    reference: o.referencia,
    label: "NIDO Studio",
    message: o.rotulo,
    memo: o.id,
  });
  return `solana:${carteira()}?${params.toString()}`;
}

/** Redes com carteira (e RPC, nas EVM) configurados neste deploy. */
export function redesUsdcAtivas(): RedeUsdc[] {
  return [
    ...(carteira() ? (["solana"] as RedeUsdc[]) : []),
    ...redesEvmAtivas(),
  ];
}

export interface CobrancaUsdc {
  id: string;
  rede: RedeUsdc;
  valor: number;
  /** Valor exato a pagar, com todas as casas (nas EVM os últimos dígitos identificam o pagamento). */
  valorTexto: string;
  link: string;
  qr: string;
  carteira: string;
  expiraEm: string;
}

export async function criarPagamentoUsdc(
  userId: string,
  compra: Compra,
  rotulo: string,
  rede: RedeUsdc = "solana",
): Promise<CobrancaUsdc> {
  const id = `usdc_${nanoid(16)}`;
  const pool = getPool()!;
  const preco = valorUSD(compra);
  let valorTexto = preco.toFixed(2);
  let referencia: string | null = null;
  let link: string;

  if (rede === "solana") {
    referencia = base58(randomBytes(32));
    link = linkSolanaPay({ valor: preco, referencia, id, rotulo });
  } else {
    // Sempre o preço exato (2 casas): quem pagou é provado pelo hash da transação.
    const micro = microDoPreco(preco);
    link = linkEip681(rede, micro);
  }

  await pool.query(
    `insert into pagamentos (id, user_id, provedor, tipo, plano, intervalo, pacote, creditos, valor, moeda, referencia, rede)
     values ($1, $2, 'usdc', $3, $4, $5, $6, $7, $8, 'USD', $9, $10)`,
    [
      id,
      userId,
      compra.tipo,
      compra.tipo === "plano" ? compra.plano : null,
      compra.tipo === "plano" ? compra.intervalo : null,
      compra.tipo === "pacote" ? compra.pacote : null,
      compra.tipo === "avulso" ? compra.creditos : null,
      valorTexto,
      referencia,
      rede,
    ],
  );
  return {
    id,
    rede,
    valor: Number(valorTexto),
    valorTexto,
    link,
    qr: await QRCode.toDataURL(link, { margin: 1, width: 320 }),
    carteira: rede === "solana" ? carteira() : carteiraEvm(),
    expiraEm: new Date(Date.now() + VALIDADE_HORAS * 3600_000).toISOString(),
  };
}

/** 15003721n → "15.003721" */
export function textoMicro(micro: bigint): string {
  const s = micro.toString().padStart(7, "0");
  return `${s.slice(0, -6)}.${s.slice(-6)}`;
}

/** "15.003721" → 15003721n (sem passar por float). */
export function microDoTexto(valor: string): bigint {
  const [int, dec = ""] = valor.split(".");
  return BigInt(int) * BigInt(1_000_000) + BigInt((dec + "000000").slice(0, 6));
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as {
    result?: T;
    error?: { message: string };
  };
  if (body.error) throw new Error(`Solana RPC: ${body.error.message}`);
  return body.result as T;
}

interface SaldoToken {
  owner?: string;
  mint: string;
  uiTokenAmount: { amount: string };
}

/** Quanto (em unidades mínimas de USDC) a carteira da NIDO recebeu na transação. */
export function recebido(
  meta: { preTokenBalances?: SaldoToken[]; postTokenBalances?: SaldoToken[] },
  dono: string,
  mintUsdc: string,
): bigint {
  const soma = (lista?: SaldoToken[]) =>
    (lista ?? [])
      .filter((b) => b.owner === dono && b.mint === mintUsdc)
      .reduce((t, b) => t + BigInt(b.uiTokenAmount.amount), BigInt(0));
  return soma(meta.postTokenBalances) - soma(meta.preTokenBalances);
}

type Status = "pendente" | "pago" | "expirado";

/** Procura a transação na blockchain; se achou e o valor bate, aplica a compra. */
export async function verificarPagamentoUsdc(
  id: string,
  userId: string,
): Promise<Status> {
  const pool = getPool()!;
  const { rows } = await pool.query<{
    status: Status;
    referencia: string;
    valor: string;
    tipo: string;
    plano: string | null;
    intervalo: string | null;
    pacote: string | null;
    creditos: number | null;
    rede: RedeUsdc | null;
    created_at: Date;
    expirou: boolean;
  }>(
    `select status, referencia, valor::text as valor, tipo, plano, intervalo, pacote, creditos, rede, created_at,
            created_at < now() - interval '${VALIDADE_HORAS} hours' as expirou
     from pagamentos where id = $1 and user_id = $2 and provedor = 'usdc'`,
    [id, userId],
  );
  const p = rows[0];
  if (!p) throw new Error("Pagamento não encontrado.");
  if (p.status !== "pendente") return p.status;

  // Marca como pago (uma vez só; a mesma transação não paga dois pedidos).
  async function marcarPago(
    assinatura: string,
    pagador: string | null = null,
  ): Promise<boolean> {
    let rowCount: number | null = 0;
    try {
      ({ rowCount } = await pool.query(
        `update pagamentos set status = 'pago', assinatura = $2, pagador = $3, pago_em = now()
         where id = $1 and status = 'pendente'`,
        [id, assinatura, pagador],
      ));
    } catch {
      return false; // transação já usada em outro pagamento (índice único)
    }
    if (rowCount) {
      const compra = lerCompra(p);
      if (compra) await aplicarCompra(userId, compra, { ref: id, usdc: true });
    }
    return true;
  }

  // EVM: só confirma quando o usuário cola o hash (confirmarTxUsdc).
  if (p.rede && p.rede !== "solana") return expirarSePassou();

  const esperado = BigInt(Math.round(Number(p.valor) * 10 ** DECIMAIS));
  const assinaturas = await rpc<Array<{ signature: string; err: unknown }>>(
    "getSignaturesForAddress",
    [p.referencia, { limit: 10, commitment: "confirmed" }],
  );

  for (const { signature, err } of assinaturas ?? []) {
    if (err) continue;
    const tx = await rpc<{
      meta: {
        err: unknown;
        preTokenBalances?: SaldoToken[];
        postTokenBalances?: SaldoToken[];
      };
    } | null>("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (!tx || tx.meta.err) continue;
    if (recebido(tx.meta, carteira(), mint()) < esperado) continue;
    if (await marcarPago(signature)) return "pago";
  }
  return expirarSePassou();

  async function expirarSePassou(): Promise<Status> {
    if (!p.expirou) return "pendente";
    await pool.query(
      "update pagamentos set status = 'expirado' where id = $1 and status = 'pendente'",
      [id],
    );
    return "expirado";
  }
}

export type RespostaTx =
  | { status: "pago" }
  | { status: "pendente" | "expirado"; erro: string; aguardar?: boolean };

/**
 * EVM: o usuário colou o hash (ou o link do explorer) da transação. Confere na
 * rede da cobrança — valor, destino, horário — e, se bater, aplica a compra.
 */
export async function confirmarTxUsdc(
  id: string,
  userId: string,
  entrada: string,
): Promise<RespostaTx> {
  const hash = hashDaTransacao(entrada);
  if (!hash)
    return {
      status: "pendente",
      erro: "Cole o hash da transação (0x… com 64 caracteres) ou o link dela no explorer.",
    };
  const pool = getPool()!;
  const { rows } = await pool.query<{
    status: Status;
    valor: string;
    tipo: string;
    plano: string | null;
    intervalo: string | null;
    pacote: string | null;
    creditos: number | null;
    rede: RedeUsdc | null;
    created_at: Date;
  }>(
    `select status, valor::text as valor, tipo, plano, intervalo, pacote, creditos, rede, created_at
     from pagamentos where id = $1 and user_id = $2 and provedor = 'usdc'`,
    [id, userId],
  );
  const p = rows[0];
  if (!p) throw new Error("Pagamento não encontrado.");
  if (p.status === "pago") return { status: "pago" };
  if (!p.rede || p.rede === "solana")
    return {
      status: "pendente",
      erro: "Na Solana a confirmação é automática.",
    };
  const rede = p.rede as RedeEvm;
  const assinatura = `${rede}:${hash}`;

  const { rows: usada } = await pool.query(
    "select 1 from pagamentos where assinatura = $1 limit 1",
    [assinatura],
  );
  if (usada.length)
    return {
      status: "pendente",
      erro: "Esta transação já foi usada em outro pagamento.",
    };

  const inicio = new Date(p.created_at);
  const r = await conferirTransacao(rede, hash, microDoTexto(p.valor), {
    desde: new Date(inicio.getTime() - FOLGA_MS),
    ate: new Date(inicio.getTime() + VALIDADE_HORAS * 3600_000),
  });
  if (!r.ok)
    return {
      status: p.status === "expirado" ? "expirado" : "pendente",
      erro: r.erro,
      aguardar: r.aguardar,
    };

  let rowCount: number | null = 0;
  try {
    ({ rowCount } = await pool.query(
      `update pagamentos set status = 'pago', assinatura = $2, pagador = $3, pago_em = now()
       where id = $1 and status in ('pendente', 'expirado')`,
      [id, assinatura, r.pagador],
    ));
  } catch {
    return {
      status: "pendente",
      erro: "Esta transação já foi usada em outro pagamento.",
    };
  }
  if (rowCount) {
    const compra = lerCompra(p);
    if (compra) await aplicarCompra(userId, compra, { ref: id, usdc: true });
  }
  return { status: "pago" };
}
