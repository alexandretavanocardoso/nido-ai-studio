import { NextResponse } from "next/server";
import { z } from "zod";
import { hit, readIp } from "@/lib/ai/rate-limit";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const texto = (max: number) => z.string().trim().max(max);
const opcional = (max: number) =>
  texto(max)
    .optional()
    .transform((v) => v || null);

const BodySchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("whitelist"),
    nome: texto(120).min(1),
    email: z.email().max(200),
    whatsapp: opcional(40),
    perfil: z.enum(["marca", "agencia", "creator"]),
    nicho: opcional(200),
  }),
  z.object({
    tipo: z.literal("agencia"),
    nome: texto(120).min(1),
    email: z.email().max(200),
    whatsapp: opcional(40),
    empresa: texto(160).min(1),
    creators: texto(40),
    objetivo: opcional(2000),
  }),
]);

/**
 * POST — formulários da landing page (sem login): inscrição na whitelist e
 * pedido de proposta do plano Agência. Grava em `leads` (migration 0022).
 * Na whitelist devolve a posição na fila; quem repete o e-mail recebe a mesma.
 */
export async function POST(req: Request) {
  const gate = await hit(`lead:${readIp(req)}`, 5, 600);
  if (!gate.ok)
    return NextResponse.json(
      {
        error: "Muitas tentativas seguidas. Tente de novo em alguns minutos.",
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );

  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      {
        error: "Confira os campos: nome e um e-mail válido são obrigatórios.",
        code: "INVALID_INPUT",
      },
      { status: 400 },
    );

  const pool = getPool();
  if (!pool)
    return NextResponse.json(
      {
        error: "Não foi possível registrar agora. Tente de novo mais tarde.",
        code: "UNAVAILABLE",
      },
      { status: 503 },
    );

  const d = body.data;
  try {
    await pool.query(
      `insert into leads (tipo, nome, email, whatsapp, perfil, nicho, empresa, creators, objetivo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (tipo, lower(email)) do nothing`,
      [
        d.tipo,
        d.nome,
        d.email,
        d.whatsapp,
        d.tipo === "whitelist" ? d.perfil : null,
        d.tipo === "whitelist" ? d.nicho : null,
        d.tipo === "agencia" ? d.empresa : null,
        d.tipo === "agencia" ? d.creators : null,
        d.tipo === "agencia" ? d.objetivo : null,
      ],
    );
    if (d.tipo === "agencia") return NextResponse.json({ ok: true });
    const { rows } = await pool.query<{ posicao: number }>(
      `select count(*)::int as posicao from leads
        where tipo = 'whitelist'
          and id <= (select id from leads where tipo = 'whitelist' and lower(email) = lower($1))`,
      [d.email],
    );
    return NextResponse.json({ ok: true, posicao: rows[0].posicao });
  } catch (e) {
    console.error("[leads] falha ao gravar:", (e as Error).message);
    return NextResponse.json(
      {
        error: "Não foi possível registrar agora. Tente de novo mais tarde.",
        code: "UNAVAILABLE",
      },
      { status: 503 },
    );
  }
}
