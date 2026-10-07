import { NextResponse } from "next/server";
import { finalizarJob } from "@/lib/video/finalizar";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET — estado de um job de vídeo da conta. Se o serviço já terminou e ninguém
 * finalizou ainda (webhook/cron), finaliza aqui mesmo (ver lib/video/finalizar.ts).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const estado = await finalizarJob((await params).id, ctx.userId);
  if (!estado)
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  return NextResponse.json(estado);
}
