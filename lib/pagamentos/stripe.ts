import Stripe from "stripe";
import { getPool } from "@/lib/db";
import { ativarPlano, carregarConta } from "@/lib/creditos";
import { PACOTES, PLANOS, precoAvulso, precoPlano } from "@/lib/planos";
import { aplicarCompra, lerCompra, type Compra } from "./aplicar";

/**
 * Stripe (BRL): cartão, Pix e boleto.
 *  - Plano mensal → assinatura no cartão (renova sozinha; ativada a cada `invoice.paid`).
 *  - Plano anual e pacotes → pagamento único (cartão, Pix ou boleto — os métodos
 *    que estiverem ligados no Dashboard do Stripe).
 * Os preços vêm de lib/planos.ts (price_data), sem produtos pré-criados no Stripe.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

function centavos(reais: number) {
  return Math.round(reais * 100);
}

function descricao(compra: Compra): { nome: string; valor: number } {
  if (compra.tipo === "pacote") {
    const p = PACOTES[compra.pacote];
    return {
      nome: `NIDO Studio · ${p.creditos.toLocaleString("pt-BR")} créditos`,
      valor: p.precoBRL,
    };
  }
  if (compra.tipo === "avulso")
    return {
      nome: `NIDO Studio · ${compra.creditos.toLocaleString("pt-BR")} créditos`,
      valor: precoAvulso(compra.creditos, "BRL"),
    };
  const nome = `NIDO Studio · Plano ${PLANOS[compra.plano].nome} (${compra.intervalo})`;
  return { nome, valor: precoPlano(compra.plano, compra.intervalo, "BRL") };
}

/** Cria a sessão de Checkout e registra o pagamento pendente. Devolve a URL. */
export async function criarCheckout(
  stripe: Stripe,
  o: { userId: string; email: string | null; compra: Compra; origem: string },
): Promise<string> {
  const conta = await carregarConta(o.userId);
  const { nome, valor } = descricao(o.compra);
  const metadata = {
    userId: o.userId,
    tipo: o.compra.tipo,
    plano: o.compra.tipo === "plano" ? o.compra.plano : "",
    intervalo: o.compra.tipo === "plano" ? o.compra.intervalo : "",
    pacote: o.compra.tipo === "pacote" ? o.compra.pacote : "",
    creditos: o.compra.tipo === "avulso" ? String(o.compra.creditos) : "",
  };
  const assinatura =
    o.compra.tipo === "plano" && o.compra.intervalo === "mensal";
  const cliente = conta.stripeCustomerId
    ? { customer: conta.stripeCustomerId }
    : o.email
      ? { customer_email: o.email }
      : {};

  const session = await stripe.checkout.sessions.create({
    mode: assinatura ? "subscription" : "payment",
    client_reference_id: o.userId,
    metadata,
    ...cliente,
    ...(assinatura
      ? { subscription_data: { metadata } }
      : {
          customer_creation: conta.stripeCustomerId ? undefined : "always",
          payment_intent_data: { metadata },
        }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: centavos(valor),
          product_data: { name: nome },
          ...(assinatura ? { recurring: { interval: "month" as const } } : {}),
        },
      },
    ],
    locale: "pt-BR",
    success_url: `${o.origem}/app/planos?pagamento=sucesso`,
    cancel_url: `${o.origem}/app/planos?pagamento=cancelado`,
  });

  await getPool()!.query(
    `insert into pagamentos (id, user_id, provedor, tipo, plano, intervalo, pacote, creditos, valor, moeda)
     values ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, 'BRL') on conflict (id) do nothing`,
    [
      session.id,
      o.userId,
      o.compra.tipo,
      metadata.plano || null,
      metadata.intervalo || null,
      metadata.pacote || null,
      metadata.creditos ? Number(metadata.creditos) : null,
      valor,
    ],
  );
  return session.url!;
}

