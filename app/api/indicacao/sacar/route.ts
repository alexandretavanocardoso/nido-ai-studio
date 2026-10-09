import { liberadoOuResponder } from "@/lib/admin/acesso";
import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { sacarComissoes, sacarUsdc } from "@/lib/indicacao/server";
import { getStripe } from "@/lib/pagamentos/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** O envio on-chain espera a confirmação da rede. */
export const maxDuration = 120;

const BodySchema = z.union([
  z.object({ moeda: z.enum(["BRL", "USD"]) }),
  z.object({
    moeda: z.literal("USDC"),
    rede: z.enum(["solana", "base", "arbitrum", "bnb", "ethereum"]),
    carteira: z.string().min(20).max(80),
  }),
]);

/**
 * POST — saca todo o saldo disponível de uma moeda. BRL e USD vão para a conta
 * Stripe do usuário; USDC vai on-chain para a carteira informada.
 */
export async function POST(req: Request) {
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
  const gate = await allow(`saque:${userId}`, 3);
  if (!gate.ok)
    return NextResponse.json(
      { error: "Muitos pedidos de saque seguidos. Tente de novo em um minuto." },
      { status: 429 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Pedido de saque inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );

  if (parsed.data.moeda === "USDC") {
    const r = await sacarUsdc(userId, parsed.data.rede, parsed.data.carteira);
    if ("erro" in r)
      return NextResponse.json({ error: r.erro }, { status: 400 });
    return NextResponse.json(r);
  }

  const stripe = getStripe();
  if (!stripe)
    return NextResponse.json(
      { error: "Saque pelo Stripe não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const r = await sacarComissoes(stripe, userId, parsed.data.moeda);
  if ("erro" in r)
    return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json({ valor: r.valor });
}
