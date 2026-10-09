import { liberadoOuResponder } from "@/lib/admin/acesso";
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { linkDeIndicacao } from "@/lib/indicacao/regras";
import { resumoDaIndicacao } from "@/lib/indicacao/server";
import { getStripe } from "@/lib/pagamentos/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — programa de indicação do usuário: código, link, indicados, saldos e saques. */
export async function GET(req: Request) {
  const bloqueio = await liberadoOuResponder("indicacoes");
  if (bloqueio) return bloqueio;
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  if (!getPool())
    return NextResponse.json(
      { error: "Indicações não configuradas.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const resumo = await resumoDaIndicacao(userId, getStripe());
  const origem =
    process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  return NextResponse.json({
    ...resumo,
    link: linkDeIndicacao(origem, resumo.codigo),
  });
}
