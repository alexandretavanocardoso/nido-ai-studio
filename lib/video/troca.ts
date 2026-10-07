import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { FalClient } from "@fal-ai/client";
import type { S3Client } from "@aws-sdk/client-s3";
import { newKey, uploadFromFile } from "@/lib/storage/s3";
import {
  extrairAudio,
  juntarTrechos,
  prepararTrechoTroca,
  temAudio,
  trechosTroca,
  type VideoInfo,
} from "./ffmpeg";
import { baixarTrechos, estadoLote, type EstadoLote, type Segmento } from "./lote";
import { comPastaTemporaria } from "./server";
import { webhookUrl } from "./webhook";

/**
 * Troca de pessoa (fal.ai): troca só a pessoa pelo personagem e mantém
 * cenário, câmera, movimento e o áudio original. Dois motores:
 *  - kling    → Kling O1 Edit (padrão, US$ 0,126/s). Aceita trechos de 3–10s.
 *  - seedance → Seedance 2.5 em modo edição (premium, US$ 0,284/s em 720p).
 *               Aceita até 30s de uma vez: preserva melhor cenário, objetos e roupa.
 * O vídeo vira trechos iguais do tamanho máximo do motor (lado menor ≥ 720px),
 * processados em paralelo; no fim eles são juntados e o áudio original
 * (música, fala) volta por baixo.
 *
 * A personagem vai SEM fundo (recortada e sobre branco) — com fundo, o modelo
 * copia o cenário da imagem em vez de manter o do vídeo.
 */
export type MotorTroca = "kling" | "seedance";

export const MOTORES_TROCA: Record<MotorTroca, { modelo: string; maxTrecho: number }> = {
  kling: { modelo: "fal-ai/kling-video/o1/standard/video-to-video/edit", maxTrecho: 10 },
  seedance: { modelo: "bytedance/seedance-2.5/reference-to-video", maxTrecho: 30 },
};
const MODELO_RECORTE = "fal-ai/birefnet/v2";

export function ehModeloTroca(modelo: string): boolean {
  return Object.values(MOTORES_TROCA).some((m) => m.modelo === modelo);
}

export interface InputTroca {
  motor: MotorTroca;
  segmentos: Segmento[];
  /** Áudio original (no storage do fal), se o vídeo tinha som. */
  audioUrl: string | null;
}

/** Quem sai do vídeo e quem entra. Sem `descricao`: a pessoa principal do vídeo. */
export interface AlvoTroca {
  personagemUrl: string;
  descricao?: string;
}

