import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { ErroSorteio, informarPix } from "@/lib/sorteio/server";
import { limparChavePix, limparNome } from "@/lib/sorteio/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  sorteioId: z.string().min(1).max(40),
  chave: z.string().max(200),
  titular: z.string().max(120),
});

/**
 * POST — quem ganhou um prêmio em Pix informa a chave e o nome do titular
 * (pode corrigir até o admin pagar). O pagamento é feito à mão pelo admin.
 */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido.", code: "BAD_INPUT" }, { status: 400 });
  const chave = limparChavePix(parsed.data.chave);
  const titular = parsed.data.titular.replace(/\s+/g, " ").trim();
  if (!chave) return NextResponse.json({ error: "Escreva a sua chave Pix.", code: "BAD_INPUT" }, { status: 400 });
  if (titular.length < 3 || titular.length > 120 || !limparNome(titular.slice(0, 24)))
    return NextResponse.json({ error: "Escreva o nome completo do titular da chave.", code: "BAD_INPUT" }, { status: 400 });
  try {
    const entrega = await informarPix(pool, { userId, sorteioId: parsed.data.sorteioId, chave, titular });
    return NextResponse.json({ entrega });
  } catch (e) {
    if (e instanceof ErroSorteio) return NextResponse.json({ error: e.message, code: "STATUS" }, { status: 409 });
    throw e;
  }
}