/** Marca o pagamento como pago (uma vez só) e aplica a compra. */
async function concluir(session: Stripe.Checkout.Session): Promise<void> {
  const m = session.metadata ?? {};
  const userId = m.userId || session.client_reference_id;
  const compra = lerCompra(m);
  if (!userId || !compra)
    return console.error("[stripe] sessão sem metadata válido:", session.id);

  const { rowCount } = await getPool()!.query(
    `insert into pagamentos (id, user_id, provedor, tipo, plano, intervalo, pacote, creditos, valor, moeda, status, pago_em)
     values ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, 'BRL', 'pago', now())
     on conflict (id) do update set status = 'pago', pago_em = now() where pagamentos.status <> 'pago'`,
    [
      session.id,
      userId,
      compra.tipo,
      m.plano || null,
      m.intervalo || null,
      m.pacote || null,
      compra.tipo === "avulso" ? compra.creditos : null,
      (session.amount_total ?? 0) / 100,
    ],
  );
  if (!rowCount) return; // já aplicado (webhook repetido)
  const customer =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  await aplicarCompra(userId, compra, {
    ref: session.id,
    stripeCustomerId: customer,
  });
}

/** Trata os eventos do webhook. Idempotente: o Stripe pode reenviar. */
export async function processarEvento(
  stripe: Stripe,
  evento: Stripe.Event,
): Promise<void> {
  switch (evento.type) {
    case "checkout.session.completed": {
      const s = evento.data.object;
      // Pagamento único já confirmado (cartão/Pix). Boleto chega depois (async_payment_succeeded).
      if (s.mode === "payment" && s.payment_status === "paid")
        await concluir(s);
      break;
    }
    case "checkout.session.async_payment_succeeded":
      await concluir(evento.data.object);
      break;
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      await getPool()!.query(
        "update pagamentos set status = 'expirado' where id = $1 and status = 'pendente'",
        [evento.data.object.id],
      );
      break;
    case "invoice.paid":
      await faturaPaga(stripe, evento.data.object);
      break;
    case "customer.subscription.deleted": {
      // O plano segue até o fim do período já pago; só desliga a renovação.
      const sub = evento.data.object;
      await getPool()!.query(
        "update creditos_conta set stripe_subscription_id = null, updated_at = now() where stripe_subscription_id = $1",
        [sub.id],
      );
      break;
    }
  }
}

/** Assinatura mensal: cada fatura paga ativa (1ª vez) ou renova o plano até o fim do período. */
async function faturaPaga(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  const det = invoice.parent?.subscription_details;
  const m = det?.metadata ?? {};
  const compra = lerCompra(m);
  if (!det || !m.userId || compra?.tipo !== "plano") return;
  const subscriptionId =
    typeof det.subscription === "string"
      ? det.subscription
      : det.subscription.id;
  const fim = invoice.lines.data[0]?.period?.end;
  if (!fim || !invoice.id) return;

  const { rowCount } = await getPool()!.query(
    `insert into pagamentos (id, user_id, provedor, tipo, plano, intervalo, valor, moeda, status, pago_em)
     values ($1, $2, 'stripe', 'plano', $3, 'mensal', $4, 'BRL', 'pago', now()) on conflict (id) do nothing`,
    [invoice.id, m.userId, compra.plano, invoice.amount_paid / 100],
  );
  if (!rowCount) return;

  // Trocou de plano com outra assinatura ativa: cancela a antiga (sem pró-rata).
  const conta = await carregarConta(m.userId);
  if (
    conta.stripeSubscriptionId &&
    conta.stripeSubscriptionId !== subscriptionId
  ) {
    await stripe.subscriptions
      .cancel(conta.stripeSubscriptionId)
      .catch((e) => console.error("[stripe] cancelar antiga:", e));
  }
  const customer =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  await ativarPlano(m.userId, compra.plano, "mensal", new Date(fim * 1000), {
    ref: invoice.id,
    stripeCustomerId: customer,
    stripeSubscriptionId: subscriptionId,
  });
}
