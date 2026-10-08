import { NextResponse } from "next/server";
import { getStripe, processarEvento } from "@/lib/pagamentos/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — webhook do Stripe. Cadastre no Dashboard (Developers → Webhooks) a URL
 * https://SEU-DOMINIO/api/pagamentos/stripe/webhook com os eventos:
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired,
 * invoice.paid, customer.subscription.deleted, charge.refunded e
 * charge.dispute.created (os dois últimos desfazem a comissão de indicação).
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !segredo)
    return new NextResponse("Stripe não configurado.", { status: 500 });

  const assinatura = req.headers.get("stripe-signature");
  if (!assinatura) return new NextResponse("Sem assinatura.", { status: 400 });

  let evento;
  try {
    evento = stripe.webhooks.constructEvent(
      await req.text(),
      assinatura,
      segredo,
    );
  } catch (e) {
    console.error(
      "[stripe/webhook] assinatura inválida:",
      (e as Error).message,
    );
    return new NextResponse("Assinatura inválida.", { status: 400 });
  }

  try {
    await processarEvento(stripe, evento);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // 500 faz o Stripe reenviar; o processamento é idempotente.
    console.error("[stripe/webhook]", evento.type, e);
    return new NextResponse("Erro ao processar.", { status: 500 });
  }
}
