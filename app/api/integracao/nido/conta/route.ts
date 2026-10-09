import { NextResponse } from "next/server";
import { hit } from "@/lib/ai/rate-limit";
import { getPool } from "@/lib/db";
import { pedidoDoNido } from "@/lib/nido/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?email= — o Nido (nido-api) pergunta se este e-mail tem conta no Studio,
 * para liberar as campanhas exclusivas. Só responde a quem manda o segredo da
 * integração no header `x-studio-key`. Devolve só sim ou não.
 */
export async function GET(req: Request) {
  if (!pedidoDoNido(req))
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ existe: false });
  // O Nido guarda a resposta; isto só segura um laço descontrolado do outro lado.
  const gate = await hit("integracao:nido:conta", 600, 60);
  if (!gate.ok)
    return NextResponse.json(
      { error: "Muitas consultas seguidas." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );

  const email = (new URL(req.url).searchParams.get("email") ?? "").trim();
  if (!email || email.length > 254 || !email.includes("@"))
    return NextResponse.json({ error: "email inválido." }, { status: 400 });
  // Só conta com e-mail confirmado pelo login (Google): é ele que liga as duas contas.
  const { rowCount } = await pool.query(
    'select 1 from "user" where lower(email) = lower($1) and "emailVerified" limit 1',
    [email],
  );
  return NextResponse.json({ existe: !!rowCount });
}
