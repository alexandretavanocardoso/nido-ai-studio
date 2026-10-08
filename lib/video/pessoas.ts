import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp, { type Sharp } from "sharp";
import { GoogleGenAI } from "@google/genai";
import type { FalClient } from "@fal-ai/client";
import { extrairQuadro } from "./ffmpeg";

/**
 * Escolher QUEM trocar (no vídeo ou numa foto): a pessoa clica em cima de cada
 * pessoa. Aqui cada ponto vira uma descrição curta ("o homem de camiseta
 * cinza, ajoelhado à direita") que vai no pedido à IA — os motores de troca
 * entendem texto, não coordenadas.
 */
export interface PessoaMarcada {
  /** Posição do clique, em frações do quadro (0–1). */
  x: number;
  y: number;
  /** Instante do vídeo (s) em que a pessoa foi marcada (0 numa foto). */
  t: number;
}

// Alias que acompanha o Flash atual (modelos antigos são desligados para contas novas).
const MODELO_VISAO =
  process.env.GEMINI_TEXT_MODEL?.trim() || "gemini-flash-latest";

/** Posição em palavras — serve de reserva se a descrição por IA falhar. */
export function posicaoEmPalavras(p: Pick<PessoaMarcada, "x" | "y">): string {
  const h =
    p.x < 0.36
      ? "on the left side"
      : p.x > 0.64
        ? "on the right side"
        : "in the center";
  const v = p.y < 0.33 ? "upper part" : p.y > 0.66 ? "lower part" : "middle";
  return `the person ${h} of the frame (${v})`;
}

