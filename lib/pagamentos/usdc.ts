import { randomBytes } from "node:crypto";
import type { PoolClient } from "@neondatabase/serverless";
import { PublicKey, Transaction } from "@solana/web3.js";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { getPool } from "@/lib/db";
import { contaDeToken, instrucaoTransferir } from "@/lib/indicacao/onchain";
import { PACOTES, precoAvulso, precoPlano } from "@/lib/planos";
import { aplicarCompra, lerCompra, type Compra } from "./aplicar";
import {
  carteiraEvm,
  conferirTransacao,
  hashDaTransacao,
  linkEip681,
  microDoPreco,
  microParaNumero,
  redesEvmAtivas,
  transferenciaUsdc,
  type ResultadoTx,
  type TransferenciaEvm,
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
 * Quem paga sem a referência (corretora, envio manual, carteira que não leu o
 * QR) cola o link/hash da transação, como nas EVM: aí o que liga a transação à
 * cobrança é o valor exato, único entre as cobranças em aberto.
 *
 * Env: SOLANA_MERCHANT_WALLET (carteira que recebe), SOLANA_RPC_URL (opcional;
 * se falhar, cai no RPC público da rede),
 * SOLANA_USDC_MINT (opcional; padrão = USDC da mainnet).
 */
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DECIMAIS = 6;
/** Depois disso sem pagamento, a cobrança expira e o usuário gera outra. */
const VALIDADE_HORAS = 24;
/** Folga para relógios: a transação pode ter até isso antes da criação da cobrança. */
const FOLGA_MS = 2 * 60_000;

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
  /** Valor exato a pagar, com todas as casas (os últimos dígitos identificam o pagamento). */
  valorTexto: string;
  link: string;
  qr: string;
  carteira: string;
  /** EVM: a transferência pronta para a carteira conectada assinar. */
  evm?: TransferenciaEvm;
  expiraEm: string;
}

/** Reabrir o modal dentro disto devolve a mesma cobrança em aberto, em vez de criar outra. */
const REUSO_HORAS = 12;

export async function criarPagamentoUsdc(
  userId: string,
  compra: Compra,
  rotulo: string,
  rede: RedeUsdc = "solana",
): Promise<CobrancaUsdc> {
  const preco = valorUSD(compra);
  const item = [
    compra.tipo,
    compra.tipo === "plano" ? compra.plano : null,
    compra.tipo === "plano" ? compra.intervalo : null,
    compra.tipo === "pacote" ? compra.pacote : null,
    compra.tipo === "avulso" ? compra.creditos : null,
  ];
  let c: { id: string; valor: string; referencia: string | null; criada: Date };

  const cliente = await getPool()!.connect();
  try {
    await cliente.query("begin");
    // Uma cobrança por vez em cada rede. Sem a trava, duas criadas no mesmo
    // instante (o próprio modal manda dois pedidos em desenvolvimento) leem os
    // mesmos centavos livres e ficam com o mesmo valor.
    await cliente.query("select pg_advisory_xact_lock(hashtext($1))", [
      `usdc:${rede}`,
    ]);
    // A mesma compra, na mesma rede, ainda em aberto: é ela que volta. Cada
    // abertura do modal criando outra gastaria um valor único por vez.
    const { rows } = await cliente.query<{
      id: string;
      valor: string;
      referencia: string | null;
      created_at: Date;
    }>(
      `select id, valor::text as valor, referencia, created_at from pagamentos
       where user_id = $1 and provedor = 'usdc' and rede = $2 and status = 'pendente'
         and tipo = $3 and plano is not distinct from $4 and intervalo is not distinct from $5
         and pacote is not distinct from $6 and creditos is not distinct from $7
         and valor >= $8 and valor < $8::numeric + 1
         and created_at > now() - interval '${REUSO_HORAS} hours'
       order by valor, created_at desc limit 1`,
      [userId, rede, ...item, preco.toFixed(2)],
    );
    const aberta = rows[0];
    if (aberta && (rede !== "solana" || aberta.referencia)) {
      c = { ...aberta, criada: aberta.created_at };
    } else {
      // O hash da transação é público: para ninguém confirmar a cobrança com o
      // pagamento de outra pessoa, cada cobrança em aberto na rede tem um valor
      // único (o preço + alguns centavos) e só vale a transação com esse valor exato.
      // Na Solana a referência já identifica o pagamento feito pelo QR; o valor
      // único cobre quem paga sem ela e cola a transação.
      const extra = await centavosLivres(cliente, rede, preco);
      const valor = microParaNumero(microDoPreco(preco, extra)).toFixed(2);
      const id = `usdc_${nanoid(16)}`;
      const referencia = rede === "solana" ? base58(randomBytes(32)) : null;
      const { rows: criadas } = await cliente.query<{ created_at: Date }>(
        `insert into pagamentos (id, user_id, provedor, tipo, plano, intervalo, pacote, creditos, valor, moeda, referencia, rede)
         values ($1, $2, 'usdc', $3, $4, $5, $6, $7, $8, 'USD', $9, $10)
         returning created_at`,
        [id, userId, ...item, valor, referencia, rede],
      );
      c = { id, valor, referencia, criada: criadas[0].created_at };
    }
    await cliente.query("commit");
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }

  const micro = microDoTexto(c.valor);
  const link =
    rede === "solana"
      ? linkSolanaPay({
          valor: microParaNumero(micro),
          referencia: c.referencia!,
          id: c.id,
          rotulo,
        })
      : linkEip681(rede, micro);
  return {
    id: c.id,
    rede,
    valor: microParaNumero(micro),
    valorTexto: microParaNumero(micro).toFixed(2),
    link,
    qr: await QRCode.toDataURL(link, { margin: 1, width: 320 }),
    carteira: rede === "solana" ? carteira() : carteiraEvm(),
    ...(rede === "solana" ? {} : { evm: transferenciaUsdc(rede, micro) }),
    expiraEm: new Date(
      new Date(c.criada).getTime() + VALIDADE_HORAS * 3600_000,
    ).toISOString(),
  };
}

