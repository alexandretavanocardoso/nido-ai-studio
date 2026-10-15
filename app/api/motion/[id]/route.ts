import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { getUserId } from "@/lib/auth/server";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import { MusicaSchema } from "@/lib/musica";
import { ownsKey } from "@/lib/storage/s3";
import { getPool } from "@/lib/db";
import { listarMotions } from "@/lib/motion";
import { acertarMotions } from "@/lib/motion-creditos";
import {
  creditosMotion,
  ehModeloMotion,
  estimativaMotion,
  MODELOS_MOTION,
  type EsforcoMotion,
  type ModeloMotion,
} from "@/worker/motion/modelos";
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
  const bloqueio = await liberadoOuResponder("motion");
  if (bloqueio) return bloqueio;
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  const pool = getPool()!;
  await acertarMotions(pool, userId);
  const [motion] = await listarMotions(pool, userId, (await params).id);
  if (!motion) return NextResponse.json({ error: "Motion não encontrado." }, { status: 404 });
  return NextResponse.json({ motion });
}

/**
 * POST — "ajustar": um motion novo a partir deste, com o pedido de mudança
 * (o worker manda o HTML atual ao modelo); reserva a estimativa em créditos,
 * como um motion novo. "exportar": põe a gravação do MP4 na fila do worker
 * (sem custo). "musica": põe, troca ou tira a música do MP4.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bloqueio = await liberadoOuResponder("motion");
  if (bloqueio) return bloqueio;
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  const pool = getPool()!;
  const { id } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message, code: "BAD_INPUT" }, { status: 400 });
  const body = parsed.data;

  if (body.acao === "musica") {
    if (body.musica && !ownsKey(userId, body.musica.key))
      return NextResponse.json({ error: "Áudio não encontrado." }, { status: 404 });
    const musica = body.musica ? { key: body.musica.key, nome: body.musica.nome, origem: body.musica.origem } : null;
    // O MP4 gravado antes deixa de valer (era sem esta música); gravando agora, espera.
    const { rowCount } = await pool.query(
      `update motions set input = case when $3::jsonb is null then input - 'musica' else jsonb_set(input, '{musica}', $3::jsonb) end,
              render = null, video_key = null, render_erro = null, updated_at = now()
        where id = $1 and user_id = $2 and coalesce(render, '') not in ('na_fila', 'renderizando')`,
      [id, userId, musica ? JSON.stringify(musica) : null],
    );
    if (!rowCount)
      return NextResponse.json({ error: "Espere a gravação do MP4 terminar.", code: "BAD_INPUT" }, { status: 409 });
    if (body.musica)
      await pool
        .query(
          "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'uso_musica', $4, $5)",
          [nanoid(14), userId, "motion", `${body.musica.declaracao} [${body.musica.key}]`, readIp(req)],
        )
        .catch((e) => console.warn("[motion] declaração da música:", (e as Error).message));
  } else if (body.acao === "exportar") {
    const { rowCount } = await pool.query(
      `update motions set render = 'na_fila', render_erro = null, progresso = null, updated_at = now()
        where id = $1 and user_id = $2 and status = 'pronto' and coalesce(render, '') not in ('na_fila', 'renderizando')`,
      [id, userId],
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
      userId,
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
    const gate = await allow(`motion:${userId}`, 6);
    if (!gate.ok)
      return NextResponse.json(
        { error: `Muitos pedidos seguidos. Tente em ${gate.retryAfter}s.` },
        { status: 429 },
      );
    // Reserva a estimativa (as imagens do pedido original); o custo real é acertado quando ficar pronto.
    const reserva = creditosMotion(
      estimativaMotion(modelo, esforco as EsforcoMotion, input.assets.length),
    );
    const cobrado = await cobrarOuResponder(userId, reserva, "motion");
    if (cobrado instanceof NextResponse) return cobrado;
    const novo = nanoid(12);
    try {
      await pool.query(
        "insert into motions (id, user_id, tipo, modelo, esforco, input, cobranca) values ($1, $2, $3, $4, $5, $6, $7)",
        [
          novo,
          userId,
          base.tipo,
          modelo,
          esforco,
          JSON.stringify(input),
          cobrado.cobranca ? JSON.stringify(cobrado.cobranca) : null,
        ],
      );
    } catch (e) {
      await estornarSeHouver(cobrado.cobranca);
      console.error("[motion] ajustar", e);
      return NextResponse.json(
        { error: "Não consegui criar o motion. Os créditos foram devolvidos." },
        { status: 500 },
      );
    }
    const [motion] = await listarMotions(pool, userId, novo);
    return NextResponse.json({ motion });
  }
  const [motion] = await listarMotions(pool, userId, id);
  return NextResponse.json({ motion });
}
