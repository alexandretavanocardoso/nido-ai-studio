/**
 * Modelos que escrevem o motion, com o preço por milhão de tokens (US$,
 * conferido em 15/10/2026) e os níveis de esforço que cada um aceita. O
 * esforço controla quanto o modelo pensa antes de escrever: mais esforço,
 * animação mais caprichada, mais tokens (e mais tempo).
 * Compartilhado entre o app (tela e rotas) e o worker.
 */

export type EsforcoMotion = "low" | "medium" | "high" | "xhigh" | "max";

export const ROTULO_ESFORCO: Record<EsforcoMotion, string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  xhigh: "Muito alto",
  max: "Máximo",
};

const TODOS: EsforcoMotion[] = ["low", "medium", "high", "xhigh", "max"];

export const MODELOS_MOTION = {
  "claude-opus-5-5": {
    rotulo: "Claude Opus 5.5",
    nota: "Recomendado",
    provedor: "anthropic",
    entrada: 4,
    saida: 20,
    esforcos: TODOS,
    padrao: "high",
  },
  "claude-fable-5-1": {
    rotulo: "Claude Fable 5.1",
    nota: "O mais forte e o mais caro",
    provedor: "anthropic",
    entrada: 10,
    saida: 50,
    esforcos: TODOS,
    padrao: "high",
  },
  "claude-sonnet-5-5": {
    rotulo: "Claude Sonnet 5.5",
    nota: "Metade do preço do Opus",
    provedor: "anthropic",
    entrada: 2,
    saida: 10,
    esforcos: TODOS,
    padrao: "high",
  },
  "claude-haiku-5-5": {
    rotulo: "Claude Haiku 5.5",
    nota: "O mais barato, para rascunhos",
    provedor: "anthropic",
    entrada: 0.1,
    saida: 0.5,
    esforcos: TODOS,
    padrao: "high",
  },
  "gemini-4-argon": {
    rotulo: "Gemini 4 Argon",
    nota: "Google · preço de lançamento até 30/11",
    provedor: "google",
    entrada: 2,
    saida: 10,
    esforcos: ["low", "medium", "high"] as EsforcoMotion[],
    padrao: "high",
  },
  // Preço e esforços conferidos na página do modelo na OpenAI em 15/10/2026.
  "gpt-6.1-sol": {
    rotulo: "GPT-6.1 Sol",
    nota: "OpenAI",
    provedor: "openai",
    entrada: 2,
    saida: 10,
    esforcos: TODOS,
    padrao: "high",
  },
} as const satisfies Record<
  string,
  {
    rotulo: string;
    nota: string;
    provedor: "anthropic" | "google" | "openai";
    entrada: number;
    saida: number;
    esforcos: EsforcoMotion[];
    padrao: EsforcoMotion;
  }
>;

export type ModeloMotion = keyof typeof MODELOS_MOTION;
export const MODELOS_MOTION_IDS = Object.keys(MODELOS_MOTION) as ModeloMotion[];
export const MODELO_MOTION_PADRAO: ModeloMotion = "claude-opus-5-5";

export const ehModeloMotion = (m: string): m is ModeloMotion => m in MODELOS_MOTION;

/** O Argon sai do preço de lançamento depois de 30/11/2026: US$ 4 / 20. */
const FIM_LANCAMENTO_ARGON = Date.UTC(2026, 11, 1);

/** Preço por milhão de tokens (entrada, saída) na data. */
export function precoMotion(
  modelo: ModeloMotion,
  quando = Date.now(),
): { entrada: number; saida: number } {
  if (modelo === "gemini-4-argon" && quando >= FIM_LANCAMENTO_ARGON)
    return { entrada: 4, saida: 20 };
  const m = MODELOS_MOTION[modelo];
  return { entrada: m.entrada, saida: m.saida };
}

