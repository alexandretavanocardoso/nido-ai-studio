/**
 * Planos, pacotes de créditos e custo de cada geração em créditos.
 * Compartilhado entre cliente e servidor.
 *
 * Unidade: 1 crédito = US$ 0,01 de custo nos serviços de IA (arredondado pra
 * cima por ação). O preço do crédito ao cliente fica entre US$ 0,018 (anual,
 * −20%; piso conferido em planos.test.ts) e 0,030 (pacote), o que dá ~40–65%
 * de margem no pior caso (uso de 100% dos créditos), já com a taxa do Stripe. Exceção: Nano Banana Pro cobra
 * 10 créditos com custo ~US$ 0,13–0,15 (preço competitivo com o Higgsfield).
 * Custos da IA de texto medidos em 07/10/2026 (ver CREDITOS_TEXTO).
 */
import type { ModeloImagem } from "@/lib/ai/modelos-imagem";
import type {
  Enquadramento,
  ModeloCriar,
  QualidadeTroca,
} from "@/lib/video/precos";

export type PlanoId = "gratis" | "starter" | "creator" | "studio";
export type PlanoPago = Exclude<PlanoId, "gratis">;
export type Intervalo = "mensal" | "anual";

export interface Plano {
  id: PlanoId;
  nome: string;
  descricao: string;
  /** Créditos por mês (grátis: bônus único no cadastro). */
  creditos: number;
  /** Preço por mês. Anual = 12 × mensal com 20% de desconto, pago à vista. */
  precoBRL: number;
  precoUSD: number;
  personagens: number;
  modelosImagem: ModeloImagem[];
  /** Nano Banana Pro e GPT Image "alta". */
  qualidadePro: boolean;
  /** Troca de pessoa (Kling O3, fal.ai): duração máxima por vídeo. null = não disponível. */
  troca: { segundosMax: number } | null;
  /** Troca de pessoa Premium (Seedance 2.5). */
  trocaPremium: boolean;
  criarVideo: ModeloCriar[];
  veoComAudio: boolean;
  /** Créditos do plano que sobram passam para o mês seguinte (até 1 mês). */
  rollover: boolean;
  armazenamentoGB: number;
  /** Gerações rodando ao mesmo tempo. Vídeo inclui troca, criar e legenda. */
  simultaneas: { imagens: number; videos: number };
  /** Treinar persona (modelo próprio do personagem). */
  persona: boolean;
  /** Treinos "Rápido" inclusos por mês (não acumulam). */
  treinosGratisMes: number;
  /** Voz do personagem (ElevenLabs): criar, clonar e gerar falas. */
  voz: boolean;
}

