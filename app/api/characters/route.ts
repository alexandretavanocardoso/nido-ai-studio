import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getUserId } from "@/lib/auth/server";
import { creditosAtivos, planoAtual } from "@/lib/creditos";
import { PLANOS } from "@/lib/planos";

export const dynamic = "force-dynamic";

/**
 * Personagens da conta logada. Sem RLS no Neon, o isolamento entre contas
 * é feito aqui: toda query filtra por user_id da sessão.
 */

async function context() {
  const pool = getPool();
  const userId = pool ? await getUserId() : null;
  if (!pool || !userId) return null;
  return { pool, userId };
}

const unauthorized = () =>
  NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

export async function GET() {
  const ctx = await context();
  if (!ctx) return unauthorized();
  const { rows } = await ctx.pool.query<{ data: unknown }>(
    "select data from characters where user_id = $1 order by updated_at desc",
    [ctx.userId],
  );
  return NextResponse.json({ characters: rows.map((r) => r.data) });
}

const UpsertBody = z.object({
  characters: z
    .array(
      z.looseObject({ id: z.string().min(1).max(100), updatedAt: z.number() }),
    )
    .max(500),
});

export async function PUT(req: Request) {
  const ctx = await context();
  if (!ctx) return unauthorized();
  const parsed = UpsertBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  // Limite de personagens do plano: atualizar os existentes é sempre livre;
  // personagens novos além do limite ficam de fora (e voltam em `recusados`).
  let lista = parsed.data.characters;
  const recusados: string[] = [];
  if (creditosAtivos()) {
    const limite = PLANOS[await planoAtual(ctx.userId)].personagens;
    const { rows } = await ctx.pool.query<{ id: string }>(
      "select id from characters where user_id = $1",
      [ctx.userId],
    );
    const existentes = new Set(rows.map((r) => r.id));
    let total = existentes.size;
    lista = lista.filter((c) => {
      if (existentes.has(c.id)) return true;
      if (total < limite) {
        total++;
        return true;
      }
      recusados.push(c.id);
      return false;
    });
  }

  // O `where` no conflito impede uma conta de sobrescrever um id de outra.
  for (const c of lista) {
    await ctx.pool.query(
      `insert into characters (id, user_id, data, updated_at)
       values ($1, $2, $3, $4)
       on conflict (id) do update
         set data = excluded.data, updated_at = excluded.updated_at
         where characters.user_id = excluded.user_id`,
      [
        c.id,
        ctx.userId,
        JSON.stringify(c),
        new Date(c.updatedAt).toISOString(),
      ],
    );
  }
  return NextResponse.json({ ok: true, recusados });
}
