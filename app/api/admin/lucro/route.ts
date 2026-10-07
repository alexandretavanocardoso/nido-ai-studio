import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import { lucroAdmin } from "@/lib/admin/consultas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?dias=7|30|90|0 — receita, custo de IA e lucro por usuário; 0 = desde o início (só admin). */
export async function GET(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const dias = Number(new URL(req.url).searchParams.get("dias") ?? 30);
  return NextResponse.json(
    await lucroAdmin([0, 7, 30, 90].includes(dias) ? dias : 30),
  );
}
