import { NextResponse } from "next/server";
import { carregarLive } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";
import { mensagemDeErroVoz, trocarVoz } from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Pedaço máximo por chamada: 10 s de PCM 16 kHz mono. */
const MAX_BYTES = 16_000 * 2 * 10;

/**
 * POST — voz trocada da Shadow ao vivo: recebe um pedaço curto da fala de
 * quem está na live (PCM 16 bits, mono, 16 kHz, corpo cru) e devolve a mesma
 * fala na voz escolhida, no mesmo formato. O custo está no preço por minuto.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  if (live.tipo !== "sombra" || live.status !== "no_ar" || !live.voice_id)
    return NextResponse.json(
      { error: "A live não está no ar.", code: "STATUS" },
      { status: 409 },
    );
  const pcm = Buffer.from(await req.arrayBuffer());
  if (!pcm.length || pcm.length > MAX_BYTES || pcm.length % 2)
    return NextResponse.json(
      { error: "Pedaço de áudio inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  try {
    const voz = await trocarVoz(ctx.el, live.voice_id, pcm);
    return new Response(new Uint8Array(voz), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[live] voz trocada", e);
    return NextResponse.json(
      { error: mensagemDeErroVoz(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
