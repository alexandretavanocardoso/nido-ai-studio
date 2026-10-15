/**
 * Preços por segundo de vídeo (estimativa mostrada na tela — a cobrança real
 * é a do painel de cada serviço). Compartilhado entre cliente e servidor.
 */

/**
 * Kling O3 Edit (fal.ai): troca de pessoa mantendo cenário e áudio. Mínimo 3s.
 * Três formatos, cada um com seu preço por segundo.
 */
export const KLING_TROCA = {
  porSegundo: { standard: 0.126, pro: 0.168, "4k": 0.42 },
  minSegundos: 3,
} as const;
export type QualidadeTroca = keyof typeof KLING_TROCA.porSegundo;
export const QUALIDADES_TROCA = ["standard", "pro", "4k"] as const;

export function custoTroca(
  duracao: number,
  qualidade: QualidadeTroca = "pro",
): number {
  return Number(
    (
      Math.max(KLING_TROCA.minSegundos, duracao) *
      KLING_TROCA.porSegundo[qualidade]
    ).toFixed(2),
  );
}

/**
 * Modelos da troca (Sombra): cada um é um motor (ver lib/video/troca.ts) e,
 * no Kling, o formato. A tela ordena pelo preço. Qualquer plano usa qualquer
 * um; cada um cobra o seu preço. `recusaRostoReal`: o filtro do modelo pode
 * barrar vídeo ou imagem com rosto de pessoa real (a tela avisa ao escolher).
 */
export const MODELOS_TROCA = {
  kling_standard: {
    label: "Kling O3 Standard",
    nota: "Partes de 15s · o Kling mais barato",
    motor: "kling",
    qualidade: "standard",
    recusaRostoReal: false,
  },
  kling_pro: {
    label: "Kling O3 Pro",
    nota: "Partes de 15s · mais nítido",
    motor: "kling",
    qualidade: "pro",
    recusaRostoReal: false,
  },
  kling_4k: {
    label: "Kling O3 4K",
    nota: "Partes de 15s · em 4K",
    motor: "kling",
    qualidade: "4k",
    recusaRostoReal: false,
  },
  seedance: {
    label: "Seedance 2.5",
    nota: "Até 30s de uma vez · recusa rostos reais",
    motor: "seedance",
    qualidade: null,
    recusaRostoReal: true,
  },
  omni: {
    label: "Gemini Omni Flash",
    nota: "Partes de 10s · pode recusar rostos reais",
    motor: "omni",
    qualidade: null,
    recusaRostoReal: true,
  },
} as const;
export type ModeloTroca = keyof typeof MODELOS_TROCA;
export const MODELOS_TROCA_IDS = Object.keys(MODELOS_TROCA) as ModeloTroca[];
export type MotorDaTroca = (typeof MODELOS_TROCA)[ModeloTroca]["motor"];

/** Custo em dólar por segundo de cada modelo da troca. */
export function custoPorSegundoTroca(m: ModeloTroca): number {
  const { motor, qualidade } = MODELOS_TROCA[m];
  if (motor === "omni") return OMNI_TROCA.porSegundo;
  return qualidade ? KLING_TROCA.porSegundo[qualidade] : SEEDANCE_TROCA.porSegundo;
}

/**
 * Troca "tomada por tomada" (só Kling). Num vídeo editado com cortes rápidos,
 * mandar várias tomadas juntas faz o motor trocar a primeira e se perder nas
 * seguintes. Aí cada tomada (o pedaço entre dois cortes de câmera) vai sozinha;
 * as com menos de 3 s — o mínimo do Kling — são esticadas em câmera lenta até
 * TOMADA_MIN e aceleradas de volta no resultado. O Kling cobra pelo que
 * processa, então cada tomada curta custa TOMADA_MIN segundos.
 */
export const TOMADA_MIN = 3.1;
/** Tomadas menores que isto (um clarão, um quadro solto) se juntam à anterior. */
const TOMADA_DESPREZIVEL = 0.3;
/** Tomadas mais curtas que isto vão junto com a vizinha (ver `tomadasDoVideo`). */
const TOMADA_MINUSCULA = 0.5;
/** Acima disto o vídeo volta ao modo normal: seriam pedidos demais de uma vez. */
export const MAX_TOMADAS = 24;

