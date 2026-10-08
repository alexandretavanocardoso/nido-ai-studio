import type Stripe from "stripe";
import { getPool } from "@/lib/db";
import { ehRedeUsdc } from "@/lib/pagamentos/redes-usdc";
import { situacaoDoEnvio } from "./onchain";
import { estornarComissao } from "./server";

function pool() {
  const p = getPool();
  if (!p) throw new Error("Banco não configurado.");
  return p;
}

export interface ComissaoAdmin {
  id: string;
  pagamentoId: string;
  indicadorId: string;
  indicadorEmail: string | null;
  indicadoId: string;
  indicadoEmail: string | null;
  plano: string | null;
  valorBase: number;
  valor: number;
  moeda: string;
  /** disponivel | sacada | estornada | estorno_devido | estorno_quitado */
  status: string;
  /** Ainda na carência (só para status disponivel). */
  emCarencia: boolean;
  disponivelEm: string;
  criadoEm: string;
}

export interface SaqueAdmin {
  id: string;
  userId: string;
  email: string | null;
  moeda: string;
  valor: number;
  /** processando | pago | falhou */
  status: string;
  stripeTransferId: string | null;
  /** Saque em USDC on-chain: rede, carteira de destino e hash da transação. */
  rede: string | null;
  carteira: string | null;
  txHash: string | null;
  erro: string | null;
  criadoEm: string;
}

export interface IndicadorAdmin {
  userId: string;
  email: string | null;
  codigo: string;
  personalizado: boolean;
  stripeConectado: boolean;
  indicados: number;
  assinaram: number;
}

export interface IndicacoesAdmin {
  /** Somas por moeda. */
  totais: Array<{
    moeda: string;
    pendente: number;
    disponivel: number;
    sacado: number;
    estornado: number;
    devido: number;
  }>;
  indicadores: IndicadorAdmin[];
  comissoes: ComissaoAdmin[];
  saques: SaqueAdmin[];
}

/** Tudo da aba Indicações do admin: quem indica, comissões e saques (até 200 de cada). */
export async function listarIndicacoesAdmin(): Promise<IndicacoesAdmin> {
  const db = pool();
  const [totais, indicadores, comissoes, saques] = await Promise.all([
    db.query<{
      moeda: string;
      pendente: string;
      disponivel: string;
      sacado: string;
      estornado: string;
      devido: string;
    }>(
      `select moeda,
         coalesce(sum(valor) filter (where status = 'disponivel' and disponivel_em > now()), 0) as pendente,
         coalesce(sum(valor) filter (where status = 'disponivel' and disponivel_em <= now()), 0) as disponivel,
         coalesce(sum(valor) filter (where status in ('sacada', 'estorno_devido', 'estorno_quitado')), 0) as sacado,
         coalesce(sum(valor) filter (where status like 'estorn%'), 0) as estornado,
         coalesce(sum(valor) filter (where status = 'estorno_devido'), 0) as devido
       from indicacao_comissoes group by moeda order by moeda`,
    ),
    db.query<{
      user_id: string;
      email: string | null;
      codigo: string;
      personalizado: boolean;
      stripe_account_id: string | null;
      indicados: number;
      assinaram: number;
    }>(
      `select c.user_id, u."email", c.codigo, c.personalizado, c.stripe_account_id,
         count(i.indicado_user_id)::int as indicados,
         count(m.id)::int as assinaram
       from indicacao_contas c
       join indicacoes i on i.indicador_user_id = c.user_id
       left join "user" u on u."id" = c.user_id
       left join indicacao_comissoes m on m.indicado_user_id = i.indicado_user_id
       group by c.user_id, u."email", c.codigo, c.personalizado, c.stripe_account_id
       order by count(i.indicado_user_id) desc limit 200`,
    ),
    db.query<{
      id: string;
      pagamento_id: string;
      indicador_user_id: string;
      indicador_email: string | null;
      indicado_user_id: string;
      indicado_email: string | null;
      plano: string | null;
      valor_base: string;
      valor: string;
      moeda: string;
      status: string;
      em_carencia: boolean;
      disponivel_em: Date;
      created_at: Date;
    }>(
      `select m.id, m.pagamento_id, m.indicador_user_id, a."email" as indicador_email,
         m.indicado_user_id, b."email" as indicado_email, m.plano, m.valor_base, m.valor,
         m.moeda, m.status, (m.disponivel_em > now()) as em_carencia, m.disponivel_em, m.created_at
       from indicacao_comissoes m
       left join "user" a on a."id" = m.indicador_user_id
       left join "user" b on b."id" = m.indicado_user_id
       order by m.created_at desc limit 200`,
    ),
    db.query<{
      id: string;
      user_id: string;
      email: string | null;
      moeda: string;
      valor: string;
      status: string;
      stripe_transfer_id: string | null;
      rede: string | null;
      carteira: string | null;
      tx_hash: string | null;
      erro: string | null;
      created_at: Date;
    }>(
      `select s.id, s.user_id, u."email", s.moeda, s.valor, s.status, s.stripe_transfer_id,
         s.rede, s.carteira, s.tx_hash, s.erro, s.created_at
       from indicacao_saques s left join "user" u on u."id" = s.user_id
       order by s.created_at desc limit 200`,
    ),
  ]);
  return {
    totais: totais.rows.map((t) => ({
      moeda: t.moeda,
      pendente: Number(t.pendente),
      disponivel: Number(t.disponivel),
      sacado: Number(t.sacado),
      estornado: Number(t.estornado),
      devido: Number(t.devido),
    })),
    indicadores: indicadores.rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      codigo: r.codigo,
      personalizado: r.personalizado,
      stripeConectado: !!r.stripe_account_id,
      indicados: r.indicados,
      assinaram: r.assinaram,
    })),
    comissoes: comissoes.rows.map((m) => ({
      id: m.id,
      pagamentoId: m.pagamento_id,
      indicadorId: m.indicador_user_id,
      indicadorEmail: m.indicador_email,
      indicadoId: m.indicado_user_id,
      indicadoEmail: m.indicado_email,
      plano: m.plano,
      valorBase: Number(m.valor_base),
      valor: Number(m.valor),
      moeda: m.moeda,
      status: m.status,
      emCarencia: m.em_carencia,
      disponivelEm: m.disponivel_em.toISOString(),
      criadoEm: m.created_at.toISOString(),
    })),
    saques: saques.rows.map((s) => ({
      id: s.id,
      userId: s.user_id,
      email: s.email,
      moeda: s.moeda,
      valor: Number(s.valor),
      status: s.status,
      stripeTransferId: s.stripe_transfer_id,
      rede: s.rede,
      carteira: s.carteira,
      txHash: s.tx_hash,
      erro: s.erro,
      criadoEm: s.created_at.toISOString(),
    })),
  };
}

