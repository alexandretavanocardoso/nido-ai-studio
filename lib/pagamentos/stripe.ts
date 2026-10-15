import Stripe from "stripe";
import { getPool } from "@/lib/db";
import { situacaoDoReembolso } from "./reembolso";
import { ativarPlano, carregarConta } from "@/lib/creditos";
import { cambioUsdBrl } from "@/lib/moeda";
import {
  PACOTES,
  PLANOS,
  PRECO_CREDITO,
  precoAvulso,
  precoPlano,
} from "@/lib/planos";
import {
  ajustarComissaoParcial,
  recuperarComissaoSacada,
  registrarComissao,
} from "@/lib/indicacao/server";
import {
  aplicarCompra,
  lerCompra,
  reverterCompra,
  type Compra,
} from "./aplicar";

/**
 * Stripe: cobra sempre em dólar (USD), o preço da tela, e só no cartão — sem
 * Pix e sem boleto, mesmo que estejam ligados no Dashboard.
 *  - Plano mensal → assinatura no cartão (renova sozinha; ativada a cada `invoice.paid`).
 *  - Plano anual e pacotes → pagamento único no cartão.
 * O checkout usa os preços do catálogo do Stripe (achados pela lookup key, ex.:
 * `plano_creator_mensal`, `pacote_p500`, `creditos_avulso`). Os valores de
 * lib/planos.ts mandam: sem preço no catálogo, ou com valor diferente, o preço
 * é montado na hora (price_data).
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

export type MoedaStripe = "BRL" | "USD";

/**
 * Nome do produto (no idioma de quem compra) e preço. O preço da tela é em
 * dólar; em BRL ele é convertido pelo câmbio (CAMBIO_USD_BRL) na hora de
 * cobrar, para dar Pix e boleto. Sem idioma, vale o da moeda (USD → inglês).
 */
export function descricao(
  compra: Compra,
  moeda: MoedaStripe = "BRL",
  idioma: "pt" | "en" = moeda === "USD" ? "en" : "pt",
): { nome: string; valor: number } {
  const en = idioma === "en";
  const qtd = (n: number) => n.toLocaleString(en ? "en-US" : "pt-BR");
  const naMoeda = (usd: number) =>
    moeda === "USD" ? usd : Math.round(usd * cambioUsdBrl() * 100) / 100;
  if (compra.tipo === "pacote") {
    const p = PACOTES[compra.pacote];
    return {
      nome: `NIDO Studio · ${qtd(p.creditos)} ${en ? "credits" : "créditos"}`,
      valor: naMoeda(p.precoUSD),
    };
  }
  if (compra.tipo === "avulso")
    return {
      nome: `NIDO Studio · ${qtd(compra.creditos)} ${en ? "credits" : "créditos"}`,
      valor: naMoeda(precoAvulso(compra.creditos, "USD")),
    };
  const nome = en
    ? `NIDO Studio · ${PLANOS[compra.plano].nome} plan (${compra.intervalo === "mensal" ? "monthly" : "yearly"})`
    : `NIDO Studio · Plano ${PLANOS[compra.plano].nome} (${compra.intervalo})`;
  return {
    nome,
    valor: naMoeda(precoPlano(compra.plano, compra.intervalo, "USD")),
  };
}

/** Apelido (lookup key) do preço no catálogo do Stripe. */
function lookupKey(compra: Compra): string {
  if (compra.tipo === "plano")
    return `plano_${compra.plano}_${compra.intervalo}`;
  if (compra.tipo === "pacote") return `pacote_${compra.pacote}`;
  return "creditos_avulso";
}

/**
 * Preço do catálogo para a compra, ou null se não existir ou se o valor no
 * Stripe estiver diferente do de lib/planos.ts (que é a fonte da verdade) —
 * nesses casos o checkout monta o preço na hora (price_data).
 */
async function precoCatalogo(
  stripe: Stripe,
  compra: Compra,
  moeda: MoedaStripe,
  unitario: number,
): Promise<string | null> {
  const key = lookupKey(compra);
  try {
    const { data } = await stripe.prices.list({
      lookup_keys: [key],
      active: true,
      limit: 1,
      expand: ["data.currency_options"],
    });
    const preco = data[0];
    if (!preco) return null;
    const m = moeda.toLowerCase();
    const noStripe =
      preco.currency === m
        ? preco.unit_amount
        : preco.currency_options?.[m]?.unit_amount;
    if (noStripe !== unitario) {
      console.error(
        `[stripe] preço ${key} (${moeda}) no catálogo é ${noStripe}, esperado ${unitario}; usando price_data.`,
      );
      return null;
    }
    return preco.id;
  } catch (e) {
    console.error("[stripe] catálogo:", key, e);
    return null;
  }
}