export interface Tomada {
  inicio: number;
  duracao: number;
}

/** As tomadas do vídeo, a partir dos instantes dos cortes de câmera. */
export function tomadasDoVideo(cortes: number[], duracao: number): Tomada[] {
  const pontos = [0];
  for (const c of [...cortes].sort((a, b) => a - b))
    if (
      c - pontos[pontos.length - 1] >= TOMADA_DESPREZIVEL &&
      duracao - c >= TOMADA_DESPREZIVEL
    )
      pontos.push(c);
  // Tomada minúscula vai JUNTO com a seguinte, no mesmo pedido (a última, com a
  // anterior). Sozinha ela seria esticada 6 vezes ou mais em câmera lenta, sobra
  // pouco vídeo de verdade e o Kling inventa o cenário; deixá-la como no
  // original faz a pessoa original piscar no meio do vídeo. Junto com a vizinha
  // o cenário se mantém (testado) — e vai na frente porque o motor troca melhor
  // o que está no começo do pedido.
  const limites = pontos.filter(
    (inicio, i) => i === 0 || inicio - pontos[i - 1] >= TOMADA_MINUSCULA,
  );
  if (
    limites.length > 1 &&
    duracao - limites[limites.length - 1] < TOMADA_MINUSCULA
  )
    limites.pop();
  return limites.map((inicio, i) => ({
    inicio: Number(inicio.toFixed(3)),
    duracao: Number(((limites[i + 1] ?? duracao) - inicio).toFixed(3)),
  }));
}

/**
 * O vídeo vai tomada por tomada? Só quando tem alguma tomada mais curta que o
 * mínimo do motor (senão o modo normal resolve) e não tem tomadas demais.
 */
export function trocaPorTomadas(
  cortes: number[],
  duracao: number,
): Tomada[] | null {
  const tomadas = tomadasDoVideo(cortes, duracao);
  return tomadas.length > 1 &&
    tomadas.length <= MAX_TOMADAS &&
    tomadas.some((t) => t.duracao < KLING_TROCA.minSegundos)
    ? tomadas
    : null;
}

/** Segundos que o Kling processa (e cobra) numa tomada. */
export const segundosDaTomada = (t: Tomada) => Math.max(TOMADA_MIN, t.duracao);

/**
 * Segundos cobrados pela troca no Kling: a duração do vídeo, ou — tomada por
 * tomada — a soma do que o motor processa em cada uma. É o valor máximo: uma
 * tomada em que ninguém marcado aparece não é enviada nem cobrada.
 */
export function segundosCobradosTroca(cortes: number[], duracao: number): number {
  const tomadas = trocaPorTomadas(cortes, duracao);
  return tomadas
    ? Number(tomadas.reduce((s, t) => s + segundosDaTomada(t), 0).toFixed(2))
    : duracao;
}

/**
 * Seedance 2.5 (modo edição, 720p): troca Premium — até 30s por envio. Gera no mínimo 4s.
 * O fal cobra ~US$ 0,284 por segundo de vídeo de ENTRADA e de SAÍDA (os tokens
 * somam as duas durações); na troca elas são iguais, então cada segundo custa o dobro.
 */
export const SEEDANCE_TROCA = { porSegundo: 0.568, minSegundos: 3 } as const;

export function custoTrocaPremium(duracao: number): number {
  return Number((Math.max(4, duracao) * SEEDANCE_TROCA.porSegundo).toFixed(2));
}

/**
 * Gemini Omni Flash (Google, 720p): ~US$ 0,10 por segundo de vídeo gerado (a
 * entrada custa quase nada). Edita no máximo 10s por vez (ver lib/video/omni.ts).
 */
export const OMNI_TROCA = { porSegundo: 0.1, minSegundos: 3 } as const;

export function custoTrocaOmni(duracao: number): number {
  return Number(
    (Math.max(OMNI_TROCA.minSegundos, duracao) * OMNI_TROCA.porSegundo).toFixed(2),
  );
}

