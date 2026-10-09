import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  /** null = desfazer a escolha (volta a valer o link do post, se houver). */
  characterId: z.string().min(1).max(100).nullable(),
});

/**
 * PUT — escolhe à mão de qual personagem é uma campanha do Nido (Dashboard →
 * Por campanha). Serve para quem enviou o post direto no Nido, sem registrar
 * aqui, e para corrigir a ligação feita pelo link.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  const pool = getPool();
  if (!userId || !pool)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const campanhaId = (await params).id;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !/^[0-9a-zA-Z_-]{6,64}$/.test(campanhaId))
    return NextResponse.json(
      { error: "Pedido inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const { characterId } = parsed.data;

  if (!characterId) {
    await pool.query(
      "delete from nido_campanha_personagem where user_id = $1 and campanha_id = $2",
      [userId, campanhaId],
    );
    return NextResponse.json({ ok: true });
  }
  const { rowCount } = await pool.query(
    "select 1 from characters where id = $1 and user_id = $2",
    [characterId, userId],
  );
  if (!rowCount)
    return NextResponse.json(
      { error: "Personagem não encontrado.", code: "NOT_FOUND" },
      { status: 404 },
    );
  await pool.query(
    `insert into nido_campanha_personagem (user_id, campanha_id, character_id)
     values ($1, $2, $3)
     on conflict (user_id, campanha_id) do update
       set character_id = excluded.character_id, updated_at = now()`,
    [userId, campanhaId, characterId],
  );
  return NextResponse.json({ ok: true });
}
