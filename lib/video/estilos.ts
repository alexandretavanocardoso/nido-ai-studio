/**
 * Estilo visual do vídeo na troca de pessoa. "realista" é a troca de sempre
 * (o vídeo continua parecendo filmado). Nos outros, além de trocar a pessoa,
 * o motor redesenha o vídeo inteiro — personagens, as outras pessoas e o
 * cenário — naquele estilo, mantendo os movimentos e o enquadramento.
 */
export const ESTILOS_TROCA = {
  realista: { label: "Realista", nota: "Como foi filmado", pedido: null },
  desenho: {
    label: "Desenho",
    nota: "Ilustração 2D",
    pedido:
      "a hand-drawn 2D cartoon illustration: clean ink outlines, flat colours and soft watercolour shading",
  },
  anime: {
    label: "Anime",
    nota: "Traço japonês",
    pedido:
      "a 2D anime illustration: crisp line art, cel shading, large expressive eyes and vivid colours",
  },
  animacao3d: {
    label: "Animação 3D",
    nota: "Estilo boneco",
    pedido:
      "a stylised 3D animated film: smooth sculpted doll-like characters, soft studio lighting and slightly exaggerated proportions",
  },
  quadrinhos: {
    label: "Quadrinhos",
    nota: "Gibi, traço forte",
    pedido:
      "a comic-book illustration: bold black inking, halftone dots and strong flat colours",
  },
  aquarela: {
    label: "Aquarela",
    nota: "Pintura suave",
    pedido:
      "a watercolour painting: soft washes of colour, visible paper texture and loose brush strokes",
  },
  massinha: {
    label: "Massinha",
    nota: "Stop motion",
    pedido:
      "a claymation stop-motion film: characters and scenery modelled in plasticine, with fingerprints and handmade texture",
  },
  pixel: {
    label: "Pixel art",
    nota: "Jogo retrô",
    pedido:
      "retro pixel art, like a 16-bit video game: visible square pixels and a limited colour palette",
  },
  neon: {
    label: "Neon",
    nota: "Cyberpunk",
    pedido:
      "a cyberpunk illustration: dark scene lit by glowing neon pink and cyan lights, high contrast and reflections",
  },
  blocos: {
    label: "Blocos",
    nota: "Brinquedo de montar",
    pedido:
      "a toy world built from plastic building bricks: blocky figures with simple faces and brick-built scenery",
  },
} as const;

export type EstiloTroca = keyof typeof ESTILOS_TROCA;
export const ESTILOS_TROCA_IDS = Object.keys(ESTILOS_TROCA) as [
  EstiloTroca,
  ...EstiloTroca[],
];

/** Descrição do estilo para o pedido à IA (null no realista). */
export const pedidoDoEstilo = (estilo: EstiloTroca | undefined): string | null =>
  estilo ? ESTILOS_TROCA[estilo].pedido : null;
