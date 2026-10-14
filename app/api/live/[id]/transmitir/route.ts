import type { Pool } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { z } from "zod";
import { carregarLive } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";
import {
  destinosValidos,
  estadoDaTransmissao,
  iniciarTransmissao,
  pararTransmissao,
  type Transmissao,
} from "@/lib/live/transmissao";
import { REDES_TRANSMISSAO, type RedeTransmissao } from "@/lib/live/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const salvar = (pool: Pool, id: string, t: Transmissao | null) =>
  pool.query("update lives set transmissao = $2 where id = $1", [
    id,
    t ? JSON.stringify(t) : null,
  ]);

/** GET — como está a transmissão para cada rede. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  if (!live.transmissao) return NextResponse.json({ redes: [] });
  try {
    return NextResponse.json({
      redes: await estadoDaTransmissao(ctx.lk, live.sala, live.transmissao),
    });
  } catch (e) {
    console.warn("[live] estado da transmissão", (e as Error).message);
    return NextResponse.json({ redes: [], erro: "Não consegui conferir a transmissão agora." });
  }
}

const BodySchema = z.object({
  destinos: z
    .array(
      z.object({
        rede: z.enum(Object.keys(REDES_TRANSMISSAO) as [RedeTransmissao, ...RedeTransmissao[]]),
        servidor: z.string().trim().max(300),
        chave: z.string().trim().max(300),
      }),
    )
    .max(4),
});

/**
 * POST — começa a transmitir o avatar para as redes (substitui uma
 * transmissão que já estava rolando). Precisa da live no ar e do avatar na
 * sala. As chaves vão só para o LiveKit; o banco guarda os ids e as redes.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  if (live.status !== "no_ar")
    return NextResponse.json(
      { error: "A live não está no ar.", code: "STATUS" },
      { status: 409 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const { destinos } = parsed.data;
  const invalido = destinosValidos(destinos);
  if (invalido)
    return NextResponse.json({ error: invalido, code: "BAD_INPUT" }, { status: 400 });

  if (live.transmissao) await pararTransmissao(ctx.lk, live.transmissao.envios);
  try {
    const t = await iniciarTransmissao(ctx.lk, live.sala, destinos);
    await salvar(ctx.pool, live.id, t);
    return NextResponse.json({ redes: destinos.map((d) => d.rede) });
  } catch (e) {
    await salvar(ctx.pool, live.id, null);
    console.error("[live] transmitir", e);
    return NextResponse.json(
      {
        error: `Não consegui começar a transmissão: ${(e as Error).message}`,
        code: "PROVIDER_ERROR",
      },
      { status: 502 },
    );
  }
}

/** DELETE — para de transmitir (a live continua no ar). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  if (live.transmissao) await pararTransmissao(ctx.lk, live.transmissao.envios);
  await salvar(ctx.pool, live.id, null);
  return NextResponse.json({ redes: [] });
}
