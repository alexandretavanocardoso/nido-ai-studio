import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getBundle } from "@/lib/social/bundle";
import { enviarParaRedes } from "@/lib/social/enviar";
import { problemasDoPost, REDES } from "@/lib/social/redes";
import { ownsKey } from "@/lib/storage/s3";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Até quantos dias no futuro dá pra agendar. */
const MAX_DIAS = 180;

const BodySchema = z.object({
  characterId: z.string().min(1),
  redes: z.array(z.enum(REDES)).min(1, "Escolha pelo menos uma rede."),
  texto: z.string().max(5000).default(""),
  titulo: z.string().max(100).optional(),
  midiaKey: z.string().min(1).optional(),
  midiaTipo: z.enum(["video", "imagem"]).optional(),
  /** ISO em UTC. Ausente (ou já passou) = publicar agora. */
  quando: z.string().datetime().optional(),
  /** Guardar no backlog (sem data, sem enviar). */
  backlog: z.boolean().optional(),
});

/** POST — publica agora, agenda, ou guarda no backlog um post do influencer. */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const bundle = getBundle();
  const pool = getPool();
  if (!bundle || !pool)
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
  const body = { ...parsed.data, redes: [...new Set(parsed.data.redes)] };
  const midiaTipo = body.midiaKey ? (body.midiaTipo ?? "video") : null;

  const problemas = problemasDoPost({
    redes: body.redes,
    texto: body.texto,
    titulo: body.titulo,
    midiaTipo,
  });
  if (problemas.length)
    return NextResponse.json(
      { error: problemas.join(" "), code: "BAD_INPUT" },
      { status: 400 },
    );
  if (body.midiaKey && !ownsKey(userId, body.midiaKey))
    return NextResponse.json(
      { error: "Mídia não encontrada." },
      { status: 404 },
    );

  const agora = Date.now();
  const quando = body.quando ? new Date(body.quando) : new Date(agora);
  if (quando.getTime() > agora + MAX_DIAS * 86_400_000)
    return NextResponse.json(
      { error: `Agende para no máximo ${MAX_DIAS} dias.`, code: "BAD_INPUT" },
      { status: 400 },
    );
  const dataPost = quando.getTime() < agora + 30_000 ? new Date(agora) : quando;

  // Backlog: guarda o post pronto, sem data e sem enviar (nem cobrar). Agenda depois.
  if (parsed.data.backlog) {
    const id = nanoid(12);
    await pool.query(
      `insert into posts_agendados (id, user_id, character_id, redes, texto, titulo, midia_key, midia_tipo, post_date, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now(), 'BACKLOG')`,
      [
        id,
        userId,
        body.characterId,
        body.redes,
        body.texto.trim(),
        body.titulo?.trim() || null,
        body.midiaKey ?? null,
        midiaTipo,
      ],
    );
    return NextResponse.json({ id, backlog: true });
  }

  return enviarParaRedes({ userId, s3, body, midiaTipo, dataPost, agora });
}
