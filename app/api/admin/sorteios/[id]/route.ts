import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import { getPool } from "@/lib/db";
import {
  cancelarSorteio,
  carregarSorteio,
  concluirSeAcabou,
  ErroSorteio,
  largar,
  marcarPixPago,
  mudarInscricoes,
  participantesAdmin,
  removerParticipante,
  sorteioPublico,
} from "@/lib/sorteio/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — o sorteio (como as telas veem) e quem está participando, com o e-mail. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  let s = await carregarSorteio(pool, (await params).id);
  if (!s) return NextResponse.json({ error: "Sorteio não encontrado." }, { status: 404 });
  s = await concluirSeAcabou(pool, s);
  return NextResponse.json({
    sorteio: await sorteioPublico(pool, s),
    participantes: await participantesAdmin(pool, s.id),
    entrega: s.entrega,
  });
}

const AcaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.enum(["fechar", "reabrir", "largar", "cancelar", "pix_pago"]) }),
  z.object({ acao: z.literal("remover"), participanteId: z.string().min(1).max(40) }),
]);

/**
 * POST — fecha ou reabre as inscrições, larga a corrida (sorteia o ganhador
 * agora), cancela, tira um participante antes da largada, ou marca o Pix do
 * ganhador como pago.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  const id = (await params).id;
  const parsed = AcaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido.", code: "BAD_INPUT" }, { status: 400 });
  try {
    const b = parsed.data;
    if (b.acao === "fechar" || b.acao === "reabrir") await mudarInscricoes(pool, id, b.acao === "reabrir");
    else if (b.acao === "largar") await largar(pool, id);
    else if (b.acao === "cancelar") await cancelarSorteio(pool, id);
    else if (b.acao === "pix_pago") await marcarPixPago(pool, id);
    else if (b.acao === "remover") await removerParticipante(pool, id, b.participanteId);
    const s = (await carregarSorteio(pool, id))!;
    return NextResponse.json({
      sorteio: await sorteioPublico(pool, s),
      participantes: await participantesAdmin(pool, id),
      entrega: s.entrega,
    });
  } catch (e) {
    if (e instanceof ErroSorteio) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
