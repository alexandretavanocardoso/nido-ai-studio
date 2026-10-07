import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { planoAtual } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import {
  DECLARACAO_TREINO,
  statusPersona,
  treinosGratisNoMes,
} from "@/lib/persona/server";
import { PLANOS } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — situação da persona do personagem (último treino) e treinos grátis restantes no mês. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const userId = await getUserId();
  if (!userId || !getPool())
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { characterId } = await params;
  const [persona, plano, usados] = await Promise.all([
    statusPersona(userId, characterId),
    planoAtual(userId),
    treinosGratisNoMes(userId),
  ]);
  return NextResponse.json({
    persona,
    gratisRestantes: Math.max(0, PLANOS[plano].treinosGratisMes - usados),
    declaracao: DECLARACAO_TREINO,
  });
}
