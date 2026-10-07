import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import { listarUsuarios } from "@/lib/admin/consultas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?q=&plano= — usuários com plano, saldo e uso (só admin). */
export async function GET(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const sp = new URL(req.url).searchParams;
  return NextResponse.json({
    usuarios: await listarUsuarios({
      q: sp.get("q") ?? undefined,
      plano: sp.get("plano") ?? undefined,
    }),
  });
}
