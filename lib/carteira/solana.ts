import { getWallets } from "@wallet-standard/app";
import {
  CarteiraError,
  recusouNaCarteira,
  respostaDaCarteira,
} from "@/lib/nft/carteira-navegador";
import { CARTEIRAS_ACEITAS } from "@/lib/nft/comum";
import type { CarteiraInstalada } from "./comum";

/**
 * Carteiras Solana do navegador (Wallet Standard) para pagar: conectar, para
 * saber o endereço, e assinar + enviar a transferência que o servidor montou.
 * Só no navegador.
 */
interface ContaPadrao {
  address: string;
  chains: readonly string[];
}
interface CarteiraPadrao {
  name: string;
  icon: string;
  /** Contas que a carteira já liberou para este site. */
  accounts: readonly ContaPadrao[];
  features: Record<string, unknown>;
}
interface Conectar {
  connect(o?: { silent?: boolean }): Promise<{ accounts: readonly ContaPadrao[] }>;
}
interface Desconectar {
  disconnect(): Promise<void>;
}
interface Eventos {
  on(evento: "change", fn: () => void): () => void;
}
interface Enviar {
  signAndSendTransaction(
    ...pedidos: Array<{
      account: ContaPadrao;
      transaction: Uint8Array;
      chain: string;
    }>
  ): Promise<ReadonlyArray<{ signature: Uint8Array }>>;
}

const CONECTAR = "standard:connect";
const DESCONECTAR = "standard:disconnect";
const EVENTOS = "standard:events";
const ENVIAR = "solana:signAndSendTransaction";

/** Todas as que sabem pagar; as que o app já conhece (lib/nft/comum.ts) vêm primeiro. */
function instaladas(): CarteiraPadrao[] {
  if (typeof window === "undefined") return [];
  const ordem = CARTEIRAS_ACEITAS as readonly string[];
  const lugar = (nome: string) =>
    ordem.includes(nome) ? ordem.indexOf(nome) : ordem.length;
  return (getWallets().get() as unknown as CarteiraPadrao[])
    .filter((c) => CONECTAR in c.features && ENVIAR in c.features)
    .sort((a, b) => lugar(a.name) - lugar(b.name));
}

const achar = (id: string) => instaladas().find((c) => c.name === id);
const contaSolana = (contas: readonly ContaPadrao[]) =>
  contas.find((a) => a.chains.some((c) => c.startsWith("solana:")));

export function carteirasSolana(): CarteiraInstalada[] {
  return instaladas().map((c) => ({ id: c.name, nome: c.name, icone: c.icon }));
}

/**
 * Conecta e devolve o endereço. `silencioso` não abre a janela da carteira: só
 * vale se o site já foi aprovado antes (devolve nulo se não foi).
 */
export async function conectarSolana(
  id: string,
  silencioso = false,
): Promise<string | null> {
  const carteira = achar(id);
  if (!carteira) {
    if (silencioso) return null;
    throw new CarteiraError("Carteira não encontrada neste navegador.");
  }
  try {
    const { accounts } = await (carteira.features[CONECTAR] as Conectar).connect(
      silencioso ? { silent: true } : undefined,
    );
    // Algumas carteiras devolvem a lista vazia e deixam as contas em `accounts`.
    const conta = contaSolana([...accounts, ...carteira.accounts]);
    if (conta) return conta.address;
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
  throw new CarteiraError("A carteira não tem uma conta Solana.");
}

/** Avisa quando a pessoa troca de conta (ou desconecta) na própria carteira. */
export function aoTrocarContaSolana(
  id: string,
  fn: (endereco: string | null) => void,
): () => void {
  const carteira = achar(id);
  const eventos = carteira?.features[EVENTOS] as Eventos | undefined;
  if (!carteira || !eventos) return () => {};
  return eventos.on("change", () =>
    fn(contaSolana(carteira.accounts)?.address ?? null),
  );
}

export async function desconectarSolana(id: string): Promise<void> {
  try {
    await (
      achar(id)?.features[DESCONECTAR] as Desconectar | undefined
    )?.disconnect();
  } catch {
    // a carteira não quis desconectar: o app esquece dela do mesmo jeito
  }
}

/**
 * Pede à carteira para assinar e enviar a transação (serializada, como veio do
 * servidor). Devolve a assinatura dela, que é o "hash" no explorer.
 */
export async function enviarTransacaoSolana(
  id: string,
  endereco: string,
  transacao: Uint8Array,
  cadeia: string,
): Promise<string> {
  const carteira = achar(id);
  const conta = carteira?.accounts.find((a) => a.address === endereco);
  if (!carteira || !conta)
    throw new CarteiraError(
      "A carteira não está mais conectada. Conecte de novo.",
    );
  let assinatura: Uint8Array | undefined;
  try {
    const [r] = await (
      carteira.features[ENVIAR] as Enviar
    ).signAndSendTransaction({
      account: conta,
      transaction: transacao,
      chain: cadeia,
    });
    assinatura = r?.signature;
  } catch (e) {
    console.error("[carteira] pagamento não enviado:", e);
    throw recusouNaCarteira(e)
      ? new CarteiraError("O pagamento foi recusado na carteira.")
      : new CarteiraError(
          "A carteira não enviou o pagamento.",
          respostaDaCarteira(e),
        );
  }
  if (!assinatura || assinatura.length !== 64)
    throw new CarteiraError("A carteira não devolveu o hash da transação.");
  return base58(assinatura);
}

const ALFABETO = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (formato das assinaturas e dos endereços Solana), sem Buffer: roda no navegador. */
export function base58(bytes: Uint8Array): string {
  let n = BigInt(0);
  for (const b of bytes) n = n * BigInt(256) + BigInt(b);
  let s = "";
  for (; n > BigInt(0); n /= BigInt(58)) s = ALFABETO[Number(n % BigInt(58))] + s;
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}