export const PLANOS: Record<PlanoId, Plano> = {
  gratis: {
    id: "gratis",
    nome: "Grátis",
    descricao: "Pra conhecer",
    creditos: 50,
    precoBRL: 0,
    precoUSD: 0,
    personagens: 1,
    modelosImagem: ["nano-banana", "seedream"],
    qualidadePro: false,
    troca: null,
    trocaPremium: false,
    criarVideo: [],
    veoComAudio: false,
    rollover: false,
    armazenamentoGB: 1,
    simultaneas: { imagens: 1, videos: 1 },
    persona: false,
    treinosGratisMes: 0,
    voz: false,
  },
  starter: {
    id: "starter",
    nome: "Starter",
    descricao: "Para o primeiro influenciador",
    // 800 = 3 vídeos de troca de 15s (17 créditos/s → 255 cada) e sobra para imagens.
    // US$ 18 é o menor preço que mantém o piso de US$ 0,018 por crédito no anual.
    creditos: 800,
    precoBRL: 95,
    precoUSD: 18,
    personagens: 3,
    modelosImagem: ["nano-banana", "seedream", "flux2", "gpt-image"],
    qualidadePro: false,
    troca: { segundosMax: 15 },
    trocaPremium: false,
    criarVideo: ["gen4_turbo"],
    veoComAudio: false,
    rollover: false,
    armazenamentoGB: 10,
    simultaneas: { imagens: 1, videos: 1 },
    persona: false,
    treinosGratisMes: 0,
    voz: true,
  },
  creator: {
    id: "creator",
    nome: "Creator",
    descricao: "Para quem opera de verdade",
    // 1.720 = cabe 1 vídeo Premium (Seedance) de 30s, que custa 1.710, sem furar o
    // piso de US$ 0,018 por crédito no plano anual (máximo: 1.733).
    creditos: 1720,
    precoBRL: 199,
    precoUSD: 39,
    personagens: 10,
    modelosImagem: ["persona", "nano-banana", "seedream", "flux2", "gpt-image"],
    qualidadePro: true,
    troca: { segundosMax: 30 },
    trocaPremium: true,
    criarVideo: ["gen4_turbo", "gen4.5", "veo3.1_fast", "kling_v3"],
    veoComAudio: false,
    rollover: true,
    armazenamentoGB: 50,
    simultaneas: { imagens: 2, videos: 2 },
    persona: true,
    treinosGratisMes: 0,
    voz: true,
  },
  studio: {
    id: "studio",
    nome: "Studio",
    descricao: "Vários influenciadores, volume alto",
    creditos: 4200,
    precoBRL: 499,
    precoUSD: 99,
    personagens: 30,
    modelosImagem: ["persona", "nano-banana", "seedream", "flux2", "gpt-image"],
    qualidadePro: true,
    troca: { segundosMax: 60 },
    trocaPremium: true,
    criarVideo: ["gen4_turbo", "gen4.5", "veo3.1_fast", "kling_v3"],
    veoComAudio: true,
    rollover: true,
    armazenamentoGB: 200,
    simultaneas: { imagens: 4, videos: 3 },
    persona: true,
    treinosGratisMes: 1,
    voz: true,
  },
};

export const PLANOS_PAGOS: PlanoPago[] = ["starter", "creator", "studio"];

/** Desconto do plano anual (pago à vista). */
export const DESCONTO_ANUAL = 0.2;

export function precoPlano(
  plano: PlanoPago,
  intervalo: Intervalo,
  moeda: "BRL" | "USD",
): number {
  const mensal =
    moeda === "BRL" ? PLANOS[plano].precoBRL : PLANOS[plano].precoUSD;
  return intervalo === "mensal"
    ? mensal
    : Math.round(mensal * 12 * (1 - DESCONTO_ANUAL));
}

/** Pacotes avulsos: valem 12 meses e são gastos depois dos créditos do plano. */
export const PACOTES = {
  p500: { creditos: 500, precoBRL: 79, precoUSD: 15 },
  p1500: { creditos: 1500, precoBRL: 219, precoUSD: 40 },
  p5000: { creditos: 5000, precoBRL: 649, precoUSD: 120 },
} as const;
export type PacoteId = keyof typeof PACOTES;

/**
 * Compra manual (quantidade livre). Preço por crédito = o do menor pacote
 * (R$ 79 / 500), então os pacotes continuam saindo mais barato.
 */
export const AVULSO_MIN = 100;
export const AVULSO_MAX = 100_000;
export const PRECO_CREDITO = { BRL: 0.16, USD: 0.03 } as const;

export function creditosAvulsoValido(n: number): boolean {
  return Number.isInteger(n) && n >= AVULSO_MIN && n <= AVULSO_MAX;
}

/** Preço da compra manual, em centavos arredondados. */
export function precoAvulso(creditos: number, moeda: "BRL" | "USD"): number {
  return Math.round(creditos * PRECO_CREDITO[moeda] * 100) / 100;
}

/** Maior pacote que sai mais barato do que comprar essa quantidade avulsa (pra sugerir na tela). */
export function pacoteMaisBarato(creditos: number): PacoteId | null {
  const ids = (Object.keys(PACOTES) as PacoteId[]).filter(
    (id) =>
      PACOTES[id].creditos >= creditos &&
      PACOTES[id].precoBRL <= precoAvulso(creditos, "BRL"),
  );
  return ids[0] ?? null;
}

