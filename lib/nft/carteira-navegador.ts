import { getWallets } from "@wallet-standard/app";
import { CARTEIRAS_ACEITAS } from "./comum";

/**
 * Carteiras Solana instaladas no navegador (padrão Wallet Standard, que a
 * Phantom, a Solflare, a Backpack e a MetaMask seguem). Só no navegador.
 *
 * Aqui o app nunca pede transação à carteira: só conecta (para saber o endereço) e
 * pede a assinatura de uma mensagem, que prova a posse e não custa nada.
 * Quem pede transação é o pagamento em USDC, em lib/carteira.
 */

/** O pedaço do Wallet Standard que o app usa. */
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
  connect(): Promise<{ accounts: readonly ContaPadrao[] }>;
}
interface AssinarMensagem {
  signMessage(
    ...pedidos: Array<{ account: ContaPadrao; message: Uint8Array }>
  ): Promise<
    ReadonlyArray<{ signature: Uint8Array; signedMessage?: Uint8Array }>
  >;
}

const CONECTAR = "standard:connect";
const ASSINAR = "solana:signMessage";

export interface CarteiraDisponivel {
  nome: string;
  /** Ícone da carteira (data URI). */
  icone: string;
}

function aceitas(): CarteiraPadrao[] {
  if (typeof window === "undefined") return [];
  const ordem = CARTEIRAS_ACEITAS as readonly string[];
  return (getWallets().get() as unknown as CarteiraPadrao[])
    .filter(
      (c) =>
        ordem.includes(c.name) && CONECTAR in c.features && ASSINAR in c.features,
    )
    .sort((a, b) => ordem.indexOf(a.name) - ordem.indexOf(b.name));
}

/** Carteiras aceitas que estão instaladas agora. */
export function carteirasDisponiveis(): CarteiraDisponivel[] {
  return aceitas().map((c) => ({ nome: c.name, icone: c.icon }));
}

/** Avisa quando uma carteira aparece ou some (extensões carregam depois da página). */
export function aoMudarCarteiras(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const { on } = getWallets();
  const tirar = [on("register", fn), on("unregister", fn)];
  return () => tirar.forEach((t) => t());
}

export class CarteiraError extends Error {
  /** O que a própria carteira respondeu, quando não foi a pessoa que recusou. */
  detalhe?: string;
  constructor(mensagem: string, detalhe?: string) {
    super(mensagem);
    this.detalhe = detalhe;
  }
}

/** A pessoa fechou ou recusou o pedido na janela da carteira (código 4001 das carteiras). */
export function recusouNaCarteira(e: unknown): boolean {
  const erro = e as { code?: number; message?: string } | null;
  return (
    erro?.code === 4001 ||
    /reject|denied|declin|cancel|closed/i.test(erro?.message ?? "")
  );
}

export function respostaDaCarteira(e: unknown): string {
  const m = (e as { message?: unknown } | null)?.message;
  return (typeof m === "string" && m ? m : String(e)).slice(0, 160);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Vincula a carteira à conta, do começo ao fim: o servidor manda o desafio, a
 * carteira assina e o servidor confere. Devolve o endereço vinculado. Lança
 * CarteiraError com a mensagem (em português) para a tela mostrar.
 */
export async function vincularCarteira(nome: string): Promise<string> {
  const pedir = async (caminho: string, corpo: unknown) => {
    const res = await fetch(caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const b = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok)
      throw new CarteiraError(
        typeof b.error === "string" ? b.error : `Falha (HTTP ${res.status}).`,
      );
    return b;
  };
  const prova = await conectarEAssinar(
    nome,
    async (endereco) =>
      (await pedir("/api/carteira/desafio", { endereco })) as {
        nonce: string;
        mensagem: string;
      },
  );
  await pedir("/api/carteira/verificar", {
    nonce: prova.nonce,
    assinatura: prova.assinatura,
  });
  return prova.endereco;
}

/**
 * Conecta a carteira e assina o desafio. `pedirDesafio` recebe o endereço e
 * devolve a mensagem que o servidor quer assinada.
 */
export async function conectarEAssinar(
  nome: string,
  pedirDesafio: (endereco: string) => Promise<{ nonce: string; mensagem: string }>,
): Promise<{ endereco: string; nonce: string; assinatura: string }> {
  const carteira = aceitas().find((c) => c.name === nome);
  if (!carteira) throw new CarteiraError("Carteira não encontrada neste navegador.");
  let conta: ContaPadrao | undefined;
  try {
    const { accounts } = await (carteira.features[CONECTAR] as Conectar).connect();
    // Algumas carteiras devolvem a lista vazia e deixam as contas em `accounts`.
    conta = [...accounts, ...carteira.accounts].find((a) =>
      a.chains.some((c) => c.startsWith("solana:")),
    );
  } catch (e) {
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
  if (!conta) throw new CarteiraError("A carteira não tem uma conta Solana.");
  const { nonce, mensagem } = await pedirDesafio(conta.address);
  let assinatura: Uint8Array | undefined;
  let assinado: Uint8Array | undefined;
  const pedido = new TextEncoder().encode(mensagem);
  try {
    const [r] = await (carteira.features[ASSINAR] as AssinarMensagem).signMessage({
      account: conta,
      message: pedido,
    });
    assinatura = r?.signature;
    assinado = r?.signedMessage;
  } catch (e) {
    console.error("[carteira] assinatura recusada:", e);
    throw recusouNaCarteira(e)
      ? new CarteiraError(
          "A assinatura foi recusada na carteira. Clique de novo e aprove a mensagem na janela dela.",
        )
      : new CarteiraError(
          "A carteira não assinou a mensagem.",
          respostaDaCarteira(e),
        );
  }
  if (!assinatura || assinatura.length !== 64)
    throw new CarteiraError("A carteira não devolveu a assinatura.");
  // O padrão deixa a carteira dizer o que assinou: tem de ser o texto pedido.
  if (
    assinado &&
    (assinado.length !== pedido.length || assinado.some((b, i) => b !== pedido[i]))
  )
    throw new CarteiraError(
      "A carteira assinou um texto diferente do pedido. Tente com outra carteira.",
    );
  return { endereco: conta.address, nonce, assinatura: base64(assinatura) };
}
