import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { cleanupOrphans } from "@/lib/storage/cleanup";
import { getS3 } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron diário (vercel.json): apaga arquivos órfãos do S3 e contadores
 * antigos de rate limit. A Vercel manda `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const pool = getPool();
  if (!pool)
    return NextResponse.json(
      { error: "DATABASE_URL não configurada." },
      { status: 500 },
    );

  const { rowCount } = await pool.query(
    "delete from rate_limits where window_start < now() - interval '2 days'",
  );

  const s3 = getS3();
  const storage = s3 ? await cleanupOrphans(s3, pool) : null;

  console.log("[cron] storage-cleanup", {
    rateLimitsApagados: rowCount,
    storage,
  });
  return NextResponse.json({ ok: true, rateLimitsApagados: rowCount, storage });
}
