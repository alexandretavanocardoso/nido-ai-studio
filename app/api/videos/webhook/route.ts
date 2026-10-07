import { NextResponse } from "next/server";
import { finalizarJob } from "@/lib/video/finalizar";
import { tokenValido } from "@/lib/video/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST — webhook do fal.ai quando um job (ou trecho) termina. A URL é assinada
 * (job + token HMAC). O corpo é ignorado de propósito: a finalização confere o
 * estado direto na API do fal, então um aviso forjado não tem efeito.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const job = url.searchParams.get("job");
  if (!job || !tokenValido(job, url.searchParams.get("t"))) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const estado = await finalizarJob(job);
    return NextResponse.json({
      ok: true,
      status: estado?.status ?? "desconhecido",
    });
  } catch (e) {
    // 500 faz o fal tentar de novo; a finalização é idempotente.
    console.error("[videos/webhook]", job, e);
    return NextResponse.json({ error: "Erro ao finalizar." }, { status: 500 });
  }
}
