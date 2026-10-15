import sharp from "sharp";
import type { S3Client } from "@aws-sdk/client-s3";
import { presignGet } from "@/lib/storage/s3";
import { promptComAcao, type CenaFalada } from "./falado";
import type { EstadoVideo } from "./jobs";
import type { ModeloCriar, ModeloFalado } from "./precos";

/**
 * Sapiens Sintéticos (API no formato da OpenAI, cobrada do saldo em dólar da conta).
 *  - image-to-video (Kling V3 Standard, Veo 3.1 Fast): cria um vídeo novo a
 *    partir da imagem do personagem e de um texto, mais barato que no Runway.
 *  - reference-to-video (Seedance): vídeo falado de corpo inteiro, com a
 *    imagem e o áudio da fala como referências.
 * A API está em beta: modelo e preço podem mudar (conferir em GET /models e
 * POST /videos/quote). Server-side apenas. Chave em SAPIENS_KEY.
 */
const BASE = "https://www.sapiensinteticos.com/api/v1";

/** Id de cada modelo de "Criar vídeo" no Sapiens (os outros só existem no Runway). */
export const MODELO_SAPIENS: Partial<Record<ModeloCriar, string>> = {
  kling_v3: "kling-v3-standard-image-to-video",
  "veo3.1_fast": "veo3.1-fast-image-to-video",
};

/** Id de cada modelo do vídeo falado que roda no Sapiens. */
export const MODELO_SAPIENS_FALADO: Partial<Record<ModeloFalado, string>> = {
  seedance20_mini: "seedance-2-0-mini-reference-to-video-basic",
  seedance20_fast: "seedance-2-0-fast-reference-to-video-basic",
  seedance25: "seedance-2-5-reference-to-video-basic",
  seedance20: "seedance-2-0-reference-to-video-basic",
};

export function getSapiens(): string | null {
  return process.env.SAPIENS_KEY?.trim() || null;
}

/** Erro da API do Sapiens, com o HTTP e o `code` que ela devolve. */
export class ErroSapiens extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  /** Fila cheia ou motor fora do ar: nada foi cobrado, dá para tentar de novo. */
  get passageiro(): boolean {
    return this.status === 429 || this.status === 502 || this.status === 503;
  }
}

interface VideoSapiens {
  id: string;
  status: string;
  progress?: number;
  url?: string;
  error?: { message?: string } | string | null;
}