/** Duração mínima do vídeo em cada motor da troca. */
export const MINIMO_TROCA: Record<MotorDaTroca, number> = {
  kling: KLING_TROCA.minSegundos,
  seedance: SEEDANCE_TROCA.minSegundos,
  omni: OMNI_TROCA.minSegundos,
};

/**
 * Criar vídeo novo a partir da imagem do personagem (Runway, Sapiens, fal ou Google).
 * `duracoes` é o que cada modelo aceita POR CENA; o vídeo pedido (10, 15 ou
 * 30s, igual em todos os modelos) é gerado em cenas seguidas e unido no fim.
 */
export const MODELOS_CRIAR = {
  gen4_turbo: {
    label: "Gen-4 Turbo",
    nota: "Mais barato",
    porSegundo: 0.05,
    duracoes: [5, 10],
    audio: false,
  },
  "gen4.5": {
    label: "Gen-4.5",
    nota: "Melhor do Runway",
    porSegundo: 0.12,
    duracoes: [5, 10],
    audio: false,
  },
  "veo3.1_fast": {
    label: "Veo 3.1 Fast",
    nota: "Google · pode ter áudio",
    porSegundo: 0.1,
    porSegundoComAudio: 0.15,
    duracoes: [4, 6, 8],
    audio: true,
  },
  // Só na API do Gemini (ver lib/video/veo.ts), em 720p: US$ 0,05/s, sempre com
  // áudio — a API não desliga o som; sem áudio pedido, ele sai na união das
  // cenas (conferido em 15/10/2026).
  "veo3.1_lite": {
    label: "Veo 3.1 Lite",
    nota: "Google · o Veo mais barato",
    porSegundo: 0.05,
    duracoes: [4, 6, 8],
    audio: true,
  },
  // Só no Sapiens (ver lib/video/sapiens.ts). Cotado em 13/10/2026: US$ 0,053/s
  // sem áudio e US$ 0,079/s com áudio, em 720p. Aceita de 3 a 15s por cena.
  kling_v3: {
    label: "Kling V3",
    nota: "Até 15s por cena",
    porSegundo: 0.053,
    porSegundoComAudio: 0.079,
    duracoes: [5, 10, 15],
    audio: true,
  },
  // Só no fal (ver lib/video/wan.ts), em 720p: US$ 0,10/s com ou sem áudio
  // (conferido em 14/10/2026). Gera de 2 a 30s de uma vez: cada duração é uma cena só.
  wan3: {
    label: "Wan 3.0",
    nota: "Alibaba · até 30s numa cena",
    porSegundo: 0.1,
    duracoes: [10, 15, 30],
    audio: true,
  },
} as const;
export type ModeloCriar = keyof typeof MODELOS_CRIAR;

/**
 * Serviço que gera cada modelo. O Veo 3.1 Fast existe nos dois: vai pelo
 * Sapiens (US$ 0,079/s, ou US$ 0,119/s com áudio) quando a chave dele está
 * configurada, senão pelo Runway (os preços da tabela acima). O Wan 3.0 só
 * existe no fal, e o Veo 3.1 Lite só na API do Gemini (GEMINI_API_KEY).
 */
export type ProvedorCriar = "runway" | "sapiens" | "fal" | "google";
const NO_SAPIENS: readonly ModeloCriar[] = ["kling_v3", "veo3.1_fast"];
const NO_RUNWAY: readonly ModeloCriar[] = ["gen4_turbo", "gen4.5", "veo3.1_fast"];
const NO_FAL: readonly ModeloCriar[] = ["wan3"];
const NO_GOOGLE: readonly ModeloCriar[] = ["veo3.1_lite"];

export function provedorCriar(
  modelo: ModeloCriar,
  ligado: { runway: boolean; sapiens: boolean; fal?: boolean; gemini?: boolean },
): ProvedorCriar | null {
  if (ligado.sapiens && NO_SAPIENS.includes(modelo)) return "sapiens";
  if (ligado.runway && NO_RUNWAY.includes(modelo)) return "runway";
  if (ligado.fal && NO_FAL.includes(modelo)) return "fal";
  if (ligado.gemini && NO_GOOGLE.includes(modelo)) return "google";
  return null;
}

