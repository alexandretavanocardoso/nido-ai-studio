import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getUserId } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const pool = getPool();
  const userId = pool ? await getUserId() : null;
  if (!pool || !userId)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  await pool.query("delete from characters where id = $1 and user_id = $2", [
    id,
    userId,
  ]);
  return NextResponse.json({ ok: true });
}
