import { NextResponse } from "next/server";
import { carregarLive, encerrarLive, resumoDaLive } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST — encerra a live: tira o avatar da sala e devolve os créditos dos
 * minutos não usados. A página também chama ao fechar (sendBeacon). Repetir
 * não faz mal.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  const encerrada = await encerrarLive(ctx.pool, ctx.rw, live);
  return NextResponse.json({ live: resumoDaLive(encerrada) });
}
