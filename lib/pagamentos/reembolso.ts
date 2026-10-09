import { getPool } from "@/lib/db";

/**
 * Regra de reembolso de uma compra (plano ou créditos, Stripe ou USDC):
 *  - até 7 dias depois do pagamento; e
 *  - só se NENHUM crédito da compra foi usado. Usou 1 crédito, não há mais
 *    reembolso: senão dava para comprar, gastar tudo em uma semana e pedir o
 *    dinheiro de volta.
 * Geração que falhou e teve os créditos devolvidos não conta como uso.
 */
export const PRAZO_REEMBOLSO_DIAS = 7;

export interface SituacaoReembolso {
  pode: boolean;
  /** Por que não pode (texto para mostrar a quem pediu). Null quando pode. */
  motivo: string | null;
  /** Créditos desta compra já usados. */
  usados: number;
  /** Último dia em que o reembolso é aceito (null se o pagamento não foi pago). */
  ate: string | null;
}

/** Decide o reembolso a partir dos fatos (função pura: é ela que os testes cobrem). */
export function avaliarReembolso(o: {
  status: string;
  pagoEm: Date | null;
  usados: number;
  agora?: Date;
}): SituacaoReembolso {
  const agora = o.agora ?? new Date();
  const ate = o.pagoEm
    ? new Date(o.pagoEm.getTime() + PRAZO_REEMBOLSO_DIAS * 86_400_000)
    : null;
  const nao = (motivo: string): SituacaoReembolso => ({
    pode: false,
    motivo,
    usados: o.usados,
    ate: ate?.toISOString() ?? null,
  });
  if (o.status === "estornado") return nao("Esta compra já foi reembolsada.");
  if (o.status !== "pago" || !ate)
    return nao("Só dá para reembolsar uma compra paga.");
  if (o.usados > 0)
    return nao(
      `Sem reembolso: ${o.usados} ${o.usados === 1 ? "crédito desta compra já foi usado" : "créditos desta compra já foram usados"}.`,
    );
  if (agora > ate)
    return nao(
      `Sem reembolso: o prazo de ${PRAZO_REEMBOLSO_DIAS} dias depois da compra já passou.`,
    );
  return { pode: true, motivo: null, usados: 0, ate: ate.toISOString() };
}

/**
 * Créditos da compra usados desde o pagamento, em SQL (para `p` = pagamentos).
 * Plano: o que saiu dos créditos do plano; pacote: o que saiu dos avulsos.
 * Conta os gastos (delta negativo) e desconta as devoluções de gerações que
 * falharam (motivo "estorno…"); não conta o que o sistema tira ou põe
 * (fim de plano, vencimento, ajuste do admin, o próprio estorno da compra).
 */
export const SQL_USADOS_DA_COMPRA = `coalesce((
  select greatest(0, -sum(case when p.tipo = 'plano' then m.do_plano else m.do_avulso end))
  from creditos_mov m
  where m.user_id = p.user_id and p.pago_em is not null and m.created_at >= p.pago_em
    and (
      (m.delta < 0 and m.motivo not in
        ('fim_plano', 'vencimento_avulsos', 'estorno_pagamento', 'ajuste_admin', 'remocao_plano'))
      or (m.delta > 0 and m.motivo <> 'estorno_pagamento'
          and (m.motivo like 'estorno%' or m.motivo = 'video_falado_ajuste'))
    )
), 0)`;

/** Situação do reembolso de um pagamento (null se ele não existe). */
export async function situacaoDoReembolso(
  pagamentoId: string,
): Promise<(SituacaoReembolso & { provedor: string; userId: string }) | null> {
  const { rows } = await getPool()!.query<{
    status: string;
    pago_em: string | null;
    provedor: string;
    user_id: string;
    usados: string | number;
  }>(
    `select p.status, p.pago_em, p.provedor, p.user_id, ${SQL_USADOS_DA_COMPRA} as usados
     from pagamentos p where p.id = $1`,
    [pagamentoId],
  );
  const p = rows[0];
  if (!p) return null;
  return {
    ...avaliarReembolso({
      status: p.status,
      pagoEm: p.pago_em ? new Date(p.pago_em) : null,
      usados: Number(p.usados),
    }),
    provedor: p.provedor,
    userId: p.user_id,
  };
}
