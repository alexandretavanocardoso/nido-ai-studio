import type { RedeUsdc } from "./redes-usdc";

/**
 * USDC nas redes EVM (Ethereum, Base, Arbitrum, BNB Chain).
 *
 * A cobrança é o preço mais alguns centavos que a tornam única entre as
 * cobranças em aberto da rede (2 casas). Depois de pagar, o usuário cola o
 * hash da transação (ou o link do explorer); o servidor lê o recibo na rede e
 * confere: foi para a carteira da NIDO, em USDC, com o valor exato, dentro da
 * janela da cobrança e com confirmações. Como o valor é único, o hash de um
 * pagamento alheio não serve para outra cobrança. A mesma transação nunca paga duas
 * cobranças (índice único da assinatura).
 *
 * Env: EVM_MERCHANT_WALLET (0x…, a mesma em todas as redes) e o RPC de cada
 * rede: ETHEREUM_RPC_URL, BASE_RPC_URL, ARBITRUM_RPC_URL, BSC_RPC_URL.
 */
export type RedeEvm = Exclude<RedeUsdc, "solana">;

interface ConfigRede {
  chainId: number;
  /** Contrato do USDC nativo da rede (na BNB Chain é o USDC "Binance-Peg", 18 casas). */
  usdc: string;
  decimais: number;
  env: string;
  /** Blocos de espera antes de considerar a transferência confirmada. */
  confirmacoes: number;
}

export const REDES_EVM: Record<RedeEvm, ConfigRede> = {
  ethereum: {
    chainId: 1,
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimais: 6,
    env: "ETHEREUM_RPC_URL",
    confirmacoes: 3,
  },
  base: {
    chainId: 8453,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimais: 6,
    env: "BASE_RPC_URL",
    confirmacoes: 5,
  },
  arbitrum: {
    chainId: 42161,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimais: 6,
    env: "ARBITRUM_RPC_URL",
    confirmacoes: 20,
  },
  bnb: {
    chainId: 56,
    usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    decimais: 18,
    env: "BSC_RPC_URL",
    confirmacoes: 5,
  },
};

/** keccak256("Transfer(address,address,uint256)") */
const TOPICO_TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const carteiraEvm = () => process.env.EVM_MERCHANT_WALLET?.trim() ?? "";
const rpcDaRede = (rede: RedeEvm) =>
  process.env[REDES_EVM[rede].env]?.trim() ?? "";

/** Redes EVM com carteira e RPC configurados (o RPC público é só reserva). */
export function redesEvmAtivas(): RedeEvm[] {
  if (!/^0x[0-9a-fA-F]{40}$/.test(carteiraEvm())) return [];
  return (Object.keys(REDES_EVM) as RedeEvm[]).filter((r) => !!rpcDaRede(r));
}

/** Valor em micro-USDC (6 casas) → unidades mínimas do token na rede. */
export function unidadesDoToken(micro: bigint, rede: RedeEvm): bigint {
  return micro * BigInt(10) ** BigInt(REDES_EVM[rede].decimais - 6);
}

/** Preço (+ centavos extras para desempatar) em micro-USDC, sempre com 2 casas. */
export function microDoPreco(valorUSD: number, centavosExtras = 0): bigint {
  return (
    (BigInt(Math.round(valorUSD * 100)) + BigInt(centavosExtras)) *
    BigInt(10_000)
  );
}

export const microParaNumero = (micro: bigint) => Number(micro) / 1e6;

/** Link EIP-681 (MetaMask, Rabby, Coinbase Wallet, Trust…): token, rede e valor já preenchidos. */
export function linkEip681(rede: RedeEvm, micro: bigint): string {
  const c = REDES_EVM[rede];
  return `ethereum:${c.usdc}@${c.chainId}/transfer?address=${carteiraEvm()}&uint256=${unidadesDoToken(micro, rede)}`;
}

/** O que a carteira conectada do usuário assina para pagar: a chamada no contrato do USDC. */
export interface TransferenciaEvm {
  chainId: number;
  /** Contrato do USDC nesta rede. */
  para: string;
  /** `transfer(carteira da NIDO, valor)` já codificado. */
  dados: string;
}

export function transferenciaUsdc(
  rede: RedeEvm,
  micro: bigint,
): TransferenciaEvm {
  const c = REDES_EVM[rede];
  const palavra = (hex: string) => hex.padStart(64, "0");
  return {
    chainId: c.chainId,
    para: c.usdc,
    // 0xa9059cbb = transfer(address,uint256)
    dados:
      "0xa9059cbb" +
      palavra(carteiraEvm().slice(2).toLowerCase()) +
      palavra(unidadesDoToken(micro, rede).toString(16)),
  };
}

/**
 * RPCs públicos de reserva (sem chave). Usado quando o RPC do .env
 * falha por HTTP/rede — ex.: allowlist de origem no provedor (Ankr "Origin not allowed").
 */
export const RPC_PUBLICO: Record<RedeEvm, string[]> = {
  ethereum: ["https://ethereum-rpc.publicnode.com"],
  base: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
  arbitrum: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
  ],
  bnb: ["https://bsc-rpc.publicnode.com"],
};

/** RPCs que falharam recentemente: pula por 5 min (evita esperar o 403 a cada consulta). */
const falhouEm = new Map<string, number>();