/** Cria a sessão de Checkout e registra o pagamento pendente. Devolve a URL. */
export async function criarCheckout(
  stripe: Stripe,
  o: {
    userId: string;
    email: string | null;
    compra: Compra;
    origem: string;
    /** Idioma da página do Stripe e do nome do produto (o da interface). */
    idioma?: "pt" | "en";
  },
): Promise<string> {
  const conta = await carregarConta(o.userId);
  const moeda: MoedaStripe = "USD";
  const idioma = o.idioma ?? "en";
  const { nome, valor } = descricao(o.compra, moeda, idioma);
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

  // Créditos por quantidade: o preço do catálogo é por crédito.
  const quantidade = o.compra.tipo === "avulso" ? o.compra.creditos : 1;
  const unitario =
    o.compra.tipo === "avulso"
      ? centavos(PRECO_CREDITO[moeda])
      : centavos(valor);
  const price = await precoCatalogo(stripe, o.compra, moeda, unitario);

  const session = await stripe.checkout.sessions.create({
    mode: assinatura ? "subscription" : "payment",
    client_reference_id: o.userId,
    // Só cartão (inclui Apple Pay e Google Pay): Pix e boleto ficam de fora
    // mesmo ligados no Dashboard. A API desta versão não aceita mais
    // `payment_method_types`; os outros métodos seguem o Dashboard.
    excluded_payment_method_types: ["pix", "boleto"],
    metadata,
    ...cliente,
    ...(assinatura
      ? { subscription_data: { metadata } }
      : {
          customer_creation: conta.stripeCustomerId ? undefined : "always",
          payment_intent_data: { metadata },
        }),
    ...(price ? { currency: moeda.toLowerCase() } : {}),
    line_items: [
      price
        ? { quantity: quantidade, price }
        : {
            quantity: 1,
            price_data: {
              currency: moeda.toLowerCase(),
              unit_amount: centavos(valor),
              product_data: { name: nome },
              ...(assinatura
                ? { recurring: { interval: "month" as const } }
                : {}),
            },
          },
    ],
    locale: idioma === "en" ? "en" : "pt-BR",
    success_url: `${o.origem}/app/planos?pagamento=sucesso`,
    cancel_url: `${o.origem}/app/planos?pagamento=cancelado`,
  });

  await getPool()!.query(
    `insert into pagamentos (id, user_id, provedor, tipo, plano, intervalo, pacote, creditos, valor, moeda)
     values ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, $9) on conflict (id) do nothing`,
    [
      session.id,
      o.userId,
      o.compra.tipo,
      metadata.plano || null,
      metadata.intervalo || null,
      metadata.pacote || null,
      metadata.creditos ? Number(metadata.creditos) : null,
      valor,
      moeda,
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
     values ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, $9, 'pago', now())
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
      (session.currency ?? "brl").toUpperCase(),
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
      // Pagamento único já confirmado (cartão). Métodos assíncronos chegariam
      // depois (async_payment_succeeded) — hoje o checkout só aceita cartão.
      if (s.mode === "payment" && s.payment_status === "paid")
        await concluir(s);
      break;
    }
    case "checkout.session.async_payment_succeeded":
      // Assinatura é ativada (e gera comissão) pelo invoice.paid: aplicar aqui
      // também daria o plano e a comissão duas vezes pelo mesmo dinheiro.
      if (evento.data.object.mode === "payment")
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
    case "charge.refunded": {
      // Estorno total: tira o plano/créditos e a comissão de quem indicou.
      // Estorno parcial: o usuário fica com a compra; a comissão encolhe na mesma proporção.
      const c = evento.data.object;
      if (c.refunded) await estornarDoPagamento(stripe, c.payment_intent);
      else if (c.amount_refunded > 0 && c.amount > 0) {
        const id = await pagamentoDaCobranca(stripe, c.payment_intent);
        if (id)
          await ajustarComissaoParcial(id, 1 - c.amount_refunded / c.amount);
      }
      break;
    }
    case "charge.dispute.created": {
      // Contestação no cartão: o dinheiro sai da conta; a compra e a comissão também.
      const d = evento.data.object;
      const charge =
        typeof d.charge === "string"
          ? await stripe.charges.retrieve(d.charge)
          : d.charge;
      await estornarDoPagamento(stripe, charge.payment_intent);
      break;
    }
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

/** Id do nosso pagamento (sessão de checkout ou fatura da assinatura) de uma cobrança do Stripe. */
async function pagamentoDaCobranca(
  stripe: Stripe,
  paymentIntent: string | Stripe.PaymentIntent | null,
): Promise<string | null> {
  const pi =
    typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
  if (!pi) return null;
  const sessoes = await stripe.checkout.sessions.list({
    payment_intent: pi,
    limit: 1,
  });
  if (sessoes.data[0]) return sessoes.data[0].id;
  const faturas = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: pi },
    limit: 1,
  });
  const fatura = faturas.data[0]?.invoice;
  return (typeof fatura === "string" ? fatura : fatura?.id) ?? null;
}