/** Bônus de créditos para pagamento em USDC (sem taxa de cartão e sem estorno). */
export const BONUS_USDC = 0.05;

/* ------------------------------------------------------------------ */
/* Custo em créditos por ação                                          */
/* ------------------------------------------------------------------ */

export function creditosImagem(
  modelo: ModeloImagem,
  qualidade: "padrao" | "pro",
): number {
  switch (modelo) {
    case "nano-banana":
      return qualidade === "pro" ? 10 : 5;
    case "seedream":
      return 5;
    case "flux2":
      return 8;
    case "gpt-image":
      return qualidade === "pro" ? 20 : 7;
    case "persona":
      return 5;
  }
}

/** Kling O3 Edit Pro: US$ 0,168/s (mínimo 3s por vídeo). */
export const TROCA_POR_SEGUNDO = 17;
/** Kling O3 Edit por formato: Standard US$ 0,126/s · Pro US$ 0,168/s · 4K US$ 0,42/s. */
export const TROCA_POR_SEGUNDO_QUALIDADE: Record<QualidadeTroca, number> = {
  standard: 13,
  pro: TROCA_POR_SEGUNDO,
  "4k": 42,
};
/** Seedance 2.5 (720p, com vídeo de referência): US$ 0,284/s de entrada + US$ 0,284/s de saída = US$ 0,568/s (mínimo 4s gerados). */
export const TROCA_PREMIUM_POR_SEGUNDO = 57;
const CRIAR_POR_SEGUNDO: Record<ModeloCriar, number> = {
  gen4_turbo: 5,
  "gen4.5": 12,
  "veo3.1_fast": 10,
  kling_v3: 6,
};
/** Com áudio (só os modelos que têm). */
const CRIAR_POR_SEGUNDO_COM_AUDIO: Partial<Record<ModeloCriar, number>> = {
  "veo3.1_fast": 15,
  kling_v3: 8,
};

export function creditosTroca(
  segundos: number,
  qualidade: QualidadeTroca = "pro",
): number {
  return (
    Math.ceil(Math.max(3, segundos)) * TROCA_POR_SEGUNDO_QUALIDADE[qualidade]
  );
}

export function creditosTrocaPremium(segundos: number): number {
  return Math.ceil(Math.max(4, segundos)) * TROCA_PREMIUM_POR_SEGUNDO;
}

export function creditosCriarVideo(
  modelo: ModeloCriar,
  segundos: number,
  audio: boolean,
): number {
  const porSegundo =
    (audio && CRIAR_POR_SEGUNDO_COM_AUDIO[modelo]) || CRIAR_POR_SEGUNDO[modelo];
  return segundos * porSegundo;
}

/**
 * Vídeo falado, por segundo: avatar do Runway (~US$ 0,004/s) + a fala na
 * ElevenLabs (~15 caracteres por segundo).
 */
export const FALADO_POR_SEGUNDO = 2;
/** Cenário de uma cena do vídeo falado: uma imagem do Nano Banana. */
export const CREDITOS_CENARIO = 5;
/** Corpo inteiro: Hailuo 3 no Runway (~US$ 0,10/s + imagem) + a fala. */
export const CORPO_INTEIRO_POR_SEGUNDO = 12;
export function creditosVideoFalado(
  segundos: number,
  enquadramento: Enquadramento = "close",
): number {
  return (
    segundos *
    (enquadramento === "inteiro"
      ? CORPO_INTEIRO_POR_SEGUNDO
      : FALADO_POR_SEGUNDO)
  );
}

/** Figurinha de WhatsApp: uma imagem (Nano Banana) + a remoção do fundo. */
export const CREDITOS_FIGURINHA = 6;

export const CREDITOS_LEGENDA = 2;