async function rpc<T>(
  rede: RedeEvm,
  method: string,
  params: unknown[],
): Promise<T> {
  const urls = [rpcDaRede(rede), ...RPC_PUBLICO[rede]].filter(
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
        `[evm] RPC ${rede} (${new URL(url).host}) falhou: ${ultimoErro}`,
      );
      continue;
    }
    // Erro do próprio método (ex.: intervalo grande demais no eth_getLogs): quem chamou decide.
    if (body.error) throw new Error(`RPC ${rede}: ${body.error.message}`);
    return body.result as T;
  }
  throw new Error(`RPC ${rede}: ${ultimoErro || "sem RPC disponível"}`);
}

export async function blocoAtual(rede: RedeEvm): Promise<bigint> {
  return BigInt(await rpc<string>(rede, "eth_blockNumber", []));
}

interface LogRecibo {
  address: string;
  data: string;
  /** [Transfer, de (remetente), para] — endereços com 32 bytes. */
  topics: string[];
  removed?: boolean;
}

const topicoComoEndereco = (t?: string) =>
  t && t.length >= 42 ? ("0x" + t.slice(-40)).toLowerCase() : null;

/** Hash da transação (0x + 64 hex) dentro do que o usuário colou: hash puro ou link do explorer. */
export function hashDaTransacao(entrada: string): string | null {
  const m = entrada.trim().match(/0x[0-9a-fA-F]{64}/);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Soma o USDC que a transação mandou para a carteira da NIDO e diz quem
 * mandou. Só conta eventos Transfer do contrato USDC desta rede.
 */
export function recebidoNaTransacao(
  logs: LogRecibo[],
  rede: RedeEvm,
  carteira: string,
): { unidades: bigint; pagador: string | null } {
  const usdc = REDES_EVM[rede].usdc.toLowerCase();
  const destino = carteira.toLowerCase();
  let unidades = BigInt(0);
  let pagador: string | null = null;
  for (const l of logs) {
    if (l.removed || l.address?.toLowerCase() !== usdc) continue;
    if (l.topics?.[0]?.toLowerCase() !== TOPICO_TRANSFER) continue;
    if (topicoComoEndereco(l.topics[2]) !== destino) continue;
    if (!l.data || l.data === "0x") continue;
    unidades += BigInt(l.data);
    pagador ??= topicoComoEndereco(l.topics[1]);
  }
  return { unidades, pagador };
}

export type ResultadoTx =
  | { ok: true; pagador: string | null; quando: Date }
  | { ok: false; aguardar?: boolean; erro: string };

/**
 * Confere uma transação colada pelo usuário: existe nesta rede, deu certo,
 * tem confirmações, mandou exatamente `micro` em USDC para a carteira da
 * NIDO e aconteceu dentro da janela da cobrança [desde, ate].
 */
export async function conferirTransacao(
  rede: RedeEvm,
  hash: string,
  micro: bigint,
  janela: { desde: Date; ate: Date },
): Promise<ResultadoTx> {
  const c = REDES_EVM[rede];
  const nome = {
    ethereum: "Ethereum",
    base: "Base",
    arbitrum: "Arbitrum",
    bnb: "BNB Chain",
  }[rede];
  const recibo = await rpc<{
    status: string;
    blockNumber: string;
    logs: LogRecibo[];
  } | null>(rede, "eth_getTransactionReceipt", [hash]);
  if (!recibo)
    return {
      ok: false,
      aguardar: true,
      erro: `Transação não encontrada na rede ${nome}. Confira se pagou nesta rede — ou, se acabou de enviar, aguarde alguns segundos e tente de novo.`,
    };
  if (recibo.status !== "0x1")
    return {
      ok: false,
      erro: "Esta transação falhou na rede (status de erro).",
    };

  const bloco = BigInt(recibo.blockNumber);
  const atual = await blocoAtual(rede);
  if (atual - bloco < BigInt(c.confirmacoes))
    return {
      ok: false,
      aguardar: true,
      erro: "Transação encontrada — aguardando confirmações da rede. Tente de novo em instantes.",
    };

  const { unidades, pagador } = recebidoNaTransacao(
    recibo.logs ?? [],
    rede,
    carteiraEvm(),
  );
  const esperado = unidadesDoToken(micro, rede);
  if (unidades === BigInt(0))
    return {
      ok: false,
      erro: "Esta transação não enviou USDC para a carteira da NIDO.",
    };
  // Valor exato: é ele que liga a transação a esta cobrança (ver criarPagamentoUsdc).
  if (unidades !== esperado) {
    const pago = Number(unidades / BigInt(10) ** BigInt(c.decimais - 6)) / 1e6;
    return {
      ok: false,
      erro: `Valor enviado: ${pago.toFixed(2)} USDC. Esta cobrança é de exatamente ${(Number(micro) / 1e6).toFixed(2)} USDC.`,
    };
  }

  const blocoInfo = await rpc<{ timestamp: string } | null>(
    rede,
    "eth_getBlockByNumber",
    [recibo.blockNumber, false],
  );
  if (!blocoInfo)
    return {
      ok: false,
      aguardar: true,
      erro: "Não consegui ler o horário da transação. Tente de novo.",
    };
  const quando = new Date(Number(BigInt(blocoInfo.timestamp)) * 1000);
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

  return { ok: true, pagador, quando };
}
