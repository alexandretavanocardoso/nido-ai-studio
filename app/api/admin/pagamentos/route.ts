import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import { listarPagamentos } from "@/lib/admin/consultas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?q=&status=&provedor= — pagamentos, mais recentes primeiro (só admin). */
export async function GET(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const sp = new URL(req.url).searchParams;
  return NextResponse.json(
    await listarPagamentos({
      q: sp.get("q") ?? undefined,
      status: sp.get("status") ?? undefined,
      provedor: sp.get("provedor") ?? undefined,
    }),
  );
}
