import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { getPool } from "@/lib/db";
import { ownsKey, presignGet } from "@/lib/storage/s3";
import { cortesDeCamera, detectarViradas } from "@/lib/video/ffmpeg";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** O ffmpeg lê o vídeo inteiro direto da URL (alguns segundos para até 60s de vídeo). */
export const maxDuration = 90;

const PER_MINUTE = Number(process.env.CORTES_RATE_LIMIT_PER_MINUTE ?? 12);

const BodySchema = z
  .object({
    /** Origem: vídeo no S3 ou vídeo buscado por link. */
    videoKey: z.string().min(1).optional(),
    linkId: z.string().min(1).optional(),
  })
  .refine((b) => !!b.videoKey !== !!b.linkId, {
    message: "Informe o vídeo (arquivo ou link).",
  });

/**
 * POST — instantes dos cortes de câmera do vídeo. A tela usa para mostrar, antes
 * de gerar, quanto custa a troca num vídeo de cortes rápidos (cada tomada vai
 * sozinha ao motor, ver lib/video/precos.ts). É só estimativa: quem cobra é a
 * rota da troca, que mede de novo. Se a leitura falhar, devolve sem cortes.
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;
  if (body.videoKey && !ownsKey(userId, body.videoKey))
    return NextResponse.json(
      { error: "Arquivo não encontrado." },
      { status: 404 },
    );
  const gate = await allow(`cortes:${userId}`, PER_MINUTE);
  if (!gate.ok) return NextResponse.json({ cortes: [] });

  try {
    let url: string;
    if (body.linkId) {
      const { rows } = await getPool()!.query<{ fal_url: string }>(
        `select fal_url from links_video
         where id = $1 and user_id = $2 and created_at > now() - interval '24 hours'`,
        [body.linkId, userId],
      );
      if (!rows[0]) return NextResponse.json({ cortes: [] });
      url = rows[0].fal_url;
    } else {
      url = await presignGet(s3, body.videoKey!, 300);
    }
    return NextResponse.json({
      cortes: cortesDeCamera(await detectarViradas(url)),
    });
  } catch (e) {
    console.warn("[videos/cortes] leitura falhou:", (e as Error).message);
    return NextResponse.json({ cortes: [] });
  }
}
