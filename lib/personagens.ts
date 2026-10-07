import { getPool } from "@/lib/db";
import { hydrate } from "@/lib/defaults";
import type { Character } from "@/lib/types";

/** Personagem da conta como está salvo no banco (null se ainda não sincronizou). */
export async function carregarPersonagem(userId: string, characterId: string): Promise<Character | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query<{ data: Character }>("select data from characters where id = $1 and user_id = $2", [
    characterId,
    userId,
  ]);
  return rows[0] ? hydrate(rows[0].data) : null;
}
