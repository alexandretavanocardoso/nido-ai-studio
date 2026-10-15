import { stat } from "node:fs/promises";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import type { MusicaDeFundo } from "@/lib/musica";
import { downloadToFile, newKey, uploadFromFile } from "@/lib/storage/s3";
import { misturarMusica } from "./ffmpeg";
import { comPastaTemporaria } from "./server";

/**
 * Põe a música de fundo num vídeo pronto do S3 e sobe o resultado (key nova).
 * Usado na finalização do vídeo de produto, depois que as cenas são unidas.
 */
export async function comMusica(o: {
  s3: S3Client;
  userId: string;
  videoKey: string;
  musica: MusicaDeFundo;
}): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const video = path.join(dir, "video.mp4");
    const musica = path.join(dir, `musica${path.extname(o.musica.key) || ".mp3"}`);
    const saida = path.join(dir, "com-musica.mp4");
    await downloadToFile(o.s3, o.videoKey, video);
    await downloadToFile(o.s3, o.musica.key, musica);
    await misturarMusica({ video, musica, saida });
    const key = newKey(o.userId, "videos", "video/mp4");
    await uploadFromFile(o.s3, key, saida, "video/mp4");
    return { key, size: (await stat(saida)).size };
  });
}
