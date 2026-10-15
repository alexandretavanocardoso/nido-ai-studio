import { NextResponse } from "next/server";
import { z } from "zod";
import { contextoLive } from "@/lib/live/rota";
import { ErroVod, infoDoVod } from "@/worker/sombra/vod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ url: z.string().trim().url("Cole um link válido.").max(2000) });

/**
 * POST — confere um link de live gravada da Twitch ou do Kick (VOD ou clipe) e
 * devolve título, canal, miniatura e duração, para a pessoa escolher o trecho
 * e ver o preço. Não baixa nada nem cobra.
 */
export async function POST(req: Request) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message, code: "BAD_INPUT" }, { status: 400 });
  try {
    return NextResponse.json(await infoDoVod(parsed.data.url));
  } catch (e) {
    if (e instanceof ErroVod) return NextResponse.json({ error: e.message, code: "BAD_INPUT" }, { status: 400 });
    console.error("[sombra-video/link]", e);
    return NextResponse.json({ error: "Não consegui abrir esse link agora. Tente de novo." }, { status: 502 });
  }
}
