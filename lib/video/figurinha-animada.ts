import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { downloadToFile, newKey, putObject } from "@/lib/storage/s3";
import { quadrosParaVideo, videoParaWebpAnimado } from "./ffmpeg";
import { comPastaTemporaria } from "./server";

/**
 * Figurinha animada do WhatsApp (WebP animado de 512×512, até 500 KB).
 *
 * Trocar o personagem de uma figurinha animada é uma troca de pessoa em
 * vídeo: a figurinha vira um MP4 curto, passa pelo mesmo motor da troca em
 * vídeo e o resultado volta a ser WebP animado. O motor exige pelo menos 3s,
 * e figurinha costuma ter 1 a 3s — então a animação é repetida até dar o
 * tempo e, na volta, só a primeira passada é aproveitada.
 */
export const FIGURINHA_ANIMADA_MAX_BYTES = 500 * 1024;
/**
 * Duração mínima do vídeo enviado ao motor (ele exige 3s). Uma folga pequena:
 * a troca é cobrada por segundo cheio, então cada segundo a mais custa.
 */
const MINIMO_DO_MOTOR = 3.1;
const LADO = 512;

export interface FigurinhaAnimada {
  /** Duração de uma passada da animação original, em segundos. */
  segundos: number;
}

/** O arquivo é um WebP/GIF animado? Devolve quantos quadros tem. */
export async function quadrosDaFigurinha(arquivo: Buffer): Promise<number> {
  try {
    return (await sharp(arquivo, { animated: true }).metadata()).pages ?? 1;
  } catch {
    return 1;
  }
}

/**
 * Figurinha animada → MP4 para o motor de troca. Devolve o arquivo (dentro de
 * `dir`) e a duração de uma passada da animação.
 */
export async function figurinhaParaVideo(
  arquivo: Buffer,
  dir: string,
): Promise<{ video: string; segundos: number }> {
  const meta = await sharp(arquivo, { animated: true }).metadata();
  const quadros = meta.pages ?? 1;
  const atrasos = (meta.delay ?? []).filter((d) => d > 0);
  const total =
    atrasos.length === quadros
      ? atrasos.reduce((t, d) => t + d, 0)
      : quadros * (atrasos[0] ?? 80);
  const segundos = Math.max(0.3, total / 1000);
  const fps = Math.min(30, Math.max(6, Math.round(quadros / segundos)));
  // Quadros a gravar: a animação inteira e, se ela for mais curta que o
  // mínimo do motor, o começo dela de novo até dar o tempo (sem voltas a mais).
  const aGravar = Math.max(quadros, Math.ceil(MINIMO_DO_MOTOR * fps));

  // Um PNG por quadro, sobre branco (figurinha recortada tem fundo
  // transparente, e vídeo não tem transparência).
  const pngs: Buffer[] = [];
  for (let i = 0; i < quadros; i++)
    pngs.push(
      await sharp(arquivo, { page: i })
        .flatten({ background: "#ffffff" })
        .resize(LADO, LADO, { fit: "contain", background: "#ffffff" })
        .png()
        .toBuffer(),
    );
  for (let n = 0; n < aGravar; n++)
    await writeFile(
      path.join(dir, `q-${String(n).padStart(5, "0")}.png`),
      pngs[n % quadros],
    );
  const video = path.join(dir, "figurinha.mp4");
  await quadrosParaVideo(path.join(dir, "q-%05d.png"), fps, video);
  return { video, segundos };
}

/**
 * Vídeo com o personagem (resultado da troca) → figurinha animada. Fica com a
 * primeira passada da animação, em 512×512, comprimida até caber em 500 KB.
 */
export async function videoParaFigurinha(o: {
  s3: S3Client;
  userId: string;
  videoKey: string;
  figurinha: FigurinhaAnimada;
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const video = path.join(dir, "troca.mp4");
    await downloadToFile(o.s3, o.videoKey, video);
    const saida = path.join(dir, "figurinha.webp");
    // Do mais bonito para o mais leve, até caber no limite do WhatsApp.
    for (const [fps, qualidade] of [
      [15, 70],
      [12, 60],
      [12, 45],
      [10, 35],
      [8, 28],
      [8, 18],
    ]) {
      await videoParaWebpAnimado(
        video,
        o.figurinha.segundos,
        LADO,
        fps,
        qualidade,
        saida,
      );
      if ((await stat(saida)).size <= FIGURINHA_ANIMADA_MAX_BYTES) break;
    }
    const webp = await readFile(saida);
    const key = newKey(o.userId, "generated", "image/webp");
    await putObject(o.s3, key, webp, "image/webp");
    return { key, size: webp.length };
  });
}
