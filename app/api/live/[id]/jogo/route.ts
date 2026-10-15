import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { readIp } from "@/lib/ai/rate-limit";
import { DECLARACAO_VIDEO_LIVE } from "@/lib/declaracoes";
import { carregarLive } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  /** Texto exato que a pessoa marcou (precisa ser o atual). */
  declaracao: z.literal(DECLARACAO_VIDEO_LIVE, {
    error: "Marque a declaração para usar um vídeo gravado.",
  }),
});

/**
 * POST — registra a declaração de quem vai usar um vídeo gravado como jogo na
 * live (o vídeo em si não sobe: toca no navegador e vai direto para a sala).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  await ctx.pool.query(
    "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'video_gravado_live', $4, $5)",
    [nanoid(14), ctx.userId, live.character_id ?? live.id, DECLARACAO_VIDEO_LIVE, readIp(req)],
  );
  return NextResponse.json({ ok: true });
}
