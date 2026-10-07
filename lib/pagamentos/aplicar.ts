import { ativarPlano, carregarConta, creditarAvulsos } from "@/lib/creditos";
import {
  BONUS_USDC,
  creditosAvulsoValido,
  PACOTES,
  PLANOS,
  type Intervalo,
  type PacoteId,
  type PlanoPago,
} from "@/lib/planos";

/** O que foi comprado (vem do metadata do Stripe ou da linha do pagamento USDC). */
export type Compra =
  | { tipo: "plano"; plano: PlanoPago; intervalo: Intervalo }
  | { tipo: "pacote"; pacote: PacoteId }
  | { tipo: "avulso"; creditos: number };

function addMeses(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

/**
 * Aplica uma compra paga à conta: ativa/estende o plano (mensal pré-pago ou
 * anual) ou soma os créditos do pacote. Pagamento em USDC ganha +5% em
 * créditos avulsos. Assinatura mensal no cartão NÃO passa por aqui — ela é
 * ativada a cada fatura paga (webhook `invoice.paid`).
 */
export async function aplicarCompra(
  userId: string,
  compra: Compra,
  opts: { ref: string; usdc?: boolean; stripeCustomerId?: string | null },
): Promise<void> {
  if (compra.tipo === "pacote" || compra.tipo === "avulso") {
    const base =
      compra.tipo === "pacote"
        ? PACOTES[compra.pacote].creditos
        : compra.creditos;
    const total = opts.usdc ? Math.round(base * (1 + BONUS_USDC)) : base;
    await creditarAvulsos(userId, total, "compra_pacote", opts.ref);
    return;
  }

  const meses = compra.intervalo === "anual" ? 12 : 1;
  const conta = await carregarConta(userId);
  // Mesmo plano ainda ativo: estende a partir do fim atual; senão, a partir de agora.
  const base =
    conta.plano === compra.plano &&
    conta.planoExpiraEm &&
    new Date(conta.planoExpiraEm) > new Date()
      ? new Date(conta.planoExpiraEm)
      : new Date();
  await ativarPlano(
    userId,
    compra.plano,
    compra.intervalo,
    addMeses(base, meses),
    {
      ref: opts.ref,
      stripeCustomerId: opts.stripeCustomerId,
    },
  );
  if (opts.usdc) {
    const bonus = Math.round(
      PLANOS[compra.plano].creditos * meses * BONUS_USDC,
    );
    if (bonus) await creditarAvulsos(userId, bonus, "bonus_usdc", opts.ref);
  }
}

/** Lê a compra a partir de metadata (Stripe) ou colunas (USDC). Null se inválida. */
export function lerCompra(m: {
  tipo?: string | null;
  plano?: string | null;
  intervalo?: string | null;
  pacote?: string | null;
  creditos?: string | number | null;
}): Compra | null {
  if (m.tipo === "avulso") {
    const n = Number(m.creditos);
    return creditosAvulsoValido(n) ? { tipo: "avulso", creditos: n } : null;
  }
  if (m.tipo === "pacote" && m.pacote && m.pacote in PACOTES)
    return { tipo: "pacote", pacote: m.pacote as PacoteId };
  if (
    m.tipo === "plano" &&
    (m.plano === "starter" || m.plano === "creator" || m.plano === "studio") &&
    (m.intervalo === "mensal" || m.intervalo === "anual")
  )
    return { tipo: "plano", plano: m.plano, intervalo: m.intervalo };
  return null;
}
