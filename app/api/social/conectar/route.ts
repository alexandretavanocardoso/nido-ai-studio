import { NextResponse } from "next/server";
import { z } from "zod";
import { planoAtual } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { bloqueioPublicar } from "@/lib/planos";
import {
  garantirTime,
  getBundle,
  linkDeConexao,
  mensagemBundle,
} from "@/lib/social/bundle";
import { REDES } from "@/lib/social/redes";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  characterId: z.string().min(1),
  nome: z.string().max(80).default(""),
  redes: z.array(z.enum(REDES)).optional(),
});

/** POST — link do portal do bundle.social para conectar as redes deste influencer. */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId } = ctx;
  const bundle = getBundle();
  if (!bundle || !getPool())
    return NextResponse.json(
      {
        error: "Publicação não configurada (BUNDLE_SOCIAL).",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;

  const bloqueio = bloqueioPublicar(await planoAtual(userId));
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );

  try {
    const teamId = await garantirTime(
      bundle,
      userId,
      body.characterId,
      body.nome,
    );
    const origem =
      process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ||
      new URL(req.url).origin;
    const url = await linkDeConexao(bundle, {
      teamId,
      voltarPara: `${origem}/app/personagem/${encodeURIComponent(body.characterId)}?aba=estudio&secao=publicar`,
      nome: body.nome,
      redes: body.redes,
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[social/conectar]", e);
    return NextResponse.json(
      { error: mensagemBundle(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