/** PaymentIntent da cobrança de um pagamento nosso (sessão de checkout ou fatura). */
async function intencaoDoPagamento(
  stripe: Stripe,
  pagamentoId: string,
): Promise<string | null> {
  const id = (v: string | { id: string } | null | undefined) =>
    typeof v === "string" ? v : (v?.id ?? null);
  let fatura: string | null = pagamentoId.startsWith("in_") ? pagamentoId : null;
  if (pagamentoId.startsWith("cs_")) {
    const sessao = await stripe.checkout.sessions.retrieve(pagamentoId);
    const direto = id(sessao.payment_intent);
    if (direto) return direto;
    // Assinatura: a cobrança está na primeira fatura.
    fatura = id(sessao.invoice);
  }
  if (!fatura) return null;
  const pagos = await stripe.invoicePayments.list({ invoice: fatura, limit: 5 });
  for (const p of pagos.data) {
    const pi = id(p.payment.payment_intent);
    if (pi) return pi;
  }
  return null;
}

/**
 * Reembolso pedido pelo painel: confere a regra (7 dias, nenhum crédito usado),
 * devolve o dinheiro no Stripe e desfaz a compra na hora. O webhook do estorno
 * chega depois e não faz nada (a compra já está como estornada).
 */
export async function reembolsarNoStripe(pagamentoId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe não configurado no servidor.");
  const situacao = await situacaoDoReembolso(pagamentoId);
  if (!situacao) throw new Error("Pagamento não encontrado.");
  if (!situacao.pode) throw new Error(situacao.motivo ?? "Sem reembolso.");
  const pi = await intencaoDoPagamento(stripe, pagamentoId);
  if (!pi)
    throw new Error(
      "Não achei a cobrança deste pagamento no Stripe. Faça o reembolso pelo painel do Stripe.",
    );
  await stripe.refunds.create(
    { payment_intent: pi, reason: "requested_by_customer" },
    { idempotencyKey: `reembolso-${pagamentoId}` },
  );
  const desfeito = await reverterCompra(pagamentoId);
  await recuperarComissaoSacada(stripe, pagamentoId);
  if (desfeito?.assinatura)
    await stripe.subscriptions
      .cancel(desfeito.assinatura)
      .catch((e) => console.error("[stripe] cancelar após reembolso:", e));
}

/**
 * Cobrança estornada por inteiro ou contestada: desfaz a compra (plano ou
 * créditos) e a comissão de indicação, e cancela a assinatura para não cobrar de novo.
 */
async function estornarDoPagamento(
  stripe: Stripe,
  paymentIntent: string | Stripe.PaymentIntent | null,
): Promise<void> {
  const pagamentoId = await pagamentoDaCobranca(stripe, paymentIntent);
  if (!pagamentoId) return;
  const desfeito = await reverterCompra(pagamentoId);
  if (!desfeito) return;
  // Comissão que já tinha sido sacada: tenta trazer de volta da conta do indicador.
  await recuperarComissaoSacada(stripe, pagamentoId);
  console.log("[stripe] compra estornada:", pagamentoId, desfeito.userId);
  if (desfeito.assinatura)
    await stripe.subscriptions
      .cancel(desfeito.assinatura)
      .catch((e) => console.error("[stripe] cancelar após estorno:", e));
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
     values ($1, $2, 'stripe', 'plano', $3, 'mensal', $4, $5, 'pago', now()) on conflict (id) do nothing`,
    [
      invoice.id,
      m.userId,
      compra.plano,
      invoice.amount_paid / 100,
      (invoice.currency ?? "brl").toUpperCase(),
    ],
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
  await registrarComissao(invoice.id);
}
