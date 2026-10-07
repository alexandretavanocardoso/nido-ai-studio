import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FalClient } from "@fal-ai/client";
import type { S3Client } from "@aws-sdk/client-s3";
import { downloadToFile, newKey, uploadFromFile } from "@/lib/storage/s3";
import { comporRemocaoIA, criarMascara, probe, recortarTrecho, trechos, type Caixa, type VideoInfo } from "./ffmpeg";
import { estadoLote, type EstadoLote, type Segmento } from "./lote";
import { comPastaTemporaria } from "./server";
import { webhookUrl } from "./webhook";

/**
 * Remoção de legenda com IA (fundos complexos): Bria Video Eraser com máscara
 * no fal.ai. O modelo aceita até 5s, então o vídeo vira trechos de ~4,8s
 * processados em paralelo; no fim, os trechos limpos são juntados e só a área
 * da legenda é aplicada sobre o original (o resto da imagem e o áudio não mudam).
 */
export const MODELO_ERASER = "bria/video/erase/mask";

export type { Segmento } from "./lote";

export interface InputLegendaIA {
  videoKey: string;
  caixa: Caixa;
  modo: "remover" | "trocar";
  texto?: string;
  info: VideoInfo;
  segmentos: Segmento[];
}

async function enviarArquivo(fal: FalClient, arquivo: string): Promise<string> {
  return fal.storage.upload(new Blob([await readFile(arquivo)], { type: "video/mp4" }));
}

/** Corta o vídeo e a máscara em trechos e envia todos ao fal (com webhook). */
export async function iniciarLegendaIA(o: {
  fal: FalClient;
  s3: S3Client;
  videoKey: string;
  caixa: Caixa;
  jobId: string;
}): Promise<{ info: VideoInfo; segmentos: Segmento[] }> {
  return comPastaTemporaria(async (dir) => {
    const original = path.join(dir, "original.mp4");
    await downloadToFile(o.s3, o.videoKey, original);
    const info = await probe(original);
    const mascara = path.join(dir, "mascara.mp4");
    await criarMascara(mascara, info, o.caixa, info.duracao);

    const segmentos = await Promise.all(
      trechos(info.duracao).map(async (t, i) => {
        const seg = path.join(dir, `seg-${i}.mp4`);
        const msk = path.join(dir, `msk-${i}.mp4`);
        await recortarTrecho(original, t.inicio, t.duracao, seg);
        await recortarTrecho(mascara, t.inicio, t.duracao, msk);
        const [video_url, mask_video_url] = await Promise.all([enviarArquivo(o.fal, seg), enviarArquivo(o.fal, msk)]);
        const { request_id } = await o.fal.queue.submit(MODELO_ERASER, {
          input: { video_url, mask_video_url, output_container_and_codec: "mp4_h264", preserve_audio: false },
          webhookUrl: webhookUrl(o.jobId),
        });
        return { requestId: request_id, inicio: t.inicio, duracao: t.duracao };
      })
    );
    return { info, segmentos };
  });
}

/** Estado do conjunto: pronto só quando todos os trechos terminam; qualquer falha derruba o job. */
export function estadoLegendaIA(fal: FalClient, segmentos: Segmento[]): Promise<EstadoLote> {
  return estadoLote(fal, MODELO_ERASER, segmentos);
}

/** Baixa os trechos limpos, recompõe sobre o original e salva no S3. */
export async function comporLegendaIA(o: {
  s3: S3Client;
  userId: string;
  input: InputLegendaIA;
  urls: string[];
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const original = path.join(dir, "original.mp4");
    await downloadToFile(o.s3, o.input.videoKey, original);
    const trechosIA = await Promise.all(
      o.urls.map(async (url, i) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download do trecho ${i + 1} falhou (HTTP ${res.status})`);
        const arquivo = path.join(dir, `ia-${i}.mp4`);
        await writeFile(arquivo, Buffer.from(await res.arrayBuffer()));
        return arquivo;
      })
    );
    const saida = path.join(dir, "final.mp4");
    await comporRemocaoIA({
      original,
      trechosIA,
      saida,
      tmpDir: dir,
      info: o.input.info,
      caixa: o.input.caixa,
      texto: o.input.modo === "trocar" ? o.input.texto : undefined,
    });
    const key = newKey(o.userId, "videos", "video/mp4");
    const size = await uploadFromFile(o.s3, key, saida, "video/mp4");
    return { key, size };
  });
}
