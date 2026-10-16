import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { carregarSorteio, concluirSeAcabou, sorteioPublico } from "@/lib/sorteio/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — o sorteio para o palco do OBS (/sorteio/palco#s=<id>), sem login: os
 * corredores (nome, cor e rosto) e a receita da corrida. Nada de contas ou
 * e-mails. Conclui a corrida que já acabou, como as outras telas.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const pool = getPool();
  let s = pool ? await carregarSorteio(pool, (await params).id) : null;
  if (!pool || !s || s.status === "cancelado")
    return NextResponse.json({ error: "Sorteio não encontrado." }, { status: 404 });
  s = await concluirSeAcabou(pool, s);
  return NextResponse.json({ sorteio: await sorteioPublico(pool, s) });
}
