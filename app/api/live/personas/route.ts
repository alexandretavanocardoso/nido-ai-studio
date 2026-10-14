import { NextResponse } from "next/server";
import { esconderPersona, personasSalvas } from "@/lib/live/personas";
import { contextoLive } from "@/lib/live/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — personas avulsas salvas (das lives com foto avulsa), mais recentes primeiro. */
export async function GET() {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ personas: await personasSalvas(ctx.pool, ctx.userId) });
}

/** DELETE ?imageKey=&nome= — tira a persona da lista. */
export async function DELETE(req: Request) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const q = new URL(req.url).searchParams;
  const imageKey = q.get("imageKey");
  const nome = q.get("nome");
  if (!imageKey || !nome)
    return NextResponse.json(
      { error: "Persona não encontrada.", code: "BAD_INPUT" },
      { status: 400 },
    );
  await esconderPersona(ctx.pool, ctx.userId, { imageKey, nome });
  return NextResponse.json({ personas: await personasSalvas(ctx.pool, ctx.userId) });
}
