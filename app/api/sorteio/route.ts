import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import {
  concluirSeAcabou,
  minhaParticipacao,
  sorteioAtual,
  sorteioPublico,
} from "@/lib/sorteio/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — o sorteio da vez (aberto, correndo ou que acabou há pouco), a
 * participação da conta e, se ela ganhou, o que recebeu. Sem sorteio:
 * `sorteio: null` (o menu esconde o item). Conclui a corrida que já acabou.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ sorteio: null, eu: null });
  let s = await sorteioAtual(pool);
  if (!s) return NextResponse.json({ sorteio: null, eu: null });
  s = await concluirSeAcabou(pool, s);
  const eu = await minhaParticipacao(pool, s.id, userId);
  const ganhei = s.status === "concluido" && !!eu && s.vencedor_id === eu.id;
  return NextResponse.json({
    sorteio: await sorteioPublico(pool, s),
    eu,
    ganhei,
    entrega: ganhei ? s.entrega : null,
  });
}
