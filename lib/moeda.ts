import { idiomaAtual } from "@/lib/i18n/tx";

/**
 * Moeda em que os valores aparecem (R$ ou US$), escolhida pelo usuário e
 * independente do idioma: o idioma decide só a escrita do número (1.234,56
 * em português, 1,234.56 em inglês). Ativada por <ComMoeda> (lib/moeda-client).
 *
 *  - Preço de tabela que existe nas duas moedas (planos, pacotes, crédito
 *    avulso): `naMoeda({ BRL, USD })` pega o da moeda ativa, sem câmbio.
 *  - Valor que só existe numa moeda (custo dos serviços de IA, ganhos de
 *    campanha em dólar): `dinheiro(v, { de: "USD" })` converte pelo câmbio.
 *  - Dinheiro que existe numa moeda fixa (saldo de indicação, USDC):
 *    `dinheiroEm(v, moeda)`, sem conversão.
 */
export type Moeda = "BRL" | "USD";

export const MOEDAS: Array<{ id: Moeda; simbolo: string; rotulo: string }> = [
  { id: "BRL", simbolo: "R$", rotulo: "Real (R$)" },
  { id: "USD", simbolo: "US$", rotulo: "Dólar (US$)" },
];

/** Moeda de quem ainda não escolheu (e a da primeira renderização, no servidor). */
export const MOEDA_PADRAO: Moeda = "USD";

/** Reais por dólar (CAMBIO_USD_BRL no servidor; padrão: a paridade da tabela de preços). */
export function cambioUsdBrl(): number {
  const v = Number(process.env.CAMBIO_USD_BRL);
  return v > 0 ? v : 5.3;
}

let moedaAtiva: Moeda = MOEDA_PADRAO;
let cambioAtivo = 5.3;

export function definirMoedaAtiva(moeda: Moeda, cambio?: number) {
  moedaAtiva = moeda;
  if (cambio && cambio > 0) cambioAtivo = cambio;
}

export function moedaAtual(): Moeda {
  return moedaAtiva;
}

/** Locale da escrita dos números: o do idioma, não o da moeda. */
export const localeAtual = () =>
  idiomaAtual() === "en" ? "en-US" : "pt-BR";

/** Preço de tabela que existe nas duas moedas: o da moeda ativa. */
export const naMoeda = (precos: Record<Moeda, number>) => precos[moedaAtiva];

/** Converte um valor de `de` para a moeda ativa, pelo câmbio. */
export function converter(valor: number, de: Moeda): number {
  if (de === moedaAtiva) return valor;
  return de === "USD" ? valor * cambioAtivo : valor / cambioAtivo;
}

/** Valor numa moeda fixa (sem conversão), escrito no idioma ativo. */
export function dinheiroEm(valor: number, moeda: Moeda, casas = 2): string {
  return valor.toLocaleString(localeAtual(), {
    style: "currency",
    currency: moeda,
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/**
 * Valor na moeda ativa. Sem `de`, ele já está nela (ex.: `naMoeda`); com
 * `de`, é convertido pelo câmbio.
 */
export function dinheiro(
  valor: number,
  o: { de?: Moeda; casas?: number } = {},
): string {
  const v = o.de ? converter(valor, o.de) : valor;
  return dinheiroEm(v, moedaAtiva, o.casas ?? 2);
}
