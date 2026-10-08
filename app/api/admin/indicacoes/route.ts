import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import {
  estornarComissaoAdmin,
  listarIndicacoesAdmin,
  resolverSaque,
} from "@/lib/indicacao/admin";
import { getStripe } from "@/lib/pagamentos/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — indicações: quem indica, comissões e saques (só admin). */
export async function GET() {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(await listarIndicacoesAdmin());
}

const Acao = z.union([
  z.object({ acao: z.literal("estornar"), comissaoId: z.string().min(1) }),
  z.object({ acao: z.literal("resolver_saque"), saqueId: z.string().min(1) }),
]);

/** POST — estornar uma comissão à mão ou resolver um saque parado (só admin). */
export async function POST(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const parsed = Acao.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    if (parsed.data.acao === "estornar") {
      await estornarComissaoAdmin(parsed.data.comissaoId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({
      resultado: await resolverSaque(getStripe(), parsed.data.saqueId),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
