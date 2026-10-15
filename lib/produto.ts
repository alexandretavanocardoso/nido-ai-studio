import {
  CARACTERES_POR_SEGUNDO,
  CORPO_MAX_SEGUNDOS,
  MODELOS_CRIAR,
  MODELOS_FALADO,
  MODELOS_FALADO_IDS,
  cenasDoVideo,
  custoCriar,
  type ModeloCriar,
  type ModeloFalado,
} from "@/lib/video/precos";
import {
  creditosCriarVideo,
  creditosImagem,
  creditosVideoFalado,
} from "@/lib/planos";

/**
 * Vídeo de produto (tela /app/produto; em teste, só admin): o influencer — um
 * personagem ou uma foto avulsa — mostrando e usando um produto, até 60s.
 * Cada cena ganha uma imagem nova (a pessoa com o produto, no lugar e na pose
 * da cena: Nano Banana com as duas fotos) e vira vídeo:
 *  - com fala: a voz lê a fala da cena (ElevenLabs) e um modelo de corpo
 *    inteiro (Seedance, Wan, Hailuo) gera a pessoa falando, com os lábios no
 *    áudio. O job é um "vídeo falado em cenas" (lib/video/falado.ts), com a
 *    ação de cada cena;
 *  - sem fala: um modelo do "Criar vídeo" anima a imagem de cada cena. O job
 *    é uma cadeia de cenas (lib/video/cadeia.ts) com a imagem e o pedido de
 *    cada uma.
 * Compartilhado entre a tela e o servidor.
 */

/** `character_id` dos jobs feitos com uma foto avulsa (a coluna não aceita vazio). */
export const PRODUTO_SEM_PERSONAGEM = "produto";

export const DURACOES_PRODUTO = [10, 15, 30, 45, 60] as const;
export type DuracaoProduto = (typeof DURACOES_PRODUTO)[number];

export type ModoProduto = "falado" | "mudo";

/** Com fala: cada cena tem até 15s de fala (o limite do áudio de referência). */
export const MAX_CENAS_FALADAS_PRODUTO = 4;
/** Sem fala: os modelos de cenas curtas (Veo, Gen-4) fazem 60s em até 8 cenas. */
export const MAX_CENAS_MUDAS_PRODUTO = 8;
/** Texto do produto (nome e o que é) e de cada cena. */
export const PRODUTO_MAX_CARACTERES = 400;
export const CENA_MAX_CARACTERES = 600;

/** O que acontece em cada cena: a descrição visual (inglês) e a fala, se houver. */
export interface CenaProduto {
  cena: string;
  fala?: string;
}

/** Só os modelos falados de corpo inteiro: o avatar em close não mostra o produto. */
export const MODELOS_FALADO_PRODUTO = MODELOS_FALADO_IDS.filter(
  (m) => MODELOS_FALADO[m].inteiro,
);
export const MODELOS_MUDO_PRODUTO = Object.keys(MODELOS_CRIAR) as ModeloCriar[];

/**
 * Segundos de cada cena. Com fala: uma cena a cada 15s (o vídeo dura o que a
 * fala durar; isto é o plano). Sem fala: as cenas que o modelo gera para a
 * duração (a soma pode passar um pouco; o vídeo é cortado na duração).
 */
export function cenasDoProduto(
  modo: ModoProduto,
  modelo: string,
  duracao: number,
): number[] {
  if (modo === "falado") {
    const n = Math.min(
      MAX_CENAS_FALADAS_PRODUTO,
      Math.ceil(duracao / CORPO_MAX_SEGUNDOS),
    );
    const base = Math.floor(duracao / n);
    return Array.from({ length: n }, (_, i) =>
      i < duracao - base * n ? base + 1 : base,
    );
  }
  return cenasDoVideo(modelo as ModeloCriar, duracao).slice(
    0,
    MAX_CENAS_MUDAS_PRODUTO,
  );
}

/** Imagem de cada cena: Nano Banana Pro quando o plano tem a qualidade Pro (o rótulo sai mais fiel). */
export const creditosImagemDaCena = (pro: boolean) =>
  creditosImagem("nano-banana", pro ? "pro" : "padrao");
/** Custo aproximado (US$) da imagem de cada cena, para quem não tem conta. */
const CUSTO_IMAGEM_CENA = { pro: 0.14, padrao: 0.04 } as const;

/**
 * Créditos de um vídeo de produto: as imagens das cenas mais o vídeo. Com
 * fala, o vídeo conta pela duração escolhida (o teto; o que a fala não usar
 * volta na hora de gerar).
 */
export function creditosProduto(o: {
  modo: ModoProduto;
  modelo: string;
  duracao: number;
  audio: boolean;
  pro: boolean;
}): number {
  const cenas = cenasDoProduto(o.modo, o.modelo, o.duracao);
  const imagens = cenas.length * creditosImagemDaCena(o.pro);
  if (o.modo === "falado")
    return creditosVideoFalado(o.duracao, o.modelo as ModeloFalado) + imagens;
  const gerados = cenas.reduce((t, n) => t + n, 0);
  const audio = MODELOS_CRIAR[o.modelo as ModeloCriar].audio && o.audio;
  return creditosCriarVideo(o.modelo as ModeloCriar, gerados, audio) + imagens;
}

