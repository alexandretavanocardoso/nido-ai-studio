import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { usoArmazenamento } from "@/lib/limites";
import { GRACE_MANUAL_MS, limparUsuario } from "@/lib/storage/cleanup";
import { getS3 } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST — "Liberar espaço agora": apaga os arquivos da conta que nenhum
 * personagem usa mais (removidos há mais de 30 min) e recalcula o uso.
 */
export async function POST() {
  const s3 = getS3();
  const pool = getPool();
  const userId = await getUserId();
  if (!s3 || !pool || !userId)
    return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  const r = await limparUsuario(s3, pool, userId, GRACE_MANUAL_MS);
  const usado = await usoArmazenamento(userId, true);
  return NextResponse.json({
    apagados: r.apagados,
    liberadoBytes: r.bytes,
    usadoBytes: usado,
  });
}