/** Custo em dólar de `entrada` e `saida` tokens (o pensamento conta como saída). */
export function custoMotion(
  modelo: string,
  entrada: number,
  saida: number,
  quando = Date.now(),
): number {
  if (!ehModeloMotion(modelo)) return 0;
  const p = precoMotion(modelo, quando);
  return Number(((entrada * p.entrada + saida * p.saida) / 1_000_000).toFixed(4));
}

/**
 * Tokens de saída esperados por esforço (o HTML mais o pensamento), para a
 * estimativa da tela. É só uma ordem de grandeza: o custo real aparece quando
 * o motion fica pronto.
 */
const SAIDA_POR_ESFORCO: Record<EsforcoMotion, number> = {
  low: 10_000,
  medium: 16_000,
  high: 24_000,
  xhigh: 34_000,
  max: 48_000,
};

/**
 * Quadros por segundo que o Gemini olha no vídeo de referência: vídeos curtos
 * com mais detalhe (cortes rápidos), até 5 por segundo; um minuto, 2.
 */
export const fpsDaAnalise = (duracao: number): number => Math.min(5, Math.max(2, Math.round(60 / Math.max(1, duracao))));

/** Quadros do vídeo de referência que vão como imagem para o modelo que escreve. */
export const QUADROS_DA_REFERENCIA = 10;

/** Modelo que assiste ao vídeo de referência (imagem e som). */
export const MODELO_ANALISE_VIDEO: ModeloMotion = "gemini-4-argon";

/**
 * Custo estimado de assistir ao vídeo de referência: ~258 tokens por quadro
 * olhado + 32 por segundo de áudio, e ~4 mil de resposta.
 */
export function custoAnaliseVideo(duracao: number): number {
  const entrada = duracao * (fpsDaAnalise(duracao) * 258 + 32) + 1_500;
  return custoMotion(MODELO_ANALISE_VIDEO, entrada, 4_000);
}

export function estimativaMotion(
  modelo: ModeloMotion,
  esforco: EsforcoMotion,
  imagens: number,
  /** Com vídeo de referência: a duração dele (a análise e os quadros entram na conta). */
  referenciaSegundos = 0,
): number {
  if (referenciaSegundos > 0) imagens += QUADROS_DA_REFERENCIA;
  // Seguir um vídeo dá mais o que pensar: ~40% mais de saída.
  const saida = Math.round(SAIDA_POR_ESFORCO[esforco] * (referenciaSegundos > 0 ? 1.4 : 1));
  const escrita = { entrada: 7_000 + imagens * 1_600, saida };
  // A revisão visual lê o HTML e 8 quadros; quase sempre responde "OK" (às vezes reescreve).
  const revisao = { entrada: 9_000 + 8 * 450, saida: Math.round(SAIDA_POR_ESFORCO[esforco] * 0.35) };
  return (
    custoMotion(modelo, escrita.entrada + revisao.entrada, escrita.saida + revisao.saida) +
    (referenciaSegundos > 0 ? custoAnaliseVideo(referenciaSegundos) : 0)
  );
}

/**
 * Em créditos, como o resto do app (lib/planos.ts): 1 crédito = US$ 0,01 de
 * custo, arredondado para cima.
 */
export const creditosMotion = (custo: number) => Math.max(1, Math.ceil(Number((custo * 100).toFixed(6))));

/** Esforço que vale para o modelo: o escolhido, se ele aceitar, senão o padrão dele. */
export function esforcoDoModelo(modelo: ModeloMotion, esforco: EsforcoMotion): EsforcoMotion {
  const aceitos: readonly EsforcoMotion[] = MODELOS_MOTION[modelo].esforcos;
  return aceitos.includes(esforco) ? esforco : MODELOS_MOTION[modelo].padrao;
}

/** Teto de tokens de saída do pedido (o HTML e o pensamento). */
export const maxTokensMotion = (esforco: EsforcoMotion, comReferencia = false) =>
  comReferencia || esforco === "max" || esforco === "xhigh" ? 128_000 : 64_000;
