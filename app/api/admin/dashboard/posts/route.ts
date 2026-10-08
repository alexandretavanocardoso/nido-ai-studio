import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import { getPool } from "@/lib/db";
import { postsComMetricas } from "@/lib/social/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?dias=7|30|90 — posts publicados de todas as contas, com as métricas por
 * rede (só admin). Traz o dobro do período, pra comparar com o anterior; é o
 * que o relatório em PDF do admin usa.
 */
export async function GET(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pedido = Number(new URL(req.url).searchParams.get("dias"));
  const dias = [7, 30, 90].includes(pedido) ? pedido : 30;
  const { posts } = await postsComMetricas(getPool()!, null, dias * 2);
  return NextResponse.json({ posts });
}