/** O mesmo em dólar (tela sem conta). */
export function custoProduto(o: {
  modo: ModoProduto;
  modelo: string;
  duracao: number;
  audio: boolean;
  pro: boolean;
}): number {
  const cenas = cenasDoProduto(o.modo, o.modelo, o.duracao);
  const imagens = cenas.length * CUSTO_IMAGEM_CENA[o.pro ? "pro" : "padrao"];
  const video =
    o.modo === "falado"
      ? o.duracao * MODELOS_FALADO[o.modelo as ModeloFalado].porSegundo
      : custoCriar(
          o.modelo as ModeloCriar,
          cenas.reduce((t, n) => t + n, 0),
          MODELOS_CRIAR[o.modelo as ModeloCriar].audio && o.audio,
        );
  return Number((video + imagens).toFixed(2));
}

/** Teto de caracteres da fala de uma cena de `segundos` (com folga para a voz). */
export const caracteresDaCena = (segundos: number) =>
  Math.floor((segundos * CARACTERES_POR_SEGUNDO * 0.9) / 5) * 5;

/**
 * Pedido ao Claude que monta as cenas. Responde só JSON:
 * {"cenas": [{"cena": "...", "fala": "..."}]}.
 */
export function sistemaRoteiroProduto(o: {
  modo: ModoProduto;
  segundos: number[];
  /** Falas escritas pela pessoa (divididas entre as cenas) ou vazio (a IA escreve). */
  temFalas: boolean;
}): string {
  const n = o.segundos.length;
  return [
    "You plan a short social-media ad video in which an AI influencer shows and uses a product. Each scene is ONE continuous shot: an image model first creates a still of the person with the product in that scene, then a video model animates it" +
      (o.modo === "falado"
        ? " while a text-to-speech voice reads the scene's line and the person says it, lips in sync."
        : ". There is no speech."),
    "",
    `Write exactly ${n} scene${n > 1 ? "s" : ""}, in order, lasting ${o.segundos.map((s) => `${s}s`).join(", ")}. Answer with JSON only:`,
    o.modo === "falado"
      ? '{"cenas": [{"cena": "<what is seen>", "fala": "<what the person says>"}]}'
      : '{"cenas": [{"cena": "<what is seen>"}]}',
    "",
    '"cena" rules:',
    '- English, one paragraph, present tense, at most 60 words. Refer to the influencer as "the person" — never by name.',
    "- Say where the person is (use the requested setting; you may change the camera angle or spot between scenes), exactly what they do with the product (show it to the camera, hold it up, open it, use it, wear it, apply it, taste it, react to it) and the framing and camera movement (e.g. medium shot, slow push-in, handheld selfie).",
    "- The product and the person must be clearly visible in every scene. Build a small story: hook in the first scene, the product in use in the middle, a satisfied close-up of the product with the person at the end.",
    "- Describe the product by what it is and its colours (\"the white sneaker\", \"the amber glass serum bottle\"): never write brand names, logos or text — the image already shows them.",
    "- No dialogue or quotes, no on-screen text, captions, hashtags or emojis. Nothing violent, sexual, hateful or dangerous.",
    ...(o.modo === "falado"
      ? [
          "",
          '"fala" rules:',
          o.temFalas
            ? "- Use the person's own lines from the request, in order, word for word, split between the scenes at natural pauses. Do not rewrite them; only if a scene goes over its limit, trim the weakest words."
            : "- Write the lines yourself: an authentic first-person UGC ad, like a creator talking to their followers. Hook in the first line, one or two concrete benefits that fit the product, and a short call to action in the last scene. You may say the product name if the request gives it.",
          `- Each scene's line is read aloud in about its duration: at most ${o.segundos.map(caracteresDaCena).join(", ")} characters, in that order. Every scene has a line of at least a few words.`,
          "- Same language as the request. Only spoken words: no stage directions, labels, emojis or quotes. Punctuate for natural pauses.",
        ]
      : []),
  ].join("\n");
}

/** Mensagem do usuário para o Claude que monta as cenas. */
export function pedidoRoteiroProduto(o: {
  produto: string;
  cenario: string;
  detalhes: string;
  falas: string;
}): string {
  return [
    `Product: ${o.produto}`,
    o.cenario ? `Setting: ${o.cenario}` : "Setting: choose one that fits the product.",
    o.detalhes ? `Details from the client: ${o.detalhes}` : "",
    o.falas ? `Lines the person must say:\n${o.falas}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Imagem de uma cena (Nano Banana): a pessoa da primeira foto com o produto da
 * segunda, fazendo o que a cena pede, no formato do vídeo.
 */
export function promptImagemDaCena(o: {
  cena: string;
  produto: string;
  vertical: boolean;
  falado: boolean;
}): string {
  return [
    `The first image is a person. The second image is a product (${o.produto.slice(0, 200)}).`,
    `Create a new photorealistic photo of the SAME person from the first image — same face, hair, skin tone and body; keep their outfit unless the scene asks for something else — in this scene: ${o.cena}`,
    "The product in the photo must be EXACTLY the product from the second image: same shape, proportions, colours, materials, label, logo and printed text, at a realistic size next to the person. When the person holds it, the grip and hands look natural.",
    o.falado
      ? "The person faces the camera with the face fully visible and sharp, relaxed and ready to talk."
      : "",
    `${o.vertical ? "Vertical 9:16" : "Horizontal 16:9"} frame with the person and the product both clearly visible; the scene fills the whole frame edge to edge. Authentic social-media ad look, natural light that matches the place.`,
    "No added text, captions, watermarks or extra logos. No other people.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pedido ao modelo de vídeo de uma cena sem fala. */
export function promptVideoDaCena(cena: string): string {
  return `${cena} The person keeps the same face, hair and outfit, and the product keeps exactly its shape, colours, label and logo. Smooth, natural motion. No text or captions on screen.`.slice(
    0,
    1000,
  );
}
