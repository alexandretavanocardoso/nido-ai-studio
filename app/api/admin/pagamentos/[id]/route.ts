import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import {
  aprovarPagamento,
  expirarPagamento,
  reembolsarPagamento,
} from "@/lib/admin/acoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Acao = z.object({ acao: z.enum(["aprovar", "expirar", "reembolsar"]) });

/**
 * POST — aprovar à mão (aplica a compra), encerrar uma cobrança pendente ou
 * reembolsar uma compra paga, se a regra de reembolso deixar (só admin).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const parsed = Acao.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { id } = await params;
  try {
    if (parsed.data.acao === "reembolsar")
      return NextResponse.json({ ok: true, ...(await reembolsarPagamento(id)) });
    if (parsed.data.acao === "aprovar") await aprovarPagamento(admin, id);
    else await expirarPagamento(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
