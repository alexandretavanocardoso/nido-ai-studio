/**
 * Modelos de geração de imagem oferecidos na tela. Lista curta e com rótulo
 * de uso — a pessoa escolhe pelo resultado, não pelo nome técnico.
 * Compartilhado entre cliente e servidor. Custos são estimativas por imagem.
 */
export const MODELOS_IMAGEM = {
  persona: {
    label: "Persona treinada",
    rotulo: "Personagem treinado · rosto idêntico",
    provedor: "fal",
    custo: { padrao: 0.04, pro: 0.04 },
    temQualidade: false,
    aceitaTexto: false,
  },
  "nano-banana": {
    label: "Nano Banana",
    rotulo: "Consistência do personagem",
    provedor: "gemini",
    custo: { padrao: 0.04, pro: 0.15 },
    temQualidade: true,
    aceitaTexto: false,
  },
  seedream: {
    label: "Seedream 4.5",
    rotulo: "Foto realista em 4K, mais barato",
    provedor: "fal",
    custo: { padrao: 0.04, pro: 0.04 },
    temQualidade: false,
    aceitaTexto: false,
  },
  flux2: {
    label: "Flux.2 Pro",
    rotulo: "Editorial e moda",
    provedor: "fal",
    custo: { padrao: 0.05, pro: 0.05 },
    temQualidade: false,
    aceitaTexto: false,
  },
  "gpt-image": {
    label: "GPT Image",
    rotulo: "Imagem com texto",
    provedor: "fal",
    custo: { padrao: 0.06, pro: 0.2 },
    temQualidade: true,
    aceitaTexto: true,
  },
} as const;

export type ModeloImagem = keyof typeof MODELOS_IMAGEM;
export const MODELOS_IMAGEM_IDS = Object.keys(MODELOS_IMAGEM) as [
  ModeloImagem,
  ...ModeloImagem[],
];
