import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  HISTORICO_SOMBRA,
  pastaSombra,
  SOMBRA_SEM_PERSONAGEM,
  SUFIXO_ANTES,
} from "@/lib/sombra";
import { getBucket } from "@/lib/storage/s3";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Foto gerada e a original dela (ausente em trocas feitas antes do "antes e depois"). */
export interface FotoDaSombra {
  key: string;
  antesKey: string | null;
}

export interface VideoDaSombra {
  jobId: string;
  status: string;
  key: string | null;
  /** O trecho original, para comparar. */
  antesKey: string | null;
  erro: string | null;
  duracao: number | null;
  criadoEm: string;
  /** Link do post de onde veio o vídeo (vídeo enviado por link), como no Estúdio. */
  fonte: string | null;
}

/**
 * GET — o histórico da Sombra sem personagem (/app/sombra): as fotos geradas
 * (pasta da Sombra no armazenamento) e os vídeos (jobs sem personagem), dos
 * mais novos para os mais antigos. Vídeo ainda em andamento: a tela acompanha
 * em /api/videos/jobs/[id].
 */
export async function GET() {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;

  const [objetos, jobs] = await Promise.all([
    s3.send(
      new ListObjectsV2Command({
        Bucket: getBucket()!,
        Prefix: pastaSombra(userId),
      }),
    ),
    getPool()!.query<{
      id: string;
      status: string;
      result_key: string | null;
      antes_key: string | null;
      error: string | null;
      duracao: string | null;
      created_at: Date;
      fonte: string | null;
    }>(
      `select id, status, result_key, input->>'antesKey' as antes_key, error, duracao, created_at,
              input->'link'->>'url' as fonte
       from video_jobs
       where user_id = $1 and character_id = $2 and tipo = 'substituir'
       order by created_at desc limit $3`,
      [userId, SOMBRA_SEM_PERSONAGEM, HISTORICO_SOMBRA],
    ),
  ]);

  // As originais ("-antes") não entram na lista: vão junto do resultado.
  const keys = new Set(
    (objetos.Contents ?? []).map((o) => o.Key!).filter(Boolean),
  );
  const fotos: FotoDaSombra[] = (objetos.Contents ?? [])
    .filter((o) => o.Key && !o.Key.endsWith(SUFIXO_ANTES))
    .sort(
      (a, b) =>
        (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0),
    )
    .slice(0, HISTORICO_SOMBRA)
    .map((o) => {
      const antesKey = o.Key!.replace(/\.jpg$/, SUFIXO_ANTES);
      return { key: o.Key!, antesKey: keys.has(antesKey) ? antesKey : null };
    });

  const videos: VideoDaSombra[] = jobs.rows.map((j) => ({
    jobId: j.id,
    status: j.status,
    key: j.result_key,
    antesKey: j.antes_key,
    erro: j.error,
    duracao: j.duracao == null ? null : Number(j.duracao),
    criadoEm: j.created_at.toISOString(),
    // Só link de página (vai num <a href>).
    fonte: j.fonte && /^https?:\/\//i.test(j.fonte) ? j.fonte : null,
  }));

  return NextResponse.json({ fotos, videos });
}
