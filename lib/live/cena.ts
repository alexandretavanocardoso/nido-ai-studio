import type { S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { generateImage } from "@/lib/ai/gemini";
import { getObjectBuffer } from "@/lib/storage/s3";
import { retratoNoCenario } from "@/lib/video/falado";
import type { CenaLive } from "./tipos";

/**
 * Cenário da live: a foto da pessoa (já recortada no rosto) vai para outro
 * lugar antes de virar o avatar — o fundo da foto é o fundo da live. Por texto
 * usa o mesmo pedido do cenário do vídeo falado; por imagem, a foto do lugar
 * entra como segunda referência (Nano Banana).
 */
export async function retratoNaCena(
  s3: S3Client,
  retrato: Buffer,
  cena: CenaLive,
): Promise<Buffer> {
  if ("prompt" in cena) return retratoNoCenario(retrato, cena.prompt);
  const lugar = await sharp(await getObjectBuffer(s3, cena.imageKey))
    .rotate()
    .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return generateImage({
    prompt: [
      "The first image is a person. The second image is a place.",
      "Put the SAME person from the first image into the place from the second image — same face, same hair, same skin, same outfit and accessories, same expression. Do not change the person.",
      "Use the second image as the background, keeping its look (it may be cropped to fit). Framing is a close-up portrait: head and shoulders, centred, facing the camera, face fully visible and sharp, nothing covering it. The light on the person matches the place. Photorealistic. No text, no captions, no logos, no other people in front of the subject.",
    ].join("\n"),
    referencias: [
      { mimeType: "image/jpeg", data: retrato.toString("base64") },
      { mimeType: "image/jpeg", data: lugar.toString("base64") },
    ],
    aspectRatio: "1:1",
    imageSize: "1K",
    qualidade: "padrao",
  });
}
