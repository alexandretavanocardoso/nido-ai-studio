import type { S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { generateImage, shrinkReferencia } from "@/lib/ai/gemini";
import { gerarImagemFal } from "@/lib/ai/fal-imagem";
import { MODELOS_IMAGEM, type ModeloImagem } from "@/lib/ai/modelos-imagem";
import { gerarImagemOpenAI, getOpenAIKey } from "@/lib/ai/openai-imagem";
import { getFal } from "@/lib/fal";
import { getObjectBuffer, presignGet } from "@/lib/storage/s3";

type Modelo = Exclude<ModeloImagem, "persona">;

/** O serviço do modelo está configurado neste servidor? (GPT Image vai na OpenAI ou, sem a chave, no fal.) */
export function modeloDisponivel(modelo: Modelo): boolean {
  if (modelo === "gpt-image" && getOpenAIKey()) return true;
  if (MODELOS_IMAGEM[modelo].provedor === "gemini") return !!process.env.GEMINI_API_KEY?.trim();
  return !!getFal();
}

/**
 * Imagem quadrada com qualquer modelo de imagem (menos a persona), a partir
 * de um prompt e de referências já no S3 (na ordem dada). Devolve o JPEG.
 * Os erros de cada serviço sobem como são (ImageBlockedError, OpenAIImagemError…).
 */
export async function gerarQuadradaComModelo(o: {
  s3: S3Client;
  modelo: Modelo;
  qualidade: "padrao" | "pro";
  prompt: string;
  keys: string[];
}): Promise<Buffer> {
  if (o.modelo === "gpt-image" && getOpenAIKey()) {
    // A OpenAI recebe as referências como arquivo.
    const referencias = await Promise.all(
      o.keys.map(async (k) => {
        const r = await shrinkReferencia(await getObjectBuffer(o.s3, k));
        return { mimeType: r.mimeType, data: Buffer.from(r.data, "base64") };
      }),
    );
    const bruto = await gerarImagemOpenAI({ tipo: "quadrado", prompt: o.prompt, referencias, qualidade: o.qualidade });
    return sharp(bruto).jpeg({ quality: 90 }).toBuffer();
  }
  if (MODELOS_IMAGEM[o.modelo].provedor === "gemini") {
    const referencias = await Promise.all(o.keys.map(async (k) => shrinkReferencia(await getObjectBuffer(o.s3, k))));
    return generateImage({
      prompt: o.prompt,
      referencias,
      aspectRatio: "1:1",
      imageSize: o.qualidade === "pro" ? "2K" : "1K",
      qualidade: o.qualidade,
    });
  }
  const fal = getFal();
  if (!fal) throw new Error("Modelo indisponível: FAL_KEY não configurada no servidor.");
  // O fal baixa as referências por URL.
  const imageUrls = await Promise.all(o.keys.map((k) => presignGet(o.s3, k, 3600)));
  const bruto = await gerarImagemFal(fal, {
    modelo: o.modelo as Exclude<Modelo, "nano-banana">,
    tipo: "quadrado",
    prompt: o.prompt,
    imageUrls,
    qualidade: o.qualidade,
  });
  return sharp(bruto).rotate().jpeg({ quality: 90 }).toBuffer();
}
