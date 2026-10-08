/**
 * Regras do programa de indicação. Compartilhado entre cliente e servidor.
 *
 * Quem indica ganha COMISSAO (10%) do valor que o indicado paga na primeira
 * assinatura de qualquer plano (cartão, Pix, boleto ou USDC). Compra de
 * créditos avulsos e renovações não geram comissão.
 *
 * A comissão sai na moeda do pagamento: BRL e USD são sacados pelo Stripe;
 * USDC (plano pago em USDC) é sacado on-chain, para a carteira do usuário.
 */
export const COMISSAO = 0.1;

/** Dias até a comissão poder ser sacada (cobre estorno e contestação do pagamento). */
export const CARENCIA_DIAS = 7;

/** Só conta nova pode ser vinculada a um código: até quantos dias depois do cadastro. */
export const JANELA_VINCULO_DIAS = 7;

/** Cookie que guarda o código do link (?ref=) até a pessoa criar a conta. */
export const COOKIE_INDICACAO = "nido_ref";
export const COOKIE_INDICACAO_DIAS = 30;

/** Saque mínimo por moeda. */
export const SAQUE_MINIMO: Record<MoedaComissao, number> = {
  BRL: 20,
  USD: 5,
  USDC: 5,
};

export type MoedaComissao = "BRL" | "USD" | "USDC";

/** Palavras que não podem ser código (rotas e nomes da casa). */
const RESERVADOS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "nido",
  "nidostudio",
  "suporte",
  "support",
  "stripe",
  "login",
  "ref",
]);

/** Deixa o código como é guardado: sem espaços nas pontas e em minúsculas. */
export function normalizarCodigo(bruto: string): string {
  return bruto.trim().toLowerCase();
}

/** Por que o código não serve, ou null se serve. */
export function problemaDoCodigo(bruto: string): string | null {
  const c = normalizarCodigo(bruto);
  if (c.length < 3) return "O código precisa de pelo menos 3 caracteres.";
  if (c.length > 24) return "O código pode ter no máximo 24 caracteres.";
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(c))
    return "Use só letras sem acento, números, hífen e sublinhado, começando por letra ou número.";
  if (RESERVADOS.has(c)) return "Este código não está disponível.";
  return null;
}

/** Moeda da comissão: USDC para plano pago em USDC; senão, a moeda cobrada no Stripe. */
export function moedaDaComissao(
  moedaDoPagamento: string,
  provedor: string,
): MoedaComissao {
  if (provedor === "usdc") return "USDC";
  return moedaDoPagamento.toUpperCase() === "BRL" ? "BRL" : "USD";
}

/** Formato do endereço por rede (conferência rápida na tela; o servidor confere de verdade). */
export function formatoDeCarteira(rede: string, endereco: string): boolean {
  const e = endereco.trim();
  return rede === "solana"
    ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(e)
    : /^0x[0-9a-fA-F]{40}$/.test(e);
}

/** Comissão sobre o valor pago, em centavos inteiros (arredonda para baixo). */
export function comissaoEmCentavos(valorPago: number): number {
  if (!Number.isFinite(valorPago) || valorPago <= 0) return 0;
  return Math.floor(Math.round(valorPago * 100) * COMISSAO);
}

/** Link de indicação a partir da origem do site e do código. */
export function linkDeIndicacao(origem: string, codigo: string): string {
  return `${origem.replace(/\/$/, "")}/?ref=${encodeURIComponent(codigo)}`;
}
