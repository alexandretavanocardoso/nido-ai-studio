import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { contaDeIndicacao } from "@/lib/indicacao/server";
import { getStripe } from "@/lib/pagamentos/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — abre o painel do Stripe do usuário (saldo, repasses ao banco, dados bancários). */
export async function POST() {
  const stripe = getStripe();
  const userId = await getUserId();
  if (!stripe || !userId || !getPool())
    return NextResponse.json({ error: "Indisponível." }, { status: 400 });
  const conta = await contaDeIndicacao(userId);
  if (!conta.stripeAccountId)
    return NextResponse.json(
      { error: "Conecte sua conta do Stripe primeiro." },
      { status: 400 },
    );
  try {
    const link = await stripe.accounts.createLoginLink(conta.stripeAccountId);
    return NextResponse.json({ url: link.url });
  } catch (e) {
    console.error("[indicacao] painel Stripe:", e);
    return NextResponse.json(
      { error: "Termine o cadastro no Stripe para abrir o painel." },
      { status: 400 },
    );
  }
}
