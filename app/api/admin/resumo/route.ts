import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import { resumoAdmin } from "@/lib/admin/consultas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — números gerais do produto (só admin). */
export async function GET() {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(await resumoAdmin());
}
