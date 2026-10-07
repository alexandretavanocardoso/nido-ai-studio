import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { carregarConta } from "@/lib/creditos";
import { getStripe } from "@/lib/pagamentos/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — abre o portal do Stripe (cancelar assinatura, trocar cartão, ver faturas). */
export async function POST(req: Request) {
  const stripe = getStripe();
  const userId = await getUserId();
  if (!stripe || !userId)
    return NextResponse.json({ error: "Indisponível." }, { status: 400 });
  const conta = await carregarConta(userId);
  if (!conta.stripeCustomerId)
    return NextResponse.json(
      { error: "Nenhuma compra pelo Stripe nesta conta." },
      { status: 400 },
    );
  const origem =
    process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const portal = await stripe.billingPortal.sessions.create({
    customer: conta.stripeCustomerId,
    return_url: `${origem}/app/planos`,
  });
  return NextResponse.json({ url: portal.url });
}