/** Modelo que já vem escolhido: o do Sapiens (mais barato) quando a chave existe. */
export function modeloPadraoCriar(ligado: { sapiens: boolean }): ModeloCriar {
  return ligado.sapiens ? "kling_v3" : "gen4.5";
}

/**
 * Vídeo falado: a fala sai da voz do personagem (ElevenLabs) e um modelo de
 * vídeo gera o personagem falando o áudio, com os lábios sincronizados. O
 * vídeo dura o que o áudio durar. `porSegundo` é o custo aproximado em dólar
 * (vídeo + fala). O modelo é escolhido pelo usuário:
 *  - "avatar": avatar do Runway (gwm1_avatars; cabeça e ombros, o único
 *    enquadramento que ele aceita). Runway: 2 créditos de entrada + 2 a cada
 *    6s (US$ 0,01 por crédito), conferido em 08/10/2026. Mais barato.
 *  - "hailuo3": Hailuo 3 no Runway, que recebe a imagem inteira e o áudio da
 *    fala como referência e gera o personagem de corpo inteiro falando — 10
 *    créditos do Runway por segundo + 2 por imagem (testado em 08/10/2026),
 *    no mínimo 5s por cena.
 *  - "wan3": Wan 3.0 no fal (reference-to-video, 720p, US$ 0,10/s), também
 *    com a imagem e o áudio da fala como referência; de 2s por cena para cima.
 *  - "seedance*": Seedance (ByteDance) no Sapiens, reference-to-video em
 *    720p com a imagem e o áudio da fala; de 4 a 15s por cena. Preços cotados
 *    em POST /videos/quote em 14/10/2026: 2.0 Mini US$ 0,068/s, 2.0 Fast
 *    US$ 0,109/s, 2.5 US$ 0,208/s, 2.0 US$ 0,226/s.
 * Nos de corpo inteiro cada cena tem até 15s de fala (o limite do áudio de
 * referência), e o som do vídeo final volta a ser a fala original.
 */
export const MODELOS_FALADO = {
  avatar: {
    label: "Runway Avatar",
    nota: "Close · cabeça e ombros",
    provedor: "runway",
    inteiro: false,
    porSegundo: 0.01,
    minSegundos: 1,
  },
  hailuo3: {
    label: "Hailuo 3",
    nota: "Corpo inteiro, com gestos",
    provedor: "runway",
    inteiro: true,
    porSegundo: 0.11,
    minSegundos: 5,
  },
  wan3: {
    label: "Wan 3.0",
    nota: "Corpo inteiro · Alibaba",
    provedor: "fal",
    inteiro: true,
    porSegundo: 0.11,
    minSegundos: 2,
  },
  seedance20_mini: {
    label: "Seedance 2.0 Mini",
    nota: "Corpo inteiro · ByteDance",
    provedor: "sapiens",
    inteiro: true,
    porSegundo: 0.078,
    minSegundos: 4,
  },
  seedance20_fast: {
    label: "Seedance 2.0 Fast",
    nota: "Corpo inteiro · ByteDance",
    provedor: "sapiens",
    inteiro: true,
    porSegundo: 0.119,
    minSegundos: 4,
  },
  seedance25: {
    label: "Seedance 2.5",
    nota: "Corpo inteiro · ByteDance, o mais novo",
    provedor: "sapiens",
    inteiro: true,
    porSegundo: 0.218,
    minSegundos: 4,
  },
  seedance20: {
    label: "Seedance 2.0",
    nota: "Corpo inteiro · ByteDance, qualidade cheia",
    provedor: "sapiens",
    inteiro: true,
    porSegundo: 0.236,
    minSegundos: 4,
  },
} as const;
export type ModeloFalado = keyof typeof MODELOS_FALADO;
export const MODELOS_FALADO_IDS = Object.keys(MODELOS_FALADO) as ModeloFalado[];
/** Serviço de vídeo de cada modelo falado (a fala é sempre da ElevenLabs). */
export const provedorFalado = (m: ModeloFalado) => MODELOS_FALADO[m].provedor;
export const CORPO_MAX_SEGUNDOS = 15;
/** Segundos gerados (e cobrados) numa cena de corpo inteiro com `fala` segundos. */
export const segundosDaCenaInteira = (
  fala: number,
  modelo: ModeloFalado = "hailuo3",
) =>
  Math.min(
    CORPO_MAX_SEGUNDOS,
    Math.max(MODELOS_FALADO[modelo].minSegundos, Math.ceil(fala)),
  );

