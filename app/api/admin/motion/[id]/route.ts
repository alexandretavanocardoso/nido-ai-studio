import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import { readIp } from "@/lib/ai/rate-limit";
import { MusicaSchema } from "@/lib/musica";
import { ownsKey } from "@/lib/storage/s3";
import { getPool } from "@/lib/db";
import { listarMotions } from "@/lib/motion";
import { ehModeloMotion, MODELOS_MOTION, type ModeloMotion } from "@/worker/motion/modelos";
import type { InputMotion, TipoMotion } from "@/worker/motion/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("ajustar"),
    pedido: z.string().trim().min(3, "Diga o que mudar.").max(2000),
    modelo: z.string().refine(ehModeloMotion, "Modelo inválido.").optional(),
    esforco: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  }),
  z.object({ acao: z.literal("exportar") }),
  // Música de fundo do MP4 (null tira). Muda o que o próximo "Exportar MP4" grava.
  z.object({ acao: z.literal("musica"), musica: MusicaSchema.nullable() }),
]);

/** GET — um motion (a tela acompanha o andamento). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const [motion] = await listarMotions(getPool()!, admin.userId, (await params).id);
  if (!motion) return NextResponse.json({ error: "Motion não encontrado." }, { status: 404 });
  return NextResponse.json({ motion });
}

/**
 * POST — "ajustar": um motion novo a partir deste, com o pedido de mudança
 * (o worker manda o HTML atual ao modelo). "exportar": põe a gravação do MP4
 * na fila do worker.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pool = getPool()!;
  const { id } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message, code: "BAD_INPUT" }, { status: 400 });
  const body = parsed.data;

  if (body.acao === "musica") {
    if (body.musica && !ownsKey(admin.userId, body.musica.key))
      return NextResponse.json({ error: "Áudio não encontrado." }, { status: 404 });
    const musica = body.musica ? { key: body.musica.key, nome: body.musica.nome, origem: body.musica.origem } : null;
    // O MP4 gravado antes deixa de valer (era sem esta música); gravando agora, espera.
    const { rowCount } = await pool.query(
      `update motions set input = case when $3::jsonb is null then input - 'musica' else jsonb_set(input, '{musica}', $3::jsonb) end,
              render = null, video_key = null, render_erro = null, updated_at = now()
        where id = $1 and user_id = $2 and coalesce(render, '') not in ('na_fila', 'renderizando')`,
      [id, admin.userId, musica ? JSON.stringify(musica) : null],
    );
    if (!rowCount)
      return NextResponse.json({ error: "Espere a gravação do MP4 terminar.", code: "BAD_INPUT" }, { status: 409 });
    if (body.musica)
      await pool
        .query(
          "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'uso_musica', $4, $5)",
          [nanoid(14), admin.userId, "motion", `${body.musica.declaracao} [${body.musica.key}]`, readIp(req)],
        )
        .catch((e) => console.warn("[admin/motion] declaração da música:", (e as Error).message));
  } else if (body.acao === "exportar") {
    const { rowCount } = await pool.query(
      `update motions set render = 'na_fila', render_erro = null, progresso = null, updated_at = now()
        where id = $1 and user_id = $2 and status = 'pronto' and coalesce(render, '') not in ('na_fila', 'renderizando')`,
      [id, admin.userId],
    );
    if (!rowCount)
      return NextResponse.json({ error: "Este motion não está pronto para gravar.", code: "BAD_INPUT" }, { status: 409 });
  } else {
    const { rows } = await pool.query<{
      tipo: TipoMotion;
      modelo: string;
      esforco: string | null;
      input: InputMotion;
      html_key: string | null;
    }>("select tipo, modelo, esforco, input, html_key from motions where id = $1 and user_id = $2 and status = 'pronto'", [
      id,
      admin.userId,
    ]);
    const base = rows[0];
    if (!base?.html_key)
      return NextResponse.json({ error: "Só dá para ajustar um motion pronto.", code: "BAD_INPUT" }, { status: 409 });
    const modelo = (body.modelo ?? base.modelo) as ModeloMotion;
    const esforcos: readonly string[] = ehModeloMotion(modelo) ? MODELOS_MOTION[modelo].esforcos : [];
    const esforco = body.esforco ?? base.esforco ?? "high";
    if (!esforcos.includes(esforco))
      return NextResponse.json({ error: "Este modelo não aceita esse esforço.", code: "BAD_INPUT" }, { status: 400 });
    const input: InputMotion = {
      ...base.input,
      ajuste: { pedido: body.pedido, baseId: id, baseHtmlKey: base.html_key },
    };
    const novo = nanoid(12);
    await pool.query(
      "insert into motions (id, user_id, tipo, modelo, esforco, input) values ($1, $2, $3, $4, $5, $6)",
      [novo, admin.userId, base.tipo, modelo, esforco, JSON.stringify(input)],
    );
    const [motion] = await listarMotions(pool, admin.userId, novo);
    return NextResponse.json({ motion });
  }
  const [motion] = await listarMotions(pool, admin.userId, id);
  return NextResponse.json({ motion });
}