/**
 * Menor número de centavos extras (0–99) que deixa o valor diferente de toda
 * cobrança ainda não paga nesta rede. Vale para as últimas VALIDADE_HORAS + 1
 * horas, que é enquanto uma transação ainda pode confirmar uma cobrança.
 * Roda dentro da transação que segura a trava da rede (criarPagamentoUsdc).
 */
async function centavosLivres(
  db: Pick<PoolClient, "query">,
  rede: RedeUsdc,
  preco: number,
): Promise<number> {
  const { rows } = await db.query<{ valor: string }>(
    `select valor::text as valor from pagamentos
     where provedor = 'usdc' and rede = $1 and status in ('pendente', 'expirado')
       and created_at > now() - interval '${VALIDADE_HORAS + 1} hours'
       and valor >= $2 and valor < $2::numeric + 1`,
    [rede, preco.toFixed(2)],
  );
  const usados = new Set(
    rows.map((r) => Math.round((Number(r.valor) - preco) * 100)),
  );
  for (let extra = 0; extra < 100; extra++)
    if (!usados.has(extra)) return extra;
  throw new Error("Muitas cobranças em aberto nesta rede; tente outra rede.");
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

/**
 * RPC público de reserva (sem chave), usado quando o do .env falha por
 * HTTP/rede — ex.: allowlist de origem no provedor (Ankr "Origin not allowed").
 * Tem limite de uso baixo: em produção, o do .env precisa funcionar.
 */
const rpcPublico = () =>
  mint() === USDC_MAINNET
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";

/** RPCs que falharam há pouco: pula por 5 min (evita esperar o 403 a cada consulta). */
const falhouEm = new Map<string, number>();

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const urls = [process.env.SOLANA_RPC_URL?.trim() ?? "", rpcPublico()].filter(
    (u, i, a) => !!u && a.indexOf(u) === i,
  );
  const disponiveis = urls.filter(
    (u) => Date.now() - (falhouEm.get(u) ?? 0) > 300_000,
  );
  let ultimoErro = "";
  for (const url of disponiveis.length ? disponiveis : urls) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      falhouEm.set(url, Date.now());
      ultimoErro = (e as Error).message;
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as {
      result?: T;
      error?: { message: string };
    };
    if (!res.ok) {
      // Erro do provedor (403 de allowlist, 429, 5xx): tenta o próximo RPC.
      falhouEm.set(url, Date.now());
      ultimoErro = body.error?.message ?? `HTTP ${res.status}`;
      console.warn(
        `[usdc] RPC Solana (${new URL(url).host}) falhou: ${ultimoErro}`,
      );
      continue;
    }
    // Erro do próprio método (ex.: conta de token que não existe): quem chamou decide.
    if (body.error) throw new Error(`Solana RPC: ${body.error.message}`);
    return body.result as T;
  }
  throw new Error(`Solana RPC: ${ultimoErro || "sem RPC disponível"}`);
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

interface TransacaoSolana {
  blockTime?: number | null;
  meta: {
    err: unknown;
    preTokenBalances?: SaldoToken[];
    postTokenBalances?: SaldoToken[];
  } | null;
  transaction: { message: { accountKeys: Array<{ pubkey: string }> } };
}

/** Lê a transação já definitiva ("finalized"); nulo se a rede ainda não a tem. */
const lerTransacao = (assinatura: string) =>
  rpc<TransacaoSolana | null>("getTransaction", [
    assinatura,
    {
      encoding: "jsonParsed",
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    },
  ]);

