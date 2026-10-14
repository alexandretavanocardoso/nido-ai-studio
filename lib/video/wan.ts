import type { FalClient } from "@fal-ai/client";
import type { S3Client } from "@aws-sdk/client-s3";
import { presignGet } from "@/lib/storage/s3";
import type { CenaFalada } from "./falado";
import { webhookUrl } from "./webhook";

/**
 * Wan 3.0 (Alibaba) no fal, em 720p (US$ 0,10/s, com ou sem áudio — conferido
 * em 14/10/2026). Dois usos:
 *  - Criar vídeo (cena): image-to-video, a imagem do personagem é o primeiro
 *    quadro. Gera de 2 a 30s de uma vez.
 *  - Vídeo falado de corpo inteiro: reference-to-video, com a imagem e o áudio
 *    da fala como referências — o personagem fala o áudio, com os lábios
 *    sincronizados. Áudio de referência: até 15s por pedido.
 * O fal avisa pelo webhook quando termina; a consulta do job também confere.
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

/** Pede uma cena falada de corpo inteiro (imagem e fala como referências). */
export async function enviarFaladoWan(
  fal: FalClient,
  s3: S3Client,
  o: { jobId: string; cena: CenaFalada; vertical: boolean },
): Promise<string> {
  const { request_id } = await fal.queue.submit(WAN_REFERENCIA, {
    input: {
      prompt:
        "The person from Image 1, with the same face, hair and outfit and in the same place as Image 1, stands with the full body in frame and talks directly to the camera, saying exactly the words of Audio 1 with precise lip sync. Audio 1 is the only voice: no other speech, no music. Natural small hand gestures and expression that fit the speech. Static camera. The scene fills the whole frame edge to edge: no borders, no letterbox bars, no coloured bands. No text or captions on screen.",
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