async function chamar(
  chave: string,
  caminho: string,
  corpo?: Record<string, unknown>,
): Promise<{ video: VideoSapiens; cobrado: string | null }> {
  const res = await fetch(`${BASE}${caminho}`, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${chave}`,
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | (VideoSapiens & { error?: { message?: string; code?: string } })
    | null;
  if (!res.ok || !json) {
    const erro = json?.error as { message?: string; code?: string } | undefined;
    throw new ErroSapiens(
      erro?.message ?? `HTTP ${res.status}`,
      res.status,
      erro?.code,
    );
  }
  return { video: json, cobrado: res.headers.get("x-sapiens-charge-usd") };
}

/**
 * O Sapiens gera o vídeo no formato da imagem (não aceita proporção no
 * image-to-video), então a imagem inicial é recortada para 9:16 ou 16:9 antes.
 */
export async function recortarParaFormato(
  imagem: Buffer,
  vertical: boolean,
): Promise<Buffer> {
  return sharp(imagem)
    .rotate()
    .resize(vertical ? 720 : 1280, vertical ? 1280 : 720, { fit: "cover" })
    .jpeg({ quality: 92 })
    .toBuffer();
}

export async function enviarCriacaoSapiens(
  chave: string,
  input: {
    modelo: ModeloCriar;
    /** Já no formato do vídeo (ver `recortarParaFormato`). */
    imageUrl: string;
    promptText: string;
    duracao: number;
    audio: boolean;
  },
): Promise<string> {
  const model = MODELO_SAPIENS[input.modelo];
  if (!model) throw new Error("Este modelo não está disponível no Sapiens.");
  const { video, cobrado } = await chamar(chave, "/videos", {
    model,
    prompt: input.promptText.slice(0, 1000),
    image_url: input.imageUrl,
    seconds: input.duracao,
    resolution: "720p",
    audio: input.audio,
  });
  console.info("[sapiens] vídeo na fila:", video.id, model, `US$ ${cobrado}`);
  return video.id;
}

/**
 * Pede uma cena falada de corpo inteiro: o Seedance recebe a imagem (já no
 * formato do vídeo, ver `formatoDaImagem`) e o áudio da fala como referências
 * e gera o personagem falando, no ritmo do áudio. De 4 a 15s por cena.
 */
export async function enviarFaladoSapiens(
  chave: string,
  s3: S3Client,
  o: { modelo: ModeloFalado; cena: CenaFalada; vertical: boolean },
): Promise<string> {
  const model = MODELO_SAPIENS_FALADO[o.modelo];
  if (!model) throw new Error("Este modelo não está disponível no Sapiens.");
  const { video, cobrado } = await chamar(chave, "/videos", {
    model,
    prompt: o.cena.acao
      ? promptComAcao({ imagem: "@Image1", audio: "@Audio1" }, o.cena.acao).slice(0, 1000)
      : "The person from @Image1, with the same face, hair and outfit and in the same place as @Image1, stands with the full body in frame and talks directly to the camera, saying exactly the words of @Audio1 with precise lip sync. @Audio1 is the only voice: no other speech, no music. Natural small hand gestures and expression that fit the speech. Static camera. The scene fills the whole frame edge to edge: no borders, no letterbox bars. No text or captions on screen.",
    reference_image_urls: [await presignGet(s3, o.cena.imagemKey, 86_400)],
    reference_audio_urls: [await presignGet(s3, o.cena.audioKey, 86_400)],
    seconds: o.cena.duracao ?? 5,
    resolution: "720p",
    aspect_ratio: o.vertical ? "9:16" : "16:9",
    // O som gerado é trocado pela fala original na união das cenas.
    audio: true,
  });
  console.info(
    "[sapiens] cena falada na fila:",
    video.id,
    model,
    `US$ ${cobrado}`,
  );
  return video.id;
}

/** O Sapiens pede no máximo uma consulta a cada 15s por vídeo; a tela consulta a cada 10s. */
const INTERVALO_MS = 15_000;
const ultimas = new Map<string, { em: number; estado: EstadoVideo }>();

export async function consultarSapiens(
  chave: string,
  id: string,
): Promise<EstadoVideo> {
  const ultima = ultimas.get(id);
  if (ultima && Date.now() - ultima.em < INTERVALO_MS) return ultima.estado;
  let video: VideoSapiens;
  try {
    ({ video } = await chamar(chave, `/videos/${encodeURIComponent(id)}`));
  } catch (e) {
    // Falha passageira da consulta não derruba o job: a próxima tenta de novo.
    if (e instanceof ErroSapiens && e.passageiro)
      return { estado: "processando" };
    return { estado: "erro", mensagem: mensagemDeErroSapiens(e) };
  }
  const estado = estadoDoVideo(video);
  if (estado.estado === "na_fila" || estado.estado === "processando") {
    if (ultimas.size > 500) ultimas.clear();
    ultimas.set(id, { em: Date.now(), estado });
  } else ultimas.delete(id);
  return estado;
}

function estadoDoVideo(v: VideoSapiens): EstadoVideo {
  switch (v.status) {
    case "queued":
      return { estado: "na_fila" };
    case "completed":
      return v.url
        ? { estado: "concluido", videoUrl: v.url }
        : { estado: "erro", mensagem: "O Sapiens não devolveu vídeo." };
    case "failed": {
      const motivo = typeof v.error === "string" ? v.error : v.error?.message;
      return {
        estado: "erro",
        mensagem: motivo
          ? `O Sapiens falhou: ${motivo}`
          : "O Sapiens não conseguiu gerar o vídeo.",
      };
    }
    default:
      return {
        estado: "processando",
        // `progress` vem em porcentagem (0 a 100), quando vem.
        progresso:
          typeof v.progress === "number" ? v.progress / 100 : undefined,
      };
  }
}

export function mensagemDeErroSapiens(e: unknown): string {
  if (e instanceof ErroSapiens) {
    if (e.status === 401)
      return "Chave do Sapiens inválida. Confira SAPIENS_KEY.";
    if (e.status === 402)
      return "Sem saldo na API do Sapiens. Recarregue em sapiensinteticos.com.";
    if (e.status === 400) return `O Sapiens recusou a entrada: ${e.message}`;
    if (e.passageiro)
      return "O Sapiens está ocupado agora. Tente em alguns minutos.";
    return `Falha no Sapiens (HTTP ${e.status}).`;
  }
  return (e as Error)?.message || "Falha no Sapiens.";
}
