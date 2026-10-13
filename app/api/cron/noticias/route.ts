import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { agentesPendentes, pesquisarNoticias } from "@/lib/noticias/server";
import { recursosDisponiveis } from "@/lib/recursos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron diário (vercel.json): os agentes de notícias do admin — concorrentes e
 * IAs que o NIDO usa — leem o X e a web.
 * A Vercel manda `Authorization: Bearer $CRON_SECRET`.
 * Só roda o agente que ainda não rodou hoje: chamar de novo não paga duas vezes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!getPool() || !recursosDisponiveis().ia)
    return NextResponse.json({
      ok: true,
      novos: 0,
      motivo: "sem banco ou sem IA de texto",
    });

  const pendentes = await agentesPendentes();
  const resumo = await pesquisarNoticias(pendentes);
  console.log("[cron] noticias", { pendentes, ...resumo });
  return NextResponse.json({ ok: true, pendentes, ...resumo });
}
