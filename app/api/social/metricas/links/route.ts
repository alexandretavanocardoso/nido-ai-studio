import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { metricasDoLink } from "@/lib/social/link-apify";
import { detectarRedeDoLink, limparLink } from "@/lib/social/link-metricas";
import { DIAS_METRICAS, gravarMetricas } from "@/lib/social/metricas";
import type { Rede } from "@/lib/social/redes";
import { LinkError, tokenApify } from "@/lib/video/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;

/** Máximo de posts por link numa conta. */
const MAX_LINKS = 200;
/** Releituras por chamada (cada uma é uma execução no Apify) e o intervalo mínimo entre elas. */
const RELER_POR_VEZ = 6;
const MINUTOS_ENTRE_LEITURAS = 10;

async function contexto() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const pool = getPool();
  if (!pool || !tokenApify())
    return NextResponse.json(
      {
        error: "Busca por link não configurada (APIFY_TOKEN).",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  return { userId, pool };
}

const NovoSchema = z.object({
  characterId: z.string().min(1).max(64),
  url: z.string().url().max(600),
});

/**
 * POST — cadastra um post publicado por fora (link do post na rede) num
 * personagem e já lê as métricas públicas dele.
 */
export async function POST(req: Request) {
  const ctx = await contexto();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, pool } = ctx;
  const parsed = NovoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !detectarRedeDoLink(parsed.data.url))
    return NextResponse.json(
      {
        error:
          "Link não suportado. Use o link do post no Instagram, TikTok, YouTube, X ou LinkedIn.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  const { characterId } = parsed.data;
  const url = limparLink(parsed.data.url);

  const { rows } = await pool.query<{
    dono: boolean;
    total: number;
    repetido: boolean;
  }>(
    `select exists(select 1 from characters where id = $2 and user_id = $1) as dono,
       (select count(*)::int from posts_agendados where user_id = $1 and manual) as total,
       exists(select 1 from posts_agendados p, jsonb_each_text(p.links) l
              where p.user_id = $1 and p.manual and l.value = $3) as repetido`,
    [userId, characterId, url],
  );
  if (!rows[0].dono)
    return NextResponse.json(
      { error: "Personagem não encontrado." },
      { status: 404 },
    );
  if (rows[0].repetido)
    return NextResponse.json(
      { error: "Esse link já está no Dashboard.", code: "BAD_INPUT" },
      { status: 400 },
    );
  if (rows[0].total >= MAX_LINKS)
    return NextResponse.json(
      {
        error: `Limite de ${MAX_LINKS} posts por link atingido.`,
        code: "BAD_INPUT",
      },
      { status: 400 },
    );

  try {
    const lido = await metricasDoLink(url);
    const id = nanoid(12);
    const quando = lido.quando ?? new Date();
    await pool.query(
      `insert into posts_agendados (id, user_id, character_id, redes, texto, post_date, status, links, manual)
       values ($1, $2, $3, $4, $5, $6, 'POSTED', $7, true)`,
      [
        id,
        userId,
        characterId,
        [lido.rede],
        lido.texto,
        quando,
        JSON.stringify({ [lido.rede]: url }),
      ],
    );
    await gravarMetricas(pool, id, lido.rede, lido.metricas);
    return NextResponse.json({
      id,
      rede: lido.rede,
      metricas: lido.metricas,
      quando: quando.toISOString(),
    });
  } catch (e) {
    if (e instanceof LinkError)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    throw e;
  }
}

/** PATCH — relê as métricas dos posts por link mais antigos (até 6 por chamada). */
export async function PATCH() {
  const ctx = await contexto();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, pool } = ctx;
  const { rows } = await pool.query<{
    id: string;
    rede: Rede;
    url: string | null;
  }>(
    `select p.id, p.redes[1] as rede, p.links ->> p.redes[1] as url
     from posts_agendados p
     left join posts_metricas m on m.post_id = p.id and m.rede = p.redes[1]
     where p.user_id = $1 and p.manual and p.post_date > now() - make_interval(days => $2)
       and (m.atualizado_em is null or m.atualizado_em < now() - make_interval(mins => $3))
     order by m.atualizado_em asc nulls first limit $4`,
    [userId, DIAS_METRICAS, MINUTOS_ENTRE_LEITURAS, RELER_POR_VEZ],
  );
  let erro: string | null = null;
  await Promise.all(
    rows.map(async (p) => {
      try {
        if (!p.url) throw new LinkError("Post sem link.");
        const lido = await metricasDoLink(p.url);
        await gravarMetricas(pool, p.id, p.rede, lido.metricas);
      } catch (e) {
        // Falhou: marca a tentativa e mantém a última leitura.
        await gravarMetricas(pool, p.id, p.rede, null);
        if (!(e instanceof LinkError)) console.error("[metricas/links]", e);
        erro = e instanceof LinkError ? e.message : "Não consegui ler o post.";
      }
    }),
  );
  return NextResponse.json({ lidos: rows.length, erro });
}

const ViewsSchema = z.object({
  id: z.string().min(1).max(64),
  /** null = volta a valer o número lido da rede. */
  views: z.number().int().min(0).max(1e12).nullable(),
});

/**
 * PUT — views digitadas à mão num post por link (ex.: impressões do LinkedIn,
 * que só o autor vê). Vale no lugar do número lido da rede até ser apagado.
 */
export async function PUT(req: Request) {
  const userId = await getUserId();
  const pool = getPool();
  if (!userId || !pool)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const parsed = ViewsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Informe um número de views válido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const { rowCount } = await pool.query(
    `insert into posts_metricas (post_id, rede, views_manual)
     select p.id, p.redes[1], $3 from posts_agendados p
     where p.id = $1 and p.user_id = $2 and p.manual
     on conflict (post_id, rede) do update set views_manual = excluded.views_manual`,
    [parsed.data.id, userId, parsed.data.views],
  );
  if (!rowCount)
    return NextResponse.json(
      { error: "Post não encontrado." },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}
