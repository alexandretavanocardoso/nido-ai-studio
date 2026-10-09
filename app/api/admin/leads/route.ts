import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import { listarLeads } from "@/lib/admin/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — contatos da landing page: propostas do plano Agência e whitelist (só admin). */
export async function GET() {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(await listarLeads());
}
