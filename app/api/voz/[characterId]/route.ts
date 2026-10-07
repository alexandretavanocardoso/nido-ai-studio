import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { DECLARACAO_VOZ } from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — vozes do personagem (mais recente primeiro) + texto da declaração de clonagem. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const userId = await getUserId();
  const pool = getPool();
  if (!userId || !pool)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { rows } = await pool.query(
    `select voice_id as "voiceId", nome, origem, descricao, amostra_key as "amostraKey", created_at as "criadaEm"
     from vozes where user_id = $1 and character_id = $2 order by created_at desc`,
    [userId, (await params).characterId],
  );
  return NextResponse.json({ vozes: rows, declaracao: DECLARACAO_VOZ });
}
