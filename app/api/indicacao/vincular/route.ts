import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { COOKIE_INDICACAO } from "@/lib/indicacao/regras";
import { vincularIndicacao } from "@/lib/indicacao/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — liga a conta recém-criada a quem a indicou, pelo código guardado no
 * cookie do link (?ref=). O cookie é apagado: a tentativa vale uma vez.
 */
export async function POST() {
  const userId = await getUserId();
  if (!userId || !getPool())
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const jar = await cookies();
  const codigo = jar.get(COOKIE_INDICACAO)?.value;
  const vinculado = codigo
    ? await vincularIndicacao(userId, decodeURIComponent(codigo))
    : false;
  jar.delete(COOKIE_INDICACAO);
  return NextResponse.json({ vinculado });
}