/** Remoção de legenda com IA (Bria Video Eraser, US$ 0,14/s) — até 60s por vídeo. */
export const LEGENDA_IA_MAX_SEGUNDOS = 60;
export function creditosLegendaIA(segundos: number): number {
  return Math.ceil(segundos) * 15;
}

const GB = 1024 ** 3;
export function cotaArmazenamentoBytes(plano: PlanoId): number {
  return PLANOS[plano].armazenamentoGB * GB;
}

/* ------------------------------------------------------------------ */
/* Persona treinada e voz                                               */
/* ------------------------------------------------------------------ */

/** Treino da persona: Rápido (FLUX.1 LoRA Fast, ~US$ 2) e Pro (FLUX.2, ~US$ 6,40). */
export const CREDITOS_TREINO = { rapido: 250, pro: 650 } as const;
/** Imagens no conjunto de treino (o treinador pede de 9 a 50). */
export const TREINO_MIN_IMAGENS = 9;
export const TREINO_MAX_IMAGENS = 50;
/** Gerar uma variação para o conjunto de treino (Nano Banana / Seedream). */
export const CREDITOS_IMAGEM_DATASET = 5;

/** Criar ou clonar a voz do personagem (ElevenLabs). */
export const CREDITOS_CRIAR_VOZ = 50;
/** Fala: ~US$ 0,03 por 100 caracteres na ElevenLabs. */
export function creditosFala(caracteres: number): number {
  return Math.max(3, Math.ceil(caracteres / 100) * 3);
}
/** Buscar um vídeo por link (Apify + transferência). */
export const CREDITOS_LINK = 3;

/**
 * Radar do dia (lib/radar). Notícias: Claude Haiku 4.5 + 3 buscas na web,
 * ~US$ 0,066 medido em 07/10/2026. X: Grok lê ~25 posts (US$ 5 por 1.000 posts)
 * + tokens, ~US$ 0,15 — estimado, ainda não medido (falta XAI_API_KEY).
 */
export const CREDITOS_RADAR = { noticias: 8, x: 18 } as const;
export const creditosRadar = (comX: boolean) =>
  CREDITOS_RADAR.noticias + (comX ? CREDITOS_RADAR.x : 0);

/**
 * Publicar/agendar nas redes: por rede. O preço segue o mercado, não o custo
 * (bundle.social, ~US$ 0,01 por post): escrever (4) + publicar em uma rede (6)
 * = 10 créditos, cerca de R$ 1,16 nos planos — uns 20% abaixo do post da Otto
 * (R$ 1,41 no plano do meio).
 */
export const CREDITOS_POST_POR_REDE = 6;

/** Colocar uma fala num vídeo (ffmpeg). */
export const CREDITOS_APLICAR_AUDIO = 2;

/** Cortar um trecho do vídeo (ffmpeg). */
export const CREDITOS_CORTAR_VIDEO = 2;
/** Menor e maior trecho que dá para cortar (s). O maior é o que cabe no tempo da função, recodificando. */
export const CORTE_MIN_SEGUNDOS = 0.5;
export const CORTE_MAX_SEGUNDOS = 180;

/**
 * Mintar o NFT do influencer na Solana (lib/nft). A NIDO paga a taxa da rede;
 * medido por simulação em 10/10/2026 (devnet e mainnet, scripts/nft-simular.mjs):
 * 0,00404 SOL por mint, quase tudo depósito de aluguel da conta do NFT. Os 10
 * créditos (US$ 0,10 de custo) só cobrem isso com o SOL abaixo de uns US$ 25 —
 * acima disso a diferença é subsídio. Gravar badges não é cobrado.
 */
export const CREDITOS_MINT_NFT = 10;

/**
 * IA de texto (Claude Sonnet 5.5: US$ 2 / US$ 10 por milhão de tokens de
 * entrada / saída). Custo real medido em 07/10/2026 com uma ficha completa:
 *   sugerirCampo        US$ 0,008–0,012
 *   checarConsistencia  US$ 0,010
 *   regenerarSecao      US$ 0,012–0,040 (a maior é Personalidade)
 *   expandirFicha       ~US$ 0,10–0,15 (a resposta é a ficha inteira)
 *   escrever            US$ 0,005–0,045 (o roteiro é o mais longo)
 */
