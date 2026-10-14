import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { carregarLive, tokenDoPalco } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — acesso do palco: a página /live/palco, aberta como fonte de navegador
 * no OBS (ou numa janela para capturar), mostra só o avatar em tela cheia.
 * O token só assiste e vale até o fim da live (mais uma hora de folga).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  if (live.status === "encerrada" || live.status === "erro")
    return NextResponse.json(
      { error: "Esta live já terminou.", code: "STATUS" },
      { status: 409 },
    );
  return NextResponse.json({
    url: ctx.lk.url,
    token: tokenDoPalco(ctx.lk, live, live.duracao_min * 60, nanoid(6)),
  });
}