/** Pedido à IA. Com descrições, troca SÓ as pessoas descritas (cada uma pelo seu personagem). */
export function promptTroca(
  motor: MotorTroca,
  alvos: Array<Pick<AlvoTroca, "descricao">>,
  removerTexto: boolean,
): string {
  const ref = (i: number) => (motor === "kling" ? `@Element${i + 1}` : `@Image${i + 1}`);
  const comDescricao = alvos.some((a) => a.descricao);
  const troca = comDescricao
    ? [
        `In @Video1, replace ONLY ${alvos.length === 1 ? "this person" : "these people"}:`,
        ...alvos.map(
          (a, i) => `- ${a.descricao ?? "the main person"} → replace with the character ${ref(i)}.`,
        ),
        "Every other person in the video must stay exactly as they are (same face, clothes and movements).",
      ].join("\n")
    : `Replace only the main person in @Video1 with the character ${ref(0)}.`;
  return [
    troca,
    "Keep the original background, scenery, objects, camera angle, framing, lighting and all movements of @Video1 unchanged.",
    `Keep each character's face, hair, style and outfit exactly as in ${alvos.map((_, i) => ref(i)).join(", ")}.`,
    removerTexto ? "Remove all on-screen text, captions and subtitles." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function inputMotor(
  motor: MotorTroca,
  o: { videoUrl: string; alvos: AlvoTroca[]; duracao: number; removerTexto: boolean },
): Record<string, unknown> {
  if (motor === "kling")
    return {
      prompt: promptTroca(motor, o.alvos, o.removerTexto),
      video_url: o.videoUrl,
      keep_audio: false,
      // O Kling pede 1 a 3 imagens extras de cada personagem; a principal serve.
      elements: o.alvos.map((a) => ({
        frontal_image_url: a.personagemUrl,
        reference_image_urls: [a.personagemUrl],
      })),
    };
  return {
    task: "editing",
    prompt: promptTroca(motor, o.alvos, o.removerTexto),
    video_urls: [o.videoUrl],
    image_urls: o.alvos.map((a) => a.personagemUrl),
    resolution: "720p",
    // Duração do trecho (o Seedance gera de 4 a 30s); o áudio original corta o excesso no final.
    duration: Math.min(30, Math.max(4, Math.round(o.duracao))),
    generate_audio: false,
  };
}

async function enviar(fal: FalClient, arquivo: string, tipo: string): Promise<string> {
  return fal.storage.upload(new Blob([new Uint8Array(await readFile(arquivo))], { type: tipo }));
}

/** Personagem recortada sobre branco liso. Se o recorte falhar, segue com a imagem original. */
export async function personagemSemFundo(fal: FalClient, imagem: Buffer): Promise<string> {
  const original = await fal.storage.upload(new Blob([new Uint8Array(imagem)], { type: "image/jpeg" }));
  try {
    const r = await fal.subscribe(MODELO_RECORTE, {
      input: { image_url: original, model: "General Use (Heavy)", output_format: "png" },
    });
    const url = (r.data as { image?: { url?: string } })?.image?.url;
    if (!url) return original;
    const recorte = Buffer.from(await (await fetch(url)).arrayBuffer());
    const branco = await sharp(recorte).flatten({ background: "#ffffff" }).png().toBuffer();
    return fal.storage.upload(new Blob([new Uint8Array(branco)], { type: "image/png" }));
  } catch (e) {
    console.warn("[troca] recorte da personagem falhou, usando a imagem original:", (e as Error).message);
    return original;
  }
}

/** Divide o vídeo (já baixado em `arquivo`), envia os trechos ao motor e guarda o áudio original. */
export async function iniciarTroca(o: {
  fal: FalClient;
  motor: MotorTroca;
  arquivo: string;
  info: VideoInfo;
  alvos: AlvoTroca[];
  removerTexto: boolean;
  jobId: string;
}): Promise<InputTroca> {
  const { modelo, maxTrecho } = MOTORES_TROCA[o.motor];
  return comPastaTemporaria(async (dir) => {
    let audioUrl: string | null = null;
    if (await temAudio(o.arquivo)) {
      const audio = path.join(dir, "audio.m4a");
      await extrairAudio(o.arquivo, audio);
      audioUrl = await enviar(o.fal, audio, "audio/mp4");
    }
    const segmentos = await Promise.all(
      trechosTroca(o.info.duracao, maxTrecho).map(async (t, i) => {
        const seg = path.join(dir, `seg-${i}.mp4`);
        await prepararTrechoTroca(o.arquivo, t.inicio, t.duracao, seg, o.info);
        const videoUrl = await enviar(o.fal, seg, "video/mp4");
        const { request_id } = await o.fal.queue.submit(modelo, {
          input: inputMotor(o.motor, {
            videoUrl,
            alvos: o.alvos,
            duracao: t.duracao,
            removerTexto: o.removerTexto,
          }),
          webhookUrl: webhookUrl(o.jobId),
        });
        return { requestId: request_id, inicio: t.inicio, duracao: t.duracao };
      }),
    );
    return { motor: o.motor, segmentos, audioUrl };
  });
}

export function estadoTroca(fal: FalClient, input: InputTroca): Promise<EstadoLote> {
  return estadoLote(fal, MOTORES_TROCA[input.motor ?? "kling"].modelo, input.segmentos);
}

/** Junta os trechos gerados, devolve o áudio original e salva no S3. */
export async function comporTroca(o: {
  s3: S3Client;
  userId: string;
  input: InputTroca;
  urls: string[];
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const trechos = await baixarTrechos(o.urls, dir, "troca");
    let audio: string | null = null;
    if (o.input.audioUrl) {
      const res = await fetch(o.input.audioUrl);
      if (res.ok) {
        audio = path.join(dir, "audio.m4a");
        await (await import("node:fs/promises")).writeFile(audio, Buffer.from(await res.arrayBuffer()));
      } else console.warn("[troca] áudio original indisponível (HTTP", res.status, ") — vídeo sai sem som");
    }
    const saida = path.join(dir, "final.mp4");
    await juntarTrechos({ trechos, duracoes: o.input.segmentos.map((g) => g.duracao), audio, saida });
    const key = newKey(o.userId, "videos", "video/mp4");
    const size = await uploadFromFile(o.s3, key, saida, "video/mp4");
    return { key, size };
  });
}
