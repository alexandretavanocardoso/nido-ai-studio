import type { FalClient } from "@fal-ai/client";
import type { S3Client } from "@aws-sdk/client-s3";
import { presignGet } from "@/lib/storage/s3";
import { promptComAcao, type CenaFalada } from "./falado";
import { webhookUrl } from "./webhook";

/**
 * Wan 3.0 (Alibaba) no fal, em 720p (US$ 0,10/s, com ou sem áudio — conferido
 * em 14/10/2026). Três usos:
 *  - Criar vídeo (cena): reference-to-video, com o personagem SEM fundo como
 *    referência. Como primeiro quadro (image-to-video), o vídeo começava na
 *    foto, com o fundo dela, e se fundia com a cena (visto em 15/10/2026).
 *    Gera de 2 a 30s de uma vez.
 *  - Imagem que já é o primeiro quadro (cena do vídeo de produto, continuação
 *    de uma cena): image-to-video.
 *  - Vídeo falado de corpo inteiro: reference-to-video, com a imagem e o áudio
 *    da fala como referências — o personagem fala o áudio, com os lábios
 *    sincronizados. Áudio de referência: até 15s por pedido.
 * O fal avisa pelo webhook quando termina; a consulta do job também confere
 * (a fila do fal é a do app, alibaba/wan-3.0: os dois endpoints se consultam igual).
 */
export const WAN_IMAGEM = "alibaba/wan-3.0/image-to-video";
export const WAN_REFERENCIA = "alibaba/wan-3.0/reference-to-video";

/**
 * Endpoint do fal de um job, pela coluna `modelo` de video_jobs: o "criar
 * vídeo" grava o id do modelo ("wan3"); os outros jobs do fal já gravam o
 * endpoint.
 */
export const endpointFal = (modelo: string) =>
  modelo === "wan3" ? WAN_IMAGEM : modelo;

export async function enviarCriacaoWan(
  fal: FalClient,
  o: {
    jobId: string;
    /** Já no formato do vídeo (ver `recortarParaFormato`). */
    imageUrl: string;
    promptText: string;
    vertical: boolean;
    duracao: number;
    audio: boolean;
  },
): Promise<string> {
  const { request_id } = await fal.queue.submit(WAN_IMAGEM, {
    input: {
      prompt: o.promptText.slice(0, 1000),
      start_image_url: o.imageUrl,
      resolution: "720p",
      aspect_ratio: o.vertical ? "9:16" : "16:9",
      duration: o.duracao,
      audio: o.audio,
    },
    webhookUrl: webhookUrl(o.jobId),
  });
  return request_id;
}

/** Limite do texto do pedido no Wan (o mesmo usado nos outros pedidos). */
const MAX_PROMPT = 1000;

/**
 * Texto do Criar vídeo por referência: a pessoa das imagens, sem o fundo
 * branco do recorte, já dentro da cena descrita desde o primeiro quadro.
 */
export function promptCriacaoWan(cena: string, comRosto: boolean): string {
  const antes = `The person from Image 1${comRosto ? " (Image 2 is a close-up of the same person's face)" : ""}, with exactly the same face, hair, body and outfit, is inside the scene below from the very first frame. Image 1 is a cutout on a plain white background: never show that white background or a studio backdrop; the scene fills the whole frame edge to edge. Scene: `;
  return antes + cena.trim().slice(0, MAX_PROMPT - antes.length);
}

/**
 * Criar vídeo por referência: o personagem recortado sobre branco (e o close do
 * rosto, quando há) entra na cena do texto — nenhum quadro vem da foto.
 */
export async function enviarCriacaoWanReferencia(
  fal: FalClient,
  o: {
    jobId: string;
    /** Personagem sem fundo, sobre branco (ver `personagemSemFundo` em ./troca). */
    figuraUrl: string;
    /** Close do rosto: segunda referência, para o rosto não mudar. */
    rostoUrl: string | null;
    promptText: string;
    vertical: boolean;
    duracao: number;
    audio: boolean;
  },
): Promise<string> {
  const { request_id } = await fal.queue.submit(WAN_REFERENCIA, {
    input: {
      prompt: promptCriacaoWan(o.promptText, !!o.rostoUrl),
      reference_image_urls: o.rostoUrl ? [o.figuraUrl, o.rostoUrl] : [o.figuraUrl],
      resolution: "720p",
      aspect_ratio: o.vertical ? "9:16" : "16:9",
      duration: o.duracao,
      audio: o.audio,
    },
    webhookUrl: webhookUrl(o.jobId),
  });
  return request_id;
}

/** Pede uma cena falada de corpo inteiro (imagem e fala como referências). */
export async function enviarFaladoWan(
  fal: FalClient,
  s3: S3Client,
  o: { jobId: string; cena: CenaFalada; vertical: boolean },
): Promise<string> {
  const { request_id } = await fal.queue.submit(WAN_REFERENCIA, {
    input: {
      prompt: o.cena.acao
        ? promptComAcao({ imagem: "Image 1", audio: "Audio 1" }, o.cena.acao).slice(0, 1000)
        : "The person from Image 1, with the same face, hair and outfit and in the same place as Image 1, stands with the full body in frame and talks directly to the camera, saying exactly the words of Audio 1 with precise lip sync. Audio 1 is the only voice: no other speech, no music. Natural small hand gestures and expression that fit the speech. Static camera. The scene fills the whole frame edge to edge: no borders, no letterbox bars, no coloured bands. No text or captions on screen.",
      reference_image_urls: [await presignGet(s3, o.cena.imagemKey, 86_400)],
      reference_audio_urls: [await presignGet(s3, o.cena.audioKey, 86_400)],
      resolution: "720p",
      aspect_ratio: o.vertical ? "9:16" : "16:9",
      duration: o.cena.duracao ?? 5,
      // O som gerado é trocado pela fala original na união das cenas.
      audio: true,
    },
    webhookUrl: webhookUrl(o.jobId),
  });
  return request_id;
}