/** Assinatura da transação (base58, 64 bytes) dentro do que o usuário colou: pura ou no link do explorer. */
export function assinaturaDaTransacao(entrada: string): string | null {
  const m = entrada
    .trim()
    .match(
      new RegExp(`(?<![${ALFABETO}])[${ALFABETO}]{86,88}(?![${ALFABETO}])`),
    );
  return m ? m[0] : null;
}

/**
 * Confere uma transação colada pelo usuário: deu certo, a carteira da NIDO
 * recebeu o USDC e foi dentro da janela da cobrança [desde, ate]. Com a
 * referência da cobrança (paga pelo QR), basta cobrir o valor; sem ela, só
 * vale o valor exato — é ele que liga a transação a esta cobrança.
 */
export function conferirTransacaoSolana(
  tx: TransacaoSolana | null,
  micro: bigint,
  referencia: string | null,
  janela: { desde: Date; ate: Date },
): ResultadoTx {
  if (!tx?.meta)
    return {
      ok: false,
      aguardar: true,
      erro: "Transação não encontrada na rede Solana. Confira se pagou nesta rede — ou, se acabou de enviar, aguarde alguns segundos e tente de novo.",
    };
  if (tx.meta.err)
    return {
      ok: false,
      erro: "Esta transação falhou na rede (status de erro).",
    };

  const pago = recebido(tx.meta, carteira(), mint());
  if (pago <= BigInt(0))
    return {
      ok: false,
      erro: "Esta transação não enviou USDC para a carteira da NIDO.",
    };
  const comReferencia =
    !!referencia &&
    tx.transaction.message.accountKeys.some((k) => k.pubkey === referencia);
  if (comReferencia ? pago < micro : pago !== micro)
    return {
      ok: false,
      erro: `Valor enviado: ${(Number(pago) / 1e6).toFixed(2)} USDC. Esta cobrança é de exatamente ${(Number(micro) / 1e6).toFixed(2)} USDC.`,
    };

  if (tx.blockTime == null)
    return {
      ok: false,
      aguardar: true,
      erro: "Não consegui ler o horário da transação. Tente de novo.",
    };
  const quando = new Date(tx.blockTime * 1000);
  if (quando < janela.desde)
    return {
      ok: false,
      erro: "Esta transação é anterior à cobrança — use a transação feita para este pagamento.",
    };
  if (quando > janela.ate)
    return {
      ok: false,
      erro: "Esta transação foi feita depois que a cobrança expirou.",
    };

  return { ok: true, pagador: null, quando };
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
    [p.referencia, { limit: 10, commitment: "finalized" }],
  );

  for (const { signature, err } of assinaturas ?? []) {
    if (err) continue;
    const tx = await lerTransacao(signature);
    if (!tx?.meta || tx.meta.err) continue;
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

/**
 * Transferência de USDC da carteira do usuário para a da NIDO, sem assinar —
 * a mesma que uma carteira montaria lendo o QR: a referência da cobrança vai
 * como chave só de leitura, e é por ela que o servidor acha o pagamento.
 * Devolve a transação serializada (base64) para a carteira assinar e enviar.
 */
export function montarPagamentoSolana(o: {
  pagador: string;
  destino: string;
  mint: string;
  micro: bigint;
  referencia: string;
  blockhash: string;
  lastValidBlockHeight: number;
}): string {
  const dono = new PublicKey(o.pagador);
  const usdc = new PublicKey(o.mint);
  const transferir = instrucaoTransferir(
    contaDeToken(usdc, dono),
    usdc,
    contaDeToken(usdc, new PublicKey(o.destino)),
    dono,
    o.micro,
    DECIMAIS,
  );
  transferir.keys.push({
    pubkey: new PublicKey(o.referencia),
    isSigner: false,
    isWritable: false,
  });
  return new Transaction({
    feePayer: dono,
    blockhash: o.blockhash,
    lastValidBlockHeight: o.lastValidBlockHeight,
  })
    .add(transferir)
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString("base64");
}

export type TransacaoDoPagamento =
  | { transacao: string; cadeia: "solana:mainnet" | "solana:devnet" }
  | { erro: string };

/**
 * Solana: prepara o pagamento da cobrança para a carteira conectada do
 * usuário (`pagador`) assinar e enviar. Confere antes se ela tem o USDC, para
 * a pessoa não ver só um erro da carteira.
 */
export async function transacaoDoPagamento(
  id: string,
  userId: string,
  pagador: string,
): Promise<TransacaoDoPagamento> {
  const { rows } = await getPool()!.query<{
    status: Status;
    referencia: string | null;
    valor: string;
    rede: RedeUsdc | null;
    expirou: boolean;
  }>(
    `select status, referencia, valor::text as valor, rede,
            created_at < now() - interval '${VALIDADE_HORAS} hours' as expirou
     from pagamentos where id = $1 and user_id = $2 and provedor = 'usdc'`,
    [id, userId],
  );
  const p = rows[0];
  if (!p) throw new Error("Pagamento não encontrado.");
  if (
    p.status !== "pendente" ||
    p.expirou ||
    !p.referencia ||
    (p.rede && p.rede !== "solana")
  )
    return { erro: "Esta cobrança não está mais em aberto. Feche e gere outra." };

  let origem: PublicKey;
  try {
    const dono = new PublicKey(pagador);
    if (!PublicKey.isOnCurve(dono.toBytes())) throw new Error();
    origem = contaDeToken(new PublicKey(mint()), dono);
  } catch {
    return { erro: "Endereço de carteira inválido para esta rede." };
  }

  const micro = microDoTexto(p.valor);
  let saldo = BigInt(0);
  try {
    const r = await rpc<{ value: { amount: string } }>(
      "getTokenAccountBalance",
      [origem.toBase58()],
    );
    saldo = BigInt(r.value.amount);
  } catch (e) {
    // Carteira que nunca teve USDC não tem a conta do token: saldo zero. O resto é falha da rede.
    if (!/could not find account/i.test((e as Error).message)) throw e;
  }
  if (saldo < micro)
    return {
      erro: `Esta carteira tem ${(Number(saldo) / 1e6).toFixed(2)} USDC na Solana. A cobrança é de ${(Number(micro) / 1e6).toFixed(2)} USDC.`,
    };

  const { value } = await rpc<{
    value: { blockhash: string; lastValidBlockHeight: number };
  }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
  return {
    transacao: montarPagamentoSolana({
      pagador,
      destino: carteira(),
      mint: mint(),
      micro,
      referencia: p.referencia,
      ...value,
    }),
    cadeia: mint() === USDC_MAINNET ? "solana:mainnet" : "solana:devnet",
  };
}

export type RespostaTx =
  | { status: "pago" }
  | { status: "pendente" | "expirado"; erro: string; aguardar?: boolean };

/**
 * O usuário colou o hash (ou o link do explorer) da transação. Confere na
 * rede da cobrança — valor, destino, horário — e, se bater, aplica a compra.
 * Nas EVM é o único jeito de confirmar; na Solana, o plano B da confirmação
 * automática.
 */
export async function confirmarTxUsdc(
  id: string,
  userId: string,
  entrada: string,
): Promise<RespostaTx> {
  const pool = getPool()!;
  const { rows } = await pool.query<{
    status: Status;
    referencia: string | null;
    valor: string;
    tipo: string;
    plano: string | null;
    intervalo: string | null;
    pacote: string | null;
    creditos: number | null;
    rede: RedeUsdc | null;
    created_at: Date;
  }>(
    `select status, referencia, valor::text as valor, tipo, plano, intervalo, pacote, creditos, rede, created_at
     from pagamentos where id = $1 and user_id = $2 and provedor = 'usdc'`,
    [id, userId],
  );
  const p = rows[0];
  if (!p) throw new Error("Pagamento não encontrado.");
  if (p.status === "pago") return { status: "pago" };
  const rede: RedeUsdc = p.rede ?? "solana";
  const hash =
    rede === "solana"
      ? assinaturaDaTransacao(entrada)
      : hashDaTransacao(entrada);
  if (!hash)
    return {
      status: "pendente",
      erro:
        rede === "solana"
          ? "Cole o hash da transação (a assinatura, com cerca de 88 caracteres) ou o link dela no explorer."
          : "Cole o hash da transação (0x… com 64 caracteres) ou o link dela no explorer.",
    };
  // Na Solana a assinatura é gravada pura, como na confirmação automática: a
  // mesma transação não vale pelos dois caminhos.
  const assinatura = rede === "solana" ? hash : `${rede}:${hash}`;

  const { rows: usada } = await pool.query<{ id: string }>(
    "select id from pagamentos where assinatura = $1 limit 1",
    [assinatura],
  );
  // A confirmação automática chegou antes: é esta mesma cobrança, já paga.
  if (usada[0]?.id === id) return { status: "pago" };
  if (usada.length)
    return {
      status: "pendente",
      erro: "Esta transação já foi usada em outro pagamento.",
    };

  const inicio = new Date(p.created_at);
  const micro = microDoTexto(p.valor);
  const janela = {
    desde: new Date(inicio.getTime() - FOLGA_MS),
    ate: new Date(inicio.getTime() + VALIDADE_HORAS * 3600_000),
  };
  const r =
    rede === "solana"
      ? conferirTransacaoSolana(
          await lerTransacao(hash),
          micro,
          p.referencia,
          janela,
        )
      : await conferirTransacao(rede, hash, micro, janela);
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
