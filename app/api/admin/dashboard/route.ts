import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import { dashboardAdmin } from "@/lib/admin/consultas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?dias=7|30|90 — métricas dos posts de todos os influencers da plataforma (só admin). */
export async function GET(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const dias = Number(new URL(req.url).searchParams.get("dias"));
  return NextResponse.json(
    await dashboardAdmin([7, 30, 90].includes(dias) ? dias : 30),
  );
}
