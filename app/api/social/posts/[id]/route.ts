import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { estornarSeHouver, type Cobranca } from "@/lib/creditos";
import { getBundle, mensagemBundle } from "@/lib/social/bundle";
import { enviarParaRedes } from "@/lib/social/enviar";
import {
  problemasDoPost,
  REDES,
  type Rede,
  type TipoMidia,
} from "@/lib/social/redes";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_DIAS = 180;

interface Linha {
  cobranca: Cobranca | null;
  character_id: string;
  bundle_post_id: string | null;
  status: string;
  redes: Rede[];
  texto: string;
  titulo: string | null;
  midia_key: string | null;
  midia_tipo: TipoMidia | null;
}

async function carregar(id: string, userId: string): Promise<Linha | null> {
  const { rows } = await getPool()!.query<Linha>(
    `select character_id, bundle_post_id, status, redes, texto, titulo, midia_key, midia_tipo, cobranca
     from posts_agendados where id = $1 and user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

const AgendarSchema = z.object({
  /** ISO em UTC. Ausente (ou já passou) = publicar agora. */
  quando: z.string().datetime().optional(),
});

/** PATCH — agenda (ou publica agora) um post do backlog. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  if (!getBundle() || !getPool())
    return NextResponse.json(
      { error: "Publicação não configurada." },
      { status: 500 },
    );
  const { id } = await params;
  const parsed = AgendarSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );

  const post = await carregar(id, userId);
  if (!post)
    return NextResponse.json(
      { error: "Post não encontrado." },
      { status: 404 },
    );
  if (post.status !== "BACKLOG")
    return NextResponse.json(
      {
        error: "Só posts do backlog podem ser agendados aqui.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  const problemas = problemasDoPost({
    redes: post.redes,
    texto: post.texto,
    titulo: post.titulo ?? undefined,
    midiaTipo: post.midia_tipo,
  });
  if (problemas.length)
    return NextResponse.json(
      { error: problemas.join(" "), code: "BAD_INPUT" },
      { status: 400 },
    );

  const agora = Date.now();
  const quando = parsed.data.quando
    ? new Date(parsed.data.quando)
    : new Date(agora);
  if (quando.getTime() > agora + MAX_DIAS * 86_400_000)
    return NextResponse.json(
      { error: `Agende para no máximo ${MAX_DIAS} dias.`, code: "BAD_INPUT" },
      { status: 400 },
    );
  const dataPost = quando.getTime() < agora + 30_000 ? new Date(agora) : quando;

  return enviarParaRedes({
    userId,
    s3,
    body: {
      characterId: post.character_id,
      redes: post.redes,
      texto: post.texto,
      titulo: post.titulo ?? undefined,
      midiaKey: post.midia_key ?? undefined,
    },
    midiaTipo: post.midia_tipo,
    dataPost,
    agora,
    idExistente: id,
  });
}

/**
 * DELETE — post agendado: cancela no bundle.social e volta para o backlog
 * (créditos devolvidos). Post do backlog: apaga de vez.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId } = ctx;
  const { id } = await params;
  const bundle = getBundle();
  const pool = getPool();
  if (!bundle || !pool)
    return NextResponse.json(
      { error: "Publicação não configurada." },
      { status: 500 },
    );

  const post = await carregar(id, userId);
  if (!post)
    return NextResponse.json(
      { error: "Post não encontrado." },
      { status: 404 },
    );
  if (post.status === "BACKLOG") {
    await pool.query("delete from posts_agendados where id = $1", [id]);
    return NextResponse.json({ ok: true });
  }
  if (post.status !== "SCHEDULED" && post.status !== "DRAFT")
    return NextResponse.json(
      {
        error: "Só dá pra cancelar posts que ainda não foram publicados.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  try {
    if (post.bundle_post_id)
      await bundle.post.postDelete({ id: post.bundle_post_id });
    // Volta para o backlog (dá pra editar e agendar de novo) e devolve os créditos.
    await pool.query(
      `update posts_agendados set status = 'BACKLOG', bundle_post_id = null, cobranca = null, erros = null,
         links = null, post_date = now(), updated_at = now() where id = $1`,
      [id],
    );
    await estornarSeHouver(post.cobranca, "estorno_post");
    return NextResponse.json({ ok: true, backlog: true });
  } catch (e) {
    return NextResponse.json(
      { error: mensagemBundle(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}

const EditarSchema = z.object({
  redes: z.array(z.enum(REDES)).min(1, "Escolha pelo menos uma rede."),
  texto: z.string().max(5000).default(""),
  titulo: z.string().max(100).optional(),
});

/** PUT — edita um post do backlog (legenda, título e redes). A mídia continua a mesma. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId } = ctx;
  if (!getPool())
    return NextResponse.json(
      { error: "Publicação não configurada." },
      { status: 500 },
    );
  const { id } = await params;
  const parsed = EditarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const post = await carregar(id, userId);
  if (!post)
    return NextResponse.json(
      { error: "Post não encontrado." },
      { status: 404 },
    );
  if (post.status !== "BACKLOG")
    return NextResponse.json(
      { error: "Só posts do backlog podem ser editados.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const redes = [...new Set(parsed.data.redes)];
  const problemas = problemasDoPost({
    redes,
    texto: parsed.data.texto,
    titulo: parsed.data.titulo,
    midiaTipo: post.midia_tipo,
  });
  if (problemas.length)
    return NextResponse.json(
      { error: problemas.join(" "), code: "BAD_INPUT" },
      { status: 400 },
    );
  await getPool()!.query(
    "update posts_agendados set redes = $2, texto = $3, titulo = $4, updated_at = now() where id = $1",
    [id, redes, parsed.data.texto.trim(), parsed.data.titulo?.trim() || null],
  );
  return NextResponse.json({ ok: true });
}