/** Desfaz à mão uma comissão (ex.: plano pago em USDC devolvido fora do Stripe). */
export async function estornarComissaoAdmin(comissaoId: string): Promise<void> {
  const { rows } = await pool().query<{ pagamento_id: string }>(
    "select pagamento_id from indicacao_comissoes where id = $1",
    [comissaoId],
  );
  if (!rows[0]) throw new Error("Comissão não encontrada.");
  if (!(await estornarComissao(rows[0].pagamento_id)))
    throw new Error("Esta comissão já foi estornada.");
}

/** Um envio on-chain sem registro na rede só é dado como perdido depois disso. */
const ESPERA_ONCHAIN_MIN = 15;

/**
 * Resolve um saque que ficou "processando" (o servidor caiu no meio, ou a rede
 * não respondeu): confere se o dinheiro saiu. Saiu → marca como pago. Não saiu
 * → marca como falhou e devolve as comissões ao saldo do usuário.
 *
 * Stripe: procura a transferência do saque. USDC: consulta a transação pelo
 * hash; sem registro na rede, só devolve depois de ESPERA_ONCHAIN_MIN minutos.
 */
export async function resolverSaque(
  stripe: Stripe | null,
  saqueId: string,
): Promise<"pago" | "falhou"> {
  const db = pool();
  const { rows } = await db.query<{
    status: string;
    rede: string | null;
    tx_hash: string | null;
    minutos: number;
  }>(
    `select status, rede, tx_hash, extract(epoch from now() - created_at) / 60 as minutos
     from indicacao_saques where id = $1`,
    [saqueId],
  );
  const saque = rows[0];
  if (!saque) throw new Error("Saque não encontrado.");
  if (saque.status !== "processando")
    throw new Error("Este saque não está mais em processamento.");

  const pago = async (transferId: string | null) => {
    await db.query(
      "update indicacao_saques set status = 'pago', stripe_transfer_id = coalesce($2, stripe_transfer_id) where id = $1 and status = 'processando'",
      [saqueId, transferId],
    );
    return "pago" as const;
  };
  const falhou = async (motivo: string) => {
    await db.query(
      "update indicacao_comissoes set status = 'disponivel', saque_id = null where saque_id = $1 and status = 'sacada'",
      [saqueId],
    );
    await db.query(
      "update indicacao_saques set status = 'falhou', erro = $2 where id = $1 and status = 'processando'",
      [saqueId, motivo],
    );
    return "falhou" as const;
  };

  if (saque.rede) {
    if (!ehRedeUsdc(saque.rede)) throw new Error("Rede desconhecida.");
    // Sem hash, nada chegou a ser assinado: o saque parou antes do envio.
    if (!saque.tx_hash)
      return falhou("Interrompido antes do envio; saldo devolvido pelo admin.");
    const situacao = await situacaoDoEnvio(saque.rede, saque.tx_hash);
    if (situacao === "confirmado") return pago(null);
    if (situacao === "revertido")
      return falhou("A transação reverteu na rede; saldo devolvido pelo admin.");
    if (Number(saque.minutos) < ESPERA_ONCHAIN_MIN)
      throw new Error(
        `A rede ainda não registrou esta transação. Confira de novo depois de ${ESPERA_ONCHAIN_MIN} minutos do pedido.`,
      );
    return falhou(
      "A transação não entrou na rede; saldo devolvido pelo admin.",
    );
  }

  if (!stripe) throw new Error("Stripe não configurado.");
  const { data } = await stripe.transfers.list({
    transfer_group: saqueId,
    limit: 1,
  });
  if (data[0]) return pago(data[0].id);
  return falhou(
    "Interrompido antes da transferência; saldo devolvido pelo admin.",
  );
}
