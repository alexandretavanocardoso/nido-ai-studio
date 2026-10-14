import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { acertarLivesAbertas } from "@/lib/live/server";
import { finalizarJob, jobsPendentes } from "@/lib/video/finalizar";
import { getRunway } from "@/lib/video/runway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron — verifica os jobs de vídeo pendentes e finaliza os que o serviço já
 * terminou. Cobre o Runway (sem webhook) e webhooks do fal que se perderam.
 * Jobs pendentes há mais de 48h viram erro e os créditos voltam. De quebra,
 * acerta as lives que ficaram no ar sem ninguém encerrar (lib/live).
 * A Vercel manda `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const ids = await jobsPendentes();
  const resultado: Record<string, number> = {};
  for (const id of ids) {
    try {
      const e = await finalizarJob(id);
      const s = e?.status ?? "sumiu";
      resultado[s] = (resultado[s] ?? 0) + 1;
    } catch (e) {
      console.error("[cron/video-jobs]", id, e);
      resultado.falha = (resultado.falha ?? 0) + 1;
    }
  }
  const pool = getPool();
  const rw = getRunway();
  const lives =
    pool && rw
      ? await acertarLivesAbertas(pool, rw).catch((e) => {
          console.error("[cron/video-jobs] lives", e);
          return 0;
        })
      : 0;
  console.log("[cron] video-jobs", { verificados: ids.length, resultado, lives });
  return NextResponse.json({ ok: true, verificados: ids.length, resultado, lives });
}
