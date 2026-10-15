import { NextResponse } from "next/server";
import { cenaParaLucy } from "@/lib/live/cena";
import { getDecart, pedidoDaSombra, tokenTempoReal } from "@/lib/live/decart";
import { carregarLive } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";
import { segundosNoAr } from "@/lib/live/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — token curto da Decart para a Shadow ao vivo: o navegador liga a
 * webcam direto no Lucy 2.5 com ele (a chave da Decart fica no servidor).
 * Só para a live de sombra no ar, só do endereço do app, e no máximo o tempo
 * que resta na live. Vai junto o pedido do Lucy (com o cenário, se houver).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  if (!getDecart())
    return NextResponse.json(
      { error: "Sombra não configurada no servidor (DECART_API_KEY).", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  if (live.tipo !== "sombra" || live.status !== "no_ar")
    return NextResponse.json(
      { error: "A live não está no ar.", code: "STATUS" },
      { status: 409 },
    );
  const teto = live.duracao_min * 60;
  const restante = teto - segundosNoAr(live.sessoes, Date.now(), teto);
  try {
    const cena = live.cena && "prompt" in live.cena ? await cenaParaLucy(live.cena.prompt) : null;
    const token = await tokenTempoReal({ segundos: restante, origem: req.headers.get("origin") });
    return NextResponse.json({ ...token, pedido: pedidoDaSombra(cena) });
  } catch (e) {
    console.error("[live] token decart", e);
    return NextResponse.json(
      { error: "A Decart recusou a chave. Confira DECART_API_KEY.", code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
