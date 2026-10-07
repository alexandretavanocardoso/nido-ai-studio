import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { recursosDisponiveis } from "@/lib/recursos";
import { avisosDoUsuario } from "@/lib/radar/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — radares novos com destaque, ainda não vistos (o sino da barra do topo). */
export async function GET() {
  if (!recursosDisponiveis().login) return NextResponse.json({ avisos: [] });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ avisos: [] });
  return NextResponse.json({ avisos: await avisosDoUsuario(userId) });
}
