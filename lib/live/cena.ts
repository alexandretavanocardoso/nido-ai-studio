import type { S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { askClaude } from "@/lib/ai/anthropic";
import { generateImage } from "@/lib/ai/gemini";
import { getObjectBuffer } from "@/lib/storage/s3";
import { MODELO_LIVE, SEM_RACIOCINIO } from "./modelo";
import type { CenaLive } from "./tipos";

/**
 * Cenário da live: a foto da pessoa (já recortada no rosto) vai para outro
 * lugar antes de virar o avatar — o fundo da foto é o fundo da live. Por
 * texto, a IA primeiro reescreve o pedido (em qualquer língua) num pedido de
 * imagem em inglês, detalhado; por imagem, a foto do lugar entra como segunda
 * referência (Nano Banana).
 */

/** O que nunca muda na pessoa, e o enquadramento do avatar. */
const PESSOA = [
  "Keep the SAME person: same face, same facial features, same hair, same skin, same body. The person must stay perfectly recognisable.",
  "Keep their outfit and accessories exactly as they are, unless the instructions explicitly add or change something on the person (for example headphones or a microphone) — then add only that.",
].join(" ");
const QUADRO =
  "Framing: close-up portrait, head and shoulders, centred, facing the camera, face fully visible and sharp, nothing covering the face. The light on the person matches the setting. Photorealistic. No text, no captions, no logos, no watermarks, no other people in front of the subject.";

const SISTEMA_CENA = [
  "You write image-editing instructions for a livestream avatar. The user describes, in any language, where the person should be and, sometimes, small details on the person (like headphones).",
  "Rewrite it as one precise English instruction of 2 to 4 sentences:",
  "- Describe the setting behind the person concretely and photorealistically: the place, the main objects, colours, lighting and time of day, and a slightly blurred background with depth of field.",
  "- If the user asked for something on the person (an accessory, a prop, clothing), state it clearly as an addition. Never invent changes to the person that were not asked for.",
  "- Put requested accessories where they are normally worn, clearly visible (headphones on the head, over the ears), unless the user says otherwise.",
  "- Keep it suitable for a head-and-shoulders portrait facing the camera.",
  "Output only the instruction, with no preamble, quotes or lists.",
].join("\n");

/**
 * Reescreve o cenário pedido num pedido de imagem em inglês, detalhado. Se a
 * IA falhar, segue com o texto como veio (o gerador entende português).
 */
export async function melhorarCena(texto: string): Promise<string> {
  try {
    const melhor = await askClaude({
      model: MODELO_LIVE,
      system: SISTEMA_CENA,
      user: texto,
      maxTokens: 600,
      ...SEM_RACIOCINIO,
    });
    return melhor.trim() || texto;
  } catch (e) {
    console.warn("[live] melhorar cenário:", (e as Error).message);
    return texto;
  }
}

const SISTEMA_CENA_LUCY = [
  "You turn a livestream setting, described by the user in any language, into short English for a realtime video model that keeps the person and only changes what is behind them.",
  "Line 1: the background only, as a concrete noun phrase of at most 30 words (place, main objects, colours, lighting), with no verbs about the person.",
  "Line 2: only if the user asked for something on the person (an accessory, a prop, clothing), a short noun phrase for it, like 'over-ear gaming headphones'. Otherwise leave line 2 out.",
  "Output only those lines, with no labels, quotes or preamble.",
].join("\n");

/** Cenário da Sombra (Lucy 2.5): o fundo e, se pedido, um item na pessoa — curtos, em inglês. */
export interface CenaLucy {
  fundo: string;
  item: string | null;
}

/**
 * Reescreve o cenário para o Lucy: ele acerta melhor uma frase curta de fundo
 * (o guia da Decart pede uma edição focada por vez). Se a IA falhar, segue com
 * o texto como veio.
 */
export async function cenaParaLucy(texto: string): Promise<CenaLucy> {
  try {
    const r = await askClaude({
      model: MODELO_LIVE,
      system: SISTEMA_CENA_LUCY,
      user: texto,
      maxTokens: 200,
      ...SEM_RACIOCINIO,
    });
    const [fundo, item] = r
      .split("\n")
      .map((l) => l.trim().replace(/^[\d.)\s-]+/, "").replace(/[.\s]+$/, ""))
      .filter(Boolean);
    // Entra no meio da frase ("Change the background to a cozy…"): "A cozy" vira "a cozy".
    const meio = (t: string) => (/^[A-Z][a-z\s]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
    return { fundo: meio(fundo || texto).slice(0, 300), item: item ? meio(item).slice(0, 120) : null };
  } catch (e) {
    console.warn("[live] cenário do Lucy:", (e as Error).message);
    return { fundo: texto.slice(0, 300), item: null };
  }
}

/** O pedido de imagem do cenário por texto (já melhorado). */
export const pedidoCenaTexto = (instrucao: string) =>
  [
    "Edit this photo of a person for a livestream.",
    PESSOA,
    `Instructions: ${instrucao}`,
    QUADRO,
  ].join("\n");

export async function retratoNaCena(
  s3: S3Client,
  retrato: Buffer,
  cena: CenaLive,
): Promise<Buffer> {
  const pessoa = { mimeType: "image/jpeg", data: retrato.toString("base64") };
  if ("prompt" in cena)
    return generateImage({
      prompt: pedidoCenaTexto(await melhorarCena(cena.prompt)),
      referencias: [pessoa],
      aspectRatio: "1:1",
      imageSize: "1K",
      qualidade: "padrao",
    });
  const lugar = await sharp(await getObjectBuffer(s3, cena.imageKey))
    .rotate()
    .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return generateImage({
    prompt: [
      "The first image is a person. The second image is a place.",
      "Put the person from the first image into the place from the second image.",
      PESSOA,
      "Use the second image as the background, keeping its look (it may be cropped to fit).",
      QUADRO,
    ].join("\n"),
    referencias: [pessoa, { mimeType: "image/jpeg", data: lugar.toString("base64") }],
    aspectRatio: "1:1",
    imageSize: "1K",
    qualidade: "padrao",
  });
}
