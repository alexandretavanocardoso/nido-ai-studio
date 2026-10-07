/**
 * Preços por segundo de vídeo (estimativa mostrada na tela — a cobrança real
 * é a do painel de cada serviço). Compartilhado entre cliente e servidor.
 */

/** Kling O1 Edit (fal.ai): troca de pessoa mantendo cenário e áudio. Mínimo 3s. */
export const KLING_TROCA = { porSegundo: 0.126, minSegundos: 3 } as const;

export function custoTroca(duracao: number): number {
  return Number((Math.max(KLING_TROCA.minSegundos, duracao) * KLING_TROCA.porSegundo).toFixed(2));
}

/** Seedance 2.5 (modo edição, 720p): troca Premium — até 30s por envio. Gera no mínimo 4s. */
export const SEEDANCE_TROCA = { porSegundo: 0.284, minSegundos: 3 } as const;

export function custoTrocaPremium(duracao: number): number {
  return Number((Math.max(4, duracao) * SEEDANCE_TROCA.porSegundo).toFixed(2));
}

/** Runway image-to-video: criar vídeo novo a partir da imagem do personagem. */
export const MODELOS_CRIAR = {
  gen4_turbo: { label: "Gen-4 Turbo", nota: "Mais barato", porSegundo: 0.05, duracoes: [5, 10], audio: false },
  "gen4.5": { label: "Gen-4.5", nota: "Melhor do Runway", porSegundo: 0.12, duracoes: [5, 10], audio: false },
  "veo3.1_fast": { label: "Veo 3.1 Fast", nota: "Google · pode ter áudio", porSegundo: 0.1, porSegundoComAudio: 0.15, duracoes: [4, 6, 8], audio: true },
} as const;
export type ModeloCriar = keyof typeof MODELOS_CRIAR;

export function custoCriar(modelo: ModeloCriar, duracao: number, audio: boolean): number {
  const m = MODELOS_CRIAR[modelo];
  const porSegundo = audio && "porSegundoComAudio" in m ? m.porSegundoComAudio : m.porSegundo;
  return Number((duracao * porSegundo).toFixed(2));
}
