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
 * Seedance 2.5 (modo edição, 720p): troca Premium — até 30s por envio. Gera no mínimo 4s.
 * O fal cobra ~US$ 0,284 por segundo de vídeo de ENTRADA e de SAÍDA (os tokens
 * somam as duas durações); na troca elas são iguais, então cada segundo custa o dobro.
 */
export const SEEDANCE_TROCA = { porSegundo: 0.568, minSegundos: 3 } as const;

export function custoTrocaPremium(duracao: number): number {
  return Number((Math.max(4, duracao) * SEEDANCE_TROCA.porSegundo).toFixed(2));
}

/**
 * Runway image-to-video: criar vídeo novo a partir da imagem do personagem.
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
} as const;
export type ModeloCriar = keyof typeof MODELOS_CRIAR;

/**
 * Vídeo falado: a fala sai da voz do personagem (ElevenLabs) e o Runway
 * (gwm1_avatars) gera o vídeo dele falando o áudio, com os lábios
 * sincronizados. O vídeo dura o que o áudio durar. Runway: 2 créditos de
 * entrada + 2 a cada 6s (US$ 0,01 por crédito), conferido em 08/10/2026.
 */
export const FALADO_ROTULO = "Runway Avatar";
/** Custo aproximado por segundo, em dólar (Runway + fala na ElevenLabs). */
export const FALADO_CUSTO_POR_SEGUNDO = 0.01;

/**
 * Enquadramento do vídeo falado. "close": avatar do Runway (cabeça e ombros,
 * o único que ele aceita). "inteiro": Hailuo 3 no Runway, que recebe a imagem
 * inteira e o áudio da fala como referência e gera o personagem de corpo
 * inteiro falando — 10 créditos do Runway por segundo + 2 por imagem (testado
 * em 08/10/2026), até 15s de fala por cena.
 */
export type Enquadramento = "close" | "inteiro";
export const CORPO_CUSTO_POR_SEGUNDO = 0.11;
export const CORPO_MAX_SEGUNDOS = 15;
/** Segundos gerados (e cobrados) numa cena de corpo inteiro com `fala` segundos. */
export const segundosDaCenaInteira = (fala: number) =>
  Math.min(CORPO_MAX_SEGUNDOS, Math.max(5, Math.ceil(fala)));

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
