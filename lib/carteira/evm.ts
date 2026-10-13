import {
  CarteiraError,
  recusouNaCarteira,
  respostaDaCarteira,
} from "@/lib/nft/carteira-navegador";
import type { TransferenciaEvm } from "@/lib/pagamentos/evm";
import type { CarteiraInstalada } from "./comum";

/**
 * Carteiras EVM do navegador (MetaMask, Rabby, Coinbase Wallet, Phantom…),
 * achadas pelo padrão EIP-6963, para pagar: conectar, trocar para a rede da
 * cobrança e enviar a transferência de USDC. Só no navegador.
 */
interface Provedor {
  request(a: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(evento: string, fn: (...a: unknown[]) => void): void;
  removeListener?(evento: string, fn: (...a: unknown[]) => void): void;
}
interface Anuncio {
  info: { rdns: string; name: string; icon: string };
  provider: Provedor;
}

/** Carteira antiga, que só se expõe em `window.ethereum` (sem EIP-6963). */
const INJETADA = "injetada";
const anunciadas = new Map<string, Anuncio>();
const ouvintes = new Set<() => void>();
let procurando = false;

/** Pede às extensões que se anunciem (elas também se anunciam sozinhas ao carregar). */
function procurar() {
  if (procurando || typeof window === "undefined") return;
  procurando = true;
  window.addEventListener("eip6963:announceProvider", (e) => {
    const a = (e as CustomEvent<Anuncio>).detail;
    if (!a?.info?.rdns || !a.provider || anunciadas.has(a.info.rdns)) return;
    anunciadas.set(a.info.rdns, a);
    ouvintes.forEach((fn) => fn());
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

const injetada = () =>
  typeof window === "undefined"
    ? undefined
    : (window as { ethereum?: Provedor }).ethereum;

function provedor(id: string): Provedor | undefined {
  procurar();
  return anunciadas.get(id)?.provider ?? (id === INJETADA ? injetada() : undefined);
}

export function carteirasEvm(): CarteiraInstalada[] {
  procurar();
  if (anunciadas.size)
    return [...anunciadas.values()].map((a) => ({
      id: a.info.rdns,
      nome: a.info.name,
      icone: a.info.icon,
    }));
  return injetada()
    ? [{ id: INJETADA, nome: "Carteira do navegador", icone: "" }]
    : [];
}

/** Avisa quando uma carteira aparece (extensões carregam depois da página). */
export function aoMudarCarteirasEvm(fn: () => void): () => void {
  procurar();
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/**
 * Conecta e devolve o endereço. `silencioso` não abre a janela da carteira: só
 * vale se o site já foi aprovado antes (devolve nulo se não foi).
 */
export async function conectarEvm(
  id: string,
  silencioso = false,
): Promise<string | null> {
  const p = provedor(id);
  if (!p) {
    if (silencioso) return null;
    throw new CarteiraError("Carteira não encontrada neste navegador.");
  }
  try {
    const contas = (await p.request({
      method: silencioso ? "eth_accounts" : "eth_requestAccounts",
    })) as string[] | null;
    if (contas?.[0]) return contas[0];
  } catch (e) {
    if (silencioso) return null;
    console.error("[carteira] conexão recusada:", e);
    throw recusouNaCarteira(e)
      ? new CarteiraError(
          "A conexão foi recusada na carteira. Clique de novo e aprove o pedido na janela dela.",
        )
      : new CarteiraError(
          "A carteira não conectou. Recarregue a página e tente de novo; se continuar, feche e abra o navegador.",
          respostaDaCarteira(e),
        );
  }
  if (silencioso) return null;
  throw new CarteiraError("A carteira não liberou nenhuma conta.");
}

/** Avisa quando a pessoa troca de conta (ou desconecta) na própria carteira. */
export function aoTrocarContaEvm(
  id: string,
  fn: (endereco: string | null) => void,
): () => void {
  const p = provedor(id);
  if (!p?.on) return () => {};
  const ouvir = (contas: unknown) => fn((contas as string[] | null)?.[0] ?? null);
  p.on("accountsChanged", ouvir);
  return () => p.removeListener?.("accountsChanged", ouvir);
}

const ETH = { name: "Ether", symbol: "ETH", decimals: 18 };

/** O que a carteira precisa para adicionar a rede, se ainda não a conhece. */
const CADEIAS: Record<
  number,
  {
    chainName: string;
    nativeCurrency: typeof ETH;
    rpcUrls: string[];
    blockExplorerUrls: string[];
  }
> = {
  1: {
    chainName: "Ethereum",
    nativeCurrency: ETH,
    rpcUrls: ["https://ethereum-rpc.publicnode.com"],
    blockExplorerUrls: ["https://etherscan.io"],
  },
  8453: {
    chainName: "Base",
    nativeCurrency: ETH,
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
  },
  42161: {
    chainName: "Arbitrum One",
    nativeCurrency: ETH,
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://arbiscan.io"],
  },
  56: {
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-rpc.publicnode.com"],
    blockExplorerUrls: ["https://bscscan.com"],
  },
};

const naCadeia = async (p: Provedor, cadeia: string) =>
  BigInt((await p.request({ method: "eth_chainId" })) as string) ===
  BigInt(cadeia);

/** A carteira ainda não tem a rede cadastrada (código 4902). */
function redeDesconhecida(e: unknown): boolean {
  const erro = e as { code?: number; message?: string } | null;
  return (
    erro?.code === 4902 || /unrecognized chain|not been added/i.test(erro?.message ?? "")
  );
}

/** Saldo de USDC da carteira (unidades mínimas); nulo se a rede não respondeu. */
async function saldoUsdc(
  p: Provedor,
  contrato: string,
  dono: string,
): Promise<bigint | null> {
  try {
    // 0x70a08231 = balanceOf(address)
    const bruto = (await p.request({
      method: "eth_call",
      params: [
        {
          to: contrato,
          data: "0x70a08231" + dono.slice(2).toLowerCase().padStart(64, "0"),
        },
        "latest",
      ],
    })) as string;
    return bruto && bruto !== "0x" ? BigInt(bruto) : BigInt(0);
  } catch {
    return null;
  }
}

/**
 * Troca a carteira para a rede da cobrança e pede a transferência de USDC.
 * Devolve o hash da transação.
 */
export async function enviarTransacaoEvm(
  id: string,
  de: string,
  t: TransferenciaEvm,
): Promise<string> {
  const p = provedor(id);
  if (!p)
    throw new CarteiraError(
      "A carteira não está mais conectada. Conecte de novo.",
    );
  const cadeia = "0x" + t.chainId.toString(16);
  const rede = CADEIAS[t.chainId]?.chainName ?? String(t.chainId);
  try {
    if (!(await naCadeia(p, cadeia))) {
      try {
        await p.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: cadeia }],
        });
      } catch (e) {
        if (!redeDesconhecida(e) || !CADEIAS[t.chainId]) throw e;
        await p.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: cadeia, ...CADEIAS[t.chainId] }],
        });
      }
      // Em outra rede a chamada iria para um endereço que não é o USDC.
      if (!(await naCadeia(p, cadeia)))
        throw new CarteiraError(
          `Troque a carteira para a rede ${rede} e tente de novo.`,
        );
    }
    // Os últimos 32 bytes da chamada são o valor.
    const saldo = await saldoUsdc(p, t.para, de);
    if (saldo !== null && saldo < BigInt("0x" + t.dados.slice(-64)))
      throw new CarteiraError(
        `Esta carteira não tem USDC suficiente na rede ${rede} para esta cobrança.`,
      );
    const hash = await p.request({
      method: "eth_sendTransaction",
      params: [{ from: de, to: t.para, data: t.dados, value: "0x0" }],
    });
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
      throw new CarteiraError("A carteira não devolveu o hash da transação.");
    return hash;
  } catch (e) {
    if (e instanceof CarteiraError) throw e;
    console.error("[carteira] pagamento não enviado:", e);
    throw recusouNaCarteira(e)
      ? new CarteiraError("O pagamento foi recusado na carteira.")
      : new CarteiraError(
          "A carteira não enviou o pagamento.",
          respostaDaCarteira(e),
        );
  }
}