export const CREDITOS_TEXTO = {
  sugerirCampo: 1,
  checarConsistencia: 3,
  regenerarSecao: 4,
  expandirFicha: 15,
  /** Escrever como o personagem: legenda, roteiro ou respostas. */
  escrever: 4,
  /** Roteiro salvo → descrição visual da cena, no "Criar vídeo". */
  cenaDoRoteiro: 1,
} as const;

/* ------------------------------------------------------------------ */
/* Permissões por plano                                                 */
/* ------------------------------------------------------------------ */

/** Motivo pelo qual o plano não permite a ação, ou null se permite. */
export function bloqueioImagem(
  plano: PlanoId,
  modelo: ModeloImagem,
  qualidade: "padrao" | "pro",
): string | null {
  const p = PLANOS[plano];
  if (!p.modelosImagem.includes(modelo))
    return `Este modelo não está no plano ${p.nome}.`;
  if (qualidade === "pro" && !p.qualidadePro)
    return `A qualidade Pro está disponível a partir do plano Creator.`;
  return null;
}

export function bloqueioTroca(plano: PlanoId, segundos: number): string | null {
  const t = PLANOS[plano].troca;
  if (!t)
    return "A troca de pessoa em vídeo está disponível a partir do plano Starter.";
  if (segundos > t.segundosMax)
    return `O plano ${PLANOS[plano].nome} aceita vídeos de até ${t.segundosMax}s (este tem ${Math.round(segundos)}s).`;
  return null;
}

export function bloqueioLegendaIA(
  plano: PlanoId,
  segundos: number,
): string | null {
  if (plano === "gratis")
    return "A remoção de legenda com IA está disponível a partir do plano Starter.";
  if (segundos > LEGENDA_IA_MAX_SEGUNDOS)
    return `A remoção com IA aceita vídeos de até ${LEGENDA_IA_MAX_SEGUNDOS}s (este tem ${Math.round(segundos)}s).`;
  return null;
}

export function bloqueioPersona(plano: PlanoId): string | null {
  return PLANOS[plano].persona
    ? null
    : "Treinar persona está disponível a partir do plano Creator.";
}

export function bloqueioPublicar(plano: PlanoId): string | null {
  return plano === "gratis"
    ? "Publicar e agendar nas redes está disponível a partir do plano Starter."
    : null;
}

export function bloqueioNft(plano: PlanoId): string | null {
  return plano === "gratis"
    ? "Mintar o NFT do influencer está disponível a partir do plano Starter."
    : null;
}

export function bloqueioVoz(plano: PlanoId): string | null {
  return PLANOS[plano].voz
    ? null
    : "A voz do personagem está disponível a partir do plano Starter.";
}

export function bloqueioTrocaPremium(plano: PlanoId): string | null {
  return PLANOS[plano].trocaPremium
    ? null
    : "O motor Premium (Seedance 2.5) está disponível a partir do plano Creator.";
}

/** Vídeo falado usa a voz do personagem: vale o plano que libera voz e criar vídeo. */
export function bloqueioVideoFalado(plano: PlanoId): string | null {
  const p = PLANOS[plano];
  if (!p.criarVideo.length)
    return "Criar vídeo está disponível a partir do plano Starter.";
  return bloqueioVoz(plano);
}

export function bloqueioCriarVideo(
  plano: PlanoId,
  modelo: ModeloCriar,
  audio: boolean,
): string | null {
  const p = PLANOS[plano];
  if (!p.criarVideo.includes(modelo)) {
    return p.criarVideo.length
      ? `Este modelo não está no plano ${p.nome}.`
      : "Criar vídeo está disponível a partir do plano Starter.";
  }
  if (audio && !p.veoComAudio)
    return "Vídeo com áudio está disponível no plano Studio.";
  return null;
}