/** Ritmo médio da fala em português, para estimar a duração pelo texto. */
export const CARACTERES_POR_SEGUNDO = 15;
/**
 * Durações do vídeo falado: as de sempre mais o roteiro inteiro (a fala toda,
 * até 60s). O vídeo dura o que a fala durar; a duração é o teto.
 */
export const ROTEIRO_INTEIRO = 60;
export const DURACOES_FALADO = [10, 15, 30, ROTEIRO_INTEIRO] as const;
/** Limite do texto da fala (os 60s do roteiro inteiro, com folga). */
export const FALA_MAX_CARACTERES = 1000;
/**
 * Cenas do vídeo falado: cada parágrafo da fala (separado por linha em branco)
 * é uma cena, que pode ter o seu próprio cenário. Passou do máximo, o resto
 * entra na última.
 */
export const MAX_CENAS_FALADAS = 4;
export function cenasDaFala(fala: string): string[] {
  const partes = fala
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length <= MAX_CENAS_FALADAS) return partes;
  return [
    ...partes.slice(0, MAX_CENAS_FALADAS - 1),
    partes.slice(MAX_CENAS_FALADAS - 1).join(" "),
  ];
}
export const segundosDaFala = (texto: string) =>
  Math.ceil(texto.trim().length / CARACTERES_POR_SEGUNDO);
/** Duração de um MP3 de 128 kbps constante (o formato pedido à ElevenLabs). */
export const segundosDoMp3 = (bytes: number) => (bytes * 8) / 128_000;

/** Durações oferecidas em "Criar vídeo": as mesmas para todos os modelos. */
export const DURACOES_CRIAR = [10, 15, 30] as const;
export type DuracaoCriar = (typeof DURACOES_CRIAR)[number];

/**
 * Cenas (em segundos) que o modelo gera para um vídeo de `alvo` segundos:
 * a soma é o menor valor ≥ alvo que as durações do modelo permitem, com o
 * menor número de cenas, das mais longas para as mais curtas. Quando a soma
 * passa do alvo (ex.: Veo, 15s → 8 + 8), o vídeo final é cortado no alvo.
 */
export function cenasDoVideo(modelo: ModeloCriar, alvo: number): number[] {
  const opcoes = [...MODELOS_CRIAR[modelo].duracoes].sort((a, b) => b - a);
  let melhor: number[] | null = null;
  const soma = (l: number[]) => l.reduce((t, n) => t + n, 0);
  const tentar = (cenas: number[], desde: number) => {
    const total = soma(cenas);
    if (total >= alvo) {
      if (
        !melhor ||
        total < soma(melhor) ||
        (total === soma(melhor) && cenas.length < melhor.length)
      )
        melhor = cenas;
      return;
    }
    if (cenas.length >= 12) return;
    for (let i = desde; i < opcoes.length; i++)
      tentar([...cenas, opcoes[i]], i);
  };
  tentar([], 0);
  return melhor ?? [opcoes[0]];
}

/** Segundos realmente gerados (e cobrados) para um vídeo de `alvo` segundos. */
export function segundosGerados(modelo: ModeloCriar, alvo: number): number {
  return cenasDoVideo(modelo, alvo).reduce((t, n) => t + n, 0);
}

export function custoCriar(
  modelo: ModeloCriar,
  duracao: number,
  audio: boolean,
): number {
  const m = MODELOS_CRIAR[modelo];
  const porSegundo =
    audio && "porSegundoComAudio" in m ? m.porSegundoComAudio : m.porSegundo;
  return Number((duracao * porSegundo).toFixed(2));
}
