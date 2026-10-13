import { NextResponse } from "next/server";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { resumoPontos } from "@/lib/pontos-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — saldo de pontos, check-in, primeiros passos e histórico da conta. */
export async function GET() {
  const fechado = await liberadoOuResponder("pontos");
  if (fechado) return fechado;
  const userId = getPool() ? await getUserId() : null;
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  return NextResponse.json(await resumoPontos(userId));
}
