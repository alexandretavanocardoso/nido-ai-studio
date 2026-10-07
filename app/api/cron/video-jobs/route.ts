import { NextResponse } from "next/server";
import { finalizarJob, jobsPendentes } from "@/lib/video/finalizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron — verifica os jobs de vídeo pendentes e finaliza os que o serviço já
 * terminou. Cobre o Runway (sem webhook) e webhooks do fal que se perderam.
 * Jobs pendentes há mais de 48h viram erro e os créditos voltam.
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
  console.log("[cron] video-jobs", { verificados: ids.length, resultado });
  return NextResponse.json({ ok: true, verificados: ids.length, resultado });
}
