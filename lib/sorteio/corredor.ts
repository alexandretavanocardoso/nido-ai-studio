import sharp from "sharp";
import { generateImage, shrinkReferencia } from "@/lib/ai/gemini";
import { getFal } from "@/lib/fal";
import { recortarFigura } from "@/lib/figurinha";
import { montarPassos, PEDIDO_PASSOS } from "./passos";

/**
 * O corredor da corrida do sorteio é o próprio influencer: o Nano Banana o
 * desenha correndo (corpo inteiro, de lado, indo para a direita), com a mesma
 * cara, roupa e estilo da foto; o fundo sai (o mesmo recorte da figurinha) e a
 * figura vira um WebP transparente de 360 px de altura. Depois, do desenho
 * dele correndo, as 4 poses do ciclo de corrida (as pernas se mexendo,
 * lib/sorteio/passos.ts). Uns 15 s e ~US$ 0,04 cada um, por participante (por
 * conta da NIDO).
 */
export const PEDIDO_CORREDOR = [
  "Show this exact same character running fast in a sprint race, full body from the top of the head to the shoes, seen from the side, facing and running to the RIGHT of the image, mid-stride with one knee up and arms pumping.",
  "Keep them perfectly recognisable: same face, hair, skin, body type, outfit, accessories and the same art style as the reference image.",
  "Only the character, centred, the whole body inside the frame. Plain pure white background, no floor, no shadow, no text, no other people.",
].join("\n");

/** Altura da figura do corredor (px): o bastante para a tela do vencedor. */
const ALTURA = 360;

export interface DesenhoCorredor {
  /** A figura parada (WebP transparente). */
  corpo: Buffer;
  /** O desenho dele correndo, ainda com o fundo branco: a referência das poses. */
  correndo: Buffer;
}

export async function desenharCorredor(foto: Buffer): Promise<DesenhoCorredor> {
  const correndo = await generateImage({
    prompt: PEDIDO_CORREDOR,
    referencias: [await shrinkReferencia(foto)],
    aspectRatio: "3:4",
    imageSize: "1K",
    qualidade: "padrao",
  });
  const recorte = await recortarFigura(getFal(), correndo);
  const corpo = await sharp(recorte).trim().resize({ height: ALTURA }).webp({ quality: 85, alphaQuality: 90 }).toBuffer();
  return { corpo, correndo };
}

/** As poses do ciclo de corrida (a tira de quadros), ou null se a folha não saiu com as 4 poses separadas. */
export async function desenharPassos(d: DesenhoCorredor): Promise<Buffer | null> {
  const folha = await generateImage({
    prompt: PEDIDO_PASSOS,
    referencias: [await shrinkReferencia(d.correndo)],
    aspectRatio: "1:1",
    imageSize: "1K",
    qualidade: "padrao",
  });
  return montarPassos(await recortarFigura(getFal(), folha), d.corpo);
}
