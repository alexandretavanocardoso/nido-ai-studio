import path from "node:path";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { somarArmazenamento } from "@/lib/limites";
import { newKey, uploadFromFile } from "@/lib/storage/s3";
import { cortarInicio, probe } from "@/lib/video/ffmpeg";
import { baixarVideo } from "@/lib/video/link";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST — vídeo original de uma troca, para o "antes e depois".
 * As trocas novas já guardam o original (input.antesKey). As antigas feitas
 * por link não guardavam: aqui ele é recuperado da cópia temporária do vídeo
 * buscado (links_video), cortado no mesmo trecho que foi trocado e guardado
 * na conta. Se a cópia já expirou, não há mais como comparar.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const pool = getPool();
  if (!pool)
    return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });

  const { rows } = await pool.query<{
    input: {
      antesKey?: string | null;
      videoKey?: string;
      link?: { url?: string };
    };
    duracao: number | null;
    created_at: string;
  }>(
    "select input, duracao, created_at from video_jobs where id = $1 and user_id = $2 and tipo = 'substituir'",
    [(await params).id, userId],
  );
  const job = rows[0];
  if (!job)
    return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  if (job.input.antesKey)
    return NextResponse.json({ antesKey: job.input.antesKey });
  // Troca de um vídeo da conta, inteiro: o original é o próprio arquivo.
  if (job.input.videoKey)
    return NextResponse.json({ antesKey: job.input.videoKey });

  const indisponivel = () =>
    NextResponse.json(
      {
        error: "O vídeo original desta troca não está mais disponível para comparar.",
        code: "NOT_FOUND",
      },
      { status: 404 },
    );
  const url = job.input.link?.url;
  if (!url) return indisponivel();
  // A cópia buscada para esta troca: a mais recente do mesmo link, até a hora do job.
  const { rows: links } = await pool.query<{ fal_url: string }>(
    `select fal_url from links_video
     where user_id = $1 and url = $2 and created_at <= $3
     order by created_at desc limit 1`,
    [userId, url, job.created_at],
  );
  if (!links[0]) return indisponivel();

  try {
    const antesKey = await comPastaTemporaria(async (dir) => {
      let arquivo = path.join(dir, "original.mp4");
      await baixarVideo(links[0].fal_url, arquivo);
      // O mesmo trecho que foi trocado (os primeiros N segundos).
      const { duracao } = await probe(arquivo);
      if (job.duracao && duracao > job.duracao + 0.3) {
        const trecho = path.join(dir, "trecho.mp4");
        await cortarInicio(arquivo, job.duracao, trecho);
        arquivo = trecho;
      }
      const key = newKey(userId, "videos", "video/mp4");
      await somarArmazenamento(
        userId,
        await uploadFromFile(s3, key, arquivo, "video/mp4"),
      );
      return key;
    });
    await pool.query(
      "update video_jobs set input = jsonb_set(input, '{antesKey}', to_jsonb($2::text)) where id = $1",
      [(await params).id, antesKey],
    );
    return NextResponse.json({ antesKey });
  } catch (e) {
    console.warn("[videos/antes] original não recuperado:", (e as Error).message);
    return indisponivel();
  }
}
