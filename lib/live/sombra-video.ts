import type { S3Client } from "@aws-sdk/client-s3";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { newKey, presignGet, uploadFromFile } from "@/lib/storage/s3";
import { aplicarAudio, extrairPcm16k, probe, temAudio } from "@/lib/video/ffmpeg";
import { comPastaTemporaria } from "@/lib/video/server";
import { getEleven, pcmParaWav, trocarVoz } from "@/lib/voz/elevenlabs";
import { baixarResultadoDecart } from "./decart";

/**
 * Shadow de vídeo gravado: o Lucy devolve o vídeo com a pessoa trocada; aqui
 * o áudio do original volta para ele — com a voz trocada pela da ElevenLabs,
 * quando escolhida. O resultado fica na Sombra (video_jobs sem personagem).
 */
export interface InputSombraVideo {
  /** De onde veio o vídeo: arquivo enviado (key no S3) ou link (URL pública). */
  origem: { key: string } | { url: string };
  /** Voz para trocar a do vídeo (vazio: fica a voz original). */
  voiceId?: string | null;
  origemDoJob: "sombra_video";
}

export const ehSombraVideo = (input: unknown): input is InputSombraVideo =>
  (input as { origemDoJob?: string } | null)?.origemDoJob === "sombra_video";

/** Pedaço máximo de áudio por troca de voz (1 min em PCM 16 kHz mono). */
const PEDACO_VOZ = 16_000 * 2 * 60;

/** Taxa da voz trocada no vídeo gravado (melhor que os 16 kHz da live). */
export const TAXA_VOZ_VIDEO = 24_000;

/** A voz do vídeo inteiro, pedaço a pedaço (3 por vez), na voz escolhida (24 kHz, sem o som de fundo). */
export async function trocarVozDoAudio(voiceId: string, pcm: Buffer): Promise<Buffer> {
  const el = getEleven();
  if (!el) throw new Error("ElevenLabs não configurada.");
  const pedacos: Buffer[] = [];
  for (let i = 0; i < pcm.length; i += PEDACO_VOZ) pedacos.push(pcm.subarray(i, i + PEDACO_VOZ));
  const saida: Buffer[] = new Array(pedacos.length);
  for (let i = 0; i < pedacos.length; i += 3)
    await Promise.all(
      pedacos.slice(i, i + 3).map(async (p, j) => {
        saida[i + j] = await trocarVoz(el, voiceId, p, TAXA_VOZ_VIDEO, true);
      }),
    );
  return Buffer.concat(saida);
}

async function baixar(url: string, arquivo: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download do vídeo original falhou (HTTP ${res.status})`);
  await writeFile(arquivo, Buffer.from(await res.arrayBuffer()));
}

export async function comporSombraVideo(o: {
  s3: S3Client;
  userId: string;
  /** "decart:<id>" do job pronto. */
  resultado: string;
  input: InputSombraVideo;
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const gerado = path.join(dir, "gerado.mp4");
    const original = path.join(dir, "original");
    const saida = path.join(dir, "final.mp4");
    await writeFile(gerado, await baixarResultadoDecart(o.resultado));
    await baixar(
      "key" in o.input.origem ? await presignGet(o.s3, o.input.origem.key, 3600) : o.input.origem.url,
      original,
    );

    let final = gerado;
    if (await temAudio(original)) {
      let audio = original;
      if (o.input.voiceId) {
        const pcm = path.join(dir, "fala.pcm");
        await extrairPcm16k(original, pcm);
        const nova = await trocarVozDoAudio(o.input.voiceId, await readFile(pcm));
        audio = path.join(dir, "voz.wav");
        await writeFile(audio, pcmParaWav(nova, TAXA_VOZ_VIDEO));
      }
      const { duracao } = await probe(gerado);
      await aplicarAudio({ video: gerado, audio, saida, modo: "substituir", duracao, videoTemAudio: false });
      final = saida;
    }
    const key = newKey(o.userId, "videos", "video/mp4");
    const size = await uploadFromFile(o.s3, key, final, "video/mp4");
    return { key, size };
  });
}