/** Imagem reduzida com um alvo vermelho no ponto marcado. */
export async function marcarPonto(
  imagem: Buffer,
  p: Pick<PessoaMarcada, "x" | "y">,
): Promise<Buffer> {
  const base = await sharp(imagem)
    .rotate()
    .resize(1024, 1024, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const cx = Math.round(p.x * width);
  const cy = Math.round(p.y * height);
  const r = Math.round(Math.min(width, height) * 0.045);
  const svg = `<svg width="${width}" height="${height}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ff0033" stroke-width="${Math.max(4, r / 4)}"/><circle cx="${cx}" cy="${cy}" r="${Math.max(3, r / 5)}" fill="#ff0033"/></svg>`;
  return sharp(base.data)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

const MODELO_SILHUETA = "fal-ai/sam2/image";
/** Lado maior da silhueta devolvida à tela (é só um destaque, não precisa de mais). */
const LADO_SILHUETA = 512;

/**
 * Máscara em tons de cinza (pessoa clara) → PNG branco com transparência fora
 * da pessoa. Null se pegou quase nada ou o quadro inteiro.
 */
async function finalizarSilhueta(mascara: Sharp): Promise<Buffer | null> {
  const cinza = await mascara
    .greyscale()
    .threshold(128)
    .blur(1)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = cinza.info;
  let claros = 0;
  for (let i = 0; i < cinza.data.length; i += channels)
    if (cinza.data[i] > 127) claros++;
  const coberto = claros / (width * height);
  if (coberto < 0.003 || coberto > 0.85) return null;
  const alfa = Buffer.alloc(width * height);
  for (let i = 0; i < alfa.length; i++) alfa[i] = cinza.data[i * channels];
  return sharp({
    create: { width, height, channels: 3, background: "#fff" },
  })
    .joinChannel(alfa, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

/** Silhueta pelo SAM 2 (fal.ai), a partir do ponto clicado. */
async function silhuetaSam(
  fal: FalClient,
  imagem: Buffer,
  p: Pick<PessoaMarcada, "x" | "y">,
): Promise<Buffer | null> {
  const base = await sharp(imagem)
    .rotate()
    .resize(1024, 1024, { fit: "inside" })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const url = await fal.storage.upload(
    new Blob([new Uint8Array(base.data)], { type: "image/jpeg" }),
  );
  const r = await fal.subscribe(MODELO_SILHUETA, {
    input: {
      image_url: url,
      prompts: [
        // A API exige o número 1 (os tipos do cliente dizem "1", que ela recusa).
        {
          x: Math.round(p.x * width),
          y: Math.round(p.y * height),
          label: 1 as unknown as "1",
        },
      ],
      output_format: "png",
    },
  });
  const saida = (r.data as { image?: { url?: string } })?.image?.url;
  if (!saida) return null;
  const res = await fetch(saida);
  if (!res.ok) return null;
  // A máscara vem clara na pessoa e escura (ou transparente) no resto.
  return finalizarSilhueta(
    sharp(Buffer.from(await res.arrayBuffer()))
      .flatten({ background: "#000" })
      .resize(LADO_SILHUETA, LADO_SILHUETA, { fit: "inside" }),
  );
}

/**
 * Silhueta da pessoa clicada: PNG branco com transparência fora da pessoa, pra
 * tela pintar por cima do quadro. Null sem fal ou se o recorte não servir — a
 * tela fica só com o ponto.
 */
export async function silhuetaDaPessoa(
  imagem: Buffer,
  p: Pick<PessoaMarcada, "x" | "y">,
  fal: FalClient | null,
): Promise<Buffer | null> {
  return fal ? silhuetaSam(fal, imagem, p) : null;
}

/** Descreve UMA pessoa marcada numa imagem (inglês, curto). Sem Gemini ou se falhar, usa a posição. */
async function descreverUma(
  imagem: () => Promise<Buffer>,
  p: Pick<PessoaMarcada, "x" | "y">,
  origem: "video" | "foto",
): Promise<string> {
  const reserva = posicaoEmPalavras(p);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return reserva;
  try {
    const marcada = await marcarPonto(await imagem(), p);
    const ai = new GoogleGenAI({ apiKey });
    const onde =
      origem === "video" ? "This is a frame from a video." : "This is a photo.";
    const resto =
      origem === "video"
        ? "everyone else in the video"
        : "everyone else in the photo";
    // No vídeo a pessoa anda, vira e sai do quadro: posição e pose valem só para
    // aquele instante e fazem o modelo de vídeo perder a pessoa no resto.
    const como =
      origem === "video"
        ? "gender, build, hair, accessories, clothing (colours and pieces) — only what stays the same during the whole video. " +
          "Do NOT mention position in the frame, pose, action or facial expression. "
        : "position in the frame (left/center/right, foreground/background), pose, clothing (colours and pieces), hair. ";
    const res = await ai.models.generateContent({
      model: MODELO_VISAO,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `${onde} A red target marks ONE person. Describe only that person so they can be told apart from ${resto}: ` +
                como +
                'Answer in English, one line, max 30 words, starting with "the". No preamble.',
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: marcada.toString("base64"),
              },
            },
          ],
        },
      ],
    });
    const texto = (res.text ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[."]+$/, "");
    return texto && texto.length > 8 ? texto.slice(0, 220) : reserva;
  } catch (e) {
    console.warn(
      "[pessoas] descrição falhou, usando a posição:",
      (e as Error).message,
    );
    return reserva;
  }
}

/** Descreve cada pessoa marcada no vídeo (no quadro em que foi marcada). */
export async function descreverPessoas(
  arquivo: string,
  pessoas: PessoaMarcada[],
  dir: string,
): Promise<string[]> {
  return Promise.all(
    pessoas.map((p, i) =>
      descreverUma(
        async () => {
          const saida = path.join(dir, `pessoa-${i}.jpg`);
          await extrairQuadro(arquivo, Math.max(0.05, p.t), saida);
          return readFile(saida);
        },
        p,
        "video",
      ),
    ),
  );
}

/** Descreve cada pessoa marcada numa foto. */
export async function descreverPessoasNaFoto(
  foto: Buffer,
  pessoas: Array<Pick<PessoaMarcada, "x" | "y">>,
): Promise<string[]> {
  return Promise.all(
    pessoas.map((p) => descreverUma(async () => foto, p, "foto")),
  );
}
