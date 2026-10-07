import { ApiError, GoogleGenAI } from "@google/genai";
import sharp from "sharp";

/**
 * Geração de imagem com Nano Banana (API do Gemini). Server-side apenas.
 *
 * Modelos configuráveis por env:
 *   GEMINI_IMAGE_MODEL      padrão "gemini-3.1-flash-image" (Nano Banana 2)
 *   GEMINI_IMAGE_MODEL_PRO  padrão "gemini-3-pro-image"     (Nano Banana Pro)
 */
const MODELS = {
  padrao: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image",
  pro: process.env.GEMINI_IMAGE_MODEL_PRO ?? "gemini-3-pro-image",
} as const;

export type QualidadeImagem = keyof typeof MODELS;

export class ImageConfigError extends Error {}
export class ImageProviderError extends Error {}
/** O modelo respondeu, mas sem imagem (bloqueio de segurança, recusa…). */
export class ImageBlockedError extends Error {}

export interface ReferenciaInline {
  mimeType: string;
  /** base64 puro, sem o prefixo data: */
  data: string;
}

interface GenerateOptions {
  prompt: string;
  referencias: ReferenciaInline[];
  aspectRatio: string;
  imageSize: "1K" | "2K";
  qualidade: QualidadeImagem;
}

/** Gera a imagem e devolve em JPEG. */
export async function generateImage(opts: GenerateOptions): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey)
    throw new ImageConfigError("GEMINI_API_KEY não configurada no servidor.");
  const ai = new GoogleGenAI({ apiKey });

  let res;
  try {
    res = await ai.models.generateContent({
      model: MODELS[opts.qualidade],
      contents: [
        {
          role: "user",
          parts: [
            { text: opts.prompt },
            ...opts.referencias.map((r) => ({
              inlineData: { mimeType: r.mimeType, data: r.data },
            })),
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: {
          aspectRatio: opts.aspectRatio,
          imageSize: opts.imageSize,
        },
      },
    });
  } catch (err) {
    console.error("[gemini] generateContent:", (err as Error).message);
    throw new ImageProviderError(mensagemDeErro(err));
  }

  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!img?.data) {
    const motivo =
      res.promptFeedback?.blockReason ??
      res.candidates?.[0]?.finishReason ??
      "sem imagem";
    const texto = parts
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();
    throw new ImageBlockedError(
      `O Gemini não devolveu imagem (${motivo}).${texto ? ` Resposta: ${texto.slice(0, 300)}` : ""}`,
    );
  }

  // O Gemini devolve PNG; reencoda em JPEG pra caber no limite de resposta da
  // Vercel (4,5 MB) e ficar leve no S3 / IndexedDB.
  return sharp(Buffer.from(img.data, "base64"))
    .jpeg({ quality: 90 })
    .toBuffer();
}

function mensagemDeErro(err: unknown): string {
  const status = err instanceof ApiError ? err.status : undefined;
  const msg = (err as Error)?.message ?? "";
  if (status === 429 && msg.includes("free_tier"))
    return "A chave do Gemini está no plano gratuito, que não inclui geração de imagem. Ative o faturamento no Google AI Studio.";
  if (status === 429)
    return "Limite de uso do Gemini atingido. Tente de novo em alguns minutos.";
  if (status === 400 && /api key/i.test(msg))
    return "Chave do Gemini inválida. Confira GEMINI_API_KEY.";
  if (status === 403)
    return "A chave do Gemini não tem permissão para este modelo.";
  if (status === 404)
    return "Modelo de imagem do Gemini não encontrado. Confira GEMINI_IMAGE_MODEL.";
  return "Falha ao chamar o Gemini. Tente de novo em instantes.";
}

/** Reduz uma imagem de referência (lado maior ≤ 1024px, JPEG) antes de mandar ao Gemini. */
export async function shrinkReferencia(buf: Buffer): Promise<ReferenciaInline> {
  const jpeg = await sharp(buf)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { mimeType: "image/jpeg", data: jpeg.toString("base64") };
}

const PROPORCOES: Array<[string, number]> = [
  ["9:16", 9 / 16],
  ["2:3", 2 / 3],
  ["3:4", 3 / 4],
  ["1:1", 1],
  ["4:3", 4 / 3],
  ["3:2", 3 / 2],
  ["16:9", 16 / 9],
];

/** Proporção suportada pelo Gemini mais próxima de largura/altura. */
export function proporcaoMaisProxima(largura: number, altura: number): string {
  const r = largura / altura;
  return PROPORCOES.reduce((a, b) =>
    Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a,
  )[0];
}
