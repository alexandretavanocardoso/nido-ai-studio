import { NextResponse } from "next/server";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { fazerCheckin, PontosError, resumoPontos } from "@/lib/pontos-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — check-in do dia (um por dia, no horário de Brasília). Devolve o resumo atualizado. */
export async function POST() {
  const fechado = await liberadoOuResponder("pontos");
  if (fechado) return fechado;
  const userId = getPool() ? await getUserId() : null;
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  try {
    const { pontos } = await fazerCheckin(userId);
    return NextResponse.json({ ganhou: pontos, ...(await resumoPontos(userId)) });
  } catch (e) {
    if (e instanceof PontosError)
      return NextResponse.json(
        { error: e.message, code: "BAD_INPUT" },
        { status: 400 },
      );
    console.error("[pontos/checkin]", e);
    return NextResponse.json(
      { error: "Não consegui registrar o check-in.", code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
