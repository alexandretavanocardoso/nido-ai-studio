import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { recursosDisponiveis } from "@/lib/recursos";
import { PLANOS, type Intervalo, type PlanoId } from "@/lib/planos";

/**
 * Créditos por conta (tabelas creditos_conta / creditos_mov, migration 0005).
 * Server-side apenas.
 *
 *  - Saldo em dois baldes: do plano (recarrega todo mês) e avulso (pacotes,
 *    12 meses). Débitos gastam primeiro o do plano.
 *  - A recarga mensal é "preguiçosa": acontece na primeira leitura depois da
 *    data de recarga — sem cron, e vale tanto pra assinatura mensal quanto
 *    pro anual pré-pago.
 *  - Toda geração reserva os créditos antes de chamar o serviço e estorna
 *    se der erro.
 */

const BONUS_CADASTRO = PLANOS.gratis.creditos;
const MESES_AVULSO = 12;

export interface Conta {
  plano: PlanoId;
  intervalo: Intervalo | null;
  planoExpiraEm: string | null;
  proximaRecargaEm: string | null;
  creditosPlano: number;
  creditosAvulsos: number;
  avulsosExpiraEm: string | null;
  total: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface Linha {
  plano: PlanoId;
  intervalo: Intervalo | null;
  plano_expira_em: Date | null;
  proxima_recarga_em: Date | null;
  creditos_plano: number;
  creditos_avulsos: number;
  avulsos_expira_em: Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/** Cobrança feita numa geração — guardada pra estornar se der erro. */
export interface Cobranca {
  id: string;
  userId: string;
  total: number;
  doPlano: number;
  doAvulso: number;
}

/** Sem login configurado (modo dev), não há conta nem créditos. */
export function creditosAtivos(): boolean {
  return recursosDisponiveis().login && !!getPool();
}

function pool() {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL não configurada.");
  return p;
}

function addMeses(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

function paraConta(l: Linha): Conta {
  return {
    plano: l.plano,
    intervalo: l.intervalo,
    planoExpiraEm: l.plano_expira_em?.toISOString() ?? null,
    proximaRecargaEm: l.proxima_recarga_em?.toISOString() ?? null,
    creditosPlano: l.creditos_plano,
    creditosAvulsos: l.creditos_avulsos,
    avulsosExpiraEm: l.avulsos_expira_em?.toISOString() ?? null,
    total: l.creditos_plano + l.creditos_avulsos,
    stripeCustomerId: l.stripe_customer_id,
    stripeSubscriptionId: l.stripe_subscription_id,
  };
}

/**
 * Lê a conta (criando com o bônus de cadastro na primeira vez) e aplica o
 * que venceu: recarga mensal do plano, fim do plano, vencimento dos avulsos.
 */
export async function carregarConta(userId: string): Promise<Conta> {
  const db = await pool().connect();
  try {
    await db.query("begin");
    const criada = await db.query(
      `insert into creditos_conta (user_id, creditos_avulsos, avulsos_expira_em)
       values ($1, $2, now() + interval '${MESES_AVULSO} months')
       on conflict (user_id) do nothing returning user_id`,
      [userId, BONUS_CADASTRO]
    );
    if (criada.rowCount) await registrar(db, userId, BONUS_CADASTRO, 0, BONUS_CADASTRO, "bonus_cadastro", null);

    const { rows } = await db.query<Linha>("select * from creditos_conta where user_id = $1 for update", [userId]);
    const l = rows[0];
    const agora = new Date();
    let mudou = false;

    // Plano pago vencido → volta pro grátis e perde os créditos do plano.
    if (l.plano !== "gratis" && l.plano_expira_em && l.plano_expira_em <= agora) {
      if (l.creditos_plano) await registrar(db, userId, -l.creditos_plano, -l.creditos_plano, 0, "fim_plano", l.plano);
      Object.assign(l, { plano: "gratis", intervalo: null, plano_expira_em: null, proxima_recarga_em: null, creditos_plano: 0 });
      mudou = true;
    }

    // Recargas mensais pendentes (pode ser mais de uma se a conta ficou parada).
    const p = PLANOS[l.plano];
    while (
      l.plano !== "gratis" &&
      l.proxima_recarga_em &&
      l.plano_expira_em &&
      l.proxima_recarga_em <= agora &&
      l.proxima_recarga_em < l.plano_expira_em
    ) {
      const novo = p.creditos + (p.rollover ? Math.min(l.creditos_plano, p.creditos) : 0);
      const delta = novo - l.creditos_plano;
      if (delta) await registrar(db, userId, delta, delta, 0, "recarga_plano", l.plano);
      l.creditos_plano = novo;
      l.proxima_recarga_em = addMeses(l.proxima_recarga_em, 1);
      mudou = true;
    }

    // Avulsos vencidos.
    if (l.creditos_avulsos > 0 && l.avulsos_expira_em && l.avulsos_expira_em <= agora) {
      await registrar(db, userId, -l.creditos_avulsos, 0, -l.creditos_avulsos, "vencimento_avulsos", null);
      l.creditos_avulsos = 0;
      mudou = true;
    }

    if (mudou) {
      await db.query(
        `update creditos_conta set plano = $2, intervalo = $3, plano_expira_em = $4, proxima_recarga_em = $5,
           creditos_plano = $6, creditos_avulsos = $7, updated_at = now()
         where user_id = $1`,
        [userId, l.plano, l.intervalo, l.plano_expira_em, l.proxima_recarga_em, l.creditos_plano, l.creditos_avulsos]
      );
    }
    await db.query("commit");
    return paraConta(l);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

type Db = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

async function registrar(
  db: Db,
  userId: string,
  delta: number,
  doPlano: number,
  doAvulso: number,
  motivo: string,
  ref: string | null
) {
  await db.query(
    "insert into creditos_mov (id, user_id, delta, do_plano, do_avulso, motivo, ref) values ($1, $2, $3, $4, $5, $6, $7)",
    [nanoid(14), userId, delta, doPlano, doAvulso, motivo, ref]
  );
}

/**
 * Debita `qtd` créditos (plano primeiro, depois avulsos) de forma atômica: o
 * saldo e o lançamento no extrato mudam no mesmo comando, então não existe
 * débito sem extrato (é pelo extrato que um serviço que caiu no meio descobre
 * que cobrou). Devolve a cobrança, ou null se o saldo não cobre.
 */
export async function debitar(userId: string, qtd: number, motivo: string, ref?: string): Promise<Cobranca | null> {
  await carregarConta(userId); // aplica recargas/vencimentos antes
  const id = nanoid(14);
  const { rows } = await pool().query<{ do_plano: number; do_avulso: number }>(
    `with alvo as (
       select user_id, creditos_plano as p, creditos_avulsos as a
       from creditos_conta where user_id = $1 for update
     ), deb as (
       update creditos_conta c
          set creditos_plano = alvo.p - least(alvo.p, $2),
              creditos_avulsos = alvo.a - ($2 - least(alvo.p, $2)),
              updated_at = now()
         from alvo
        where c.user_id = alvo.user_id and alvo.p + alvo.a >= $2
       returning c.user_id, least(alvo.p, $2) as do_plano, $2 - least(alvo.p, $2) as do_avulso
     )
     insert into creditos_mov (id, user_id, delta, do_plano, do_avulso, motivo, ref)
     select $3::text, deb.user_id, -(deb.do_plano + deb.do_avulso), -deb.do_plano, -deb.do_avulso, $4::text, $5::text
       from deb
     returning -do_plano as do_plano, -do_avulso as do_avulso`,
    [userId, qtd, nanoid(14), motivo, ref ?? id]
  );
  if (!rows[0]) return null;
  return { id, userId, total: qtd, doPlano: rows[0].do_plano, doAvulso: rows[0].do_avulso };
}

/** Devolve uma cobrança (geração que falhou), para os mesmos baldes. */
export async function estornar(c: Cobranca, motivo = "estorno"): Promise<void> {
  await pool().query(
    `update creditos_conta set creditos_plano = creditos_plano + $2, creditos_avulsos = creditos_avulsos + $3,
       updated_at = now() where user_id = $1`,
    [c.userId, c.doPlano, c.doAvulso]
  );
  await registrar(pool(), c.userId, c.total, c.doPlano, c.doAvulso, motivo, c.id);
}

/** Créditos avulsos (pacote comprado): somam e renovam a validade para 12 meses. */
export async function creditarAvulsos(userId: string, qtd: number, motivo: string, ref: string): Promise<void> {
  await carregarConta(userId);
  await pool().query(
    `update creditos_conta set creditos_avulsos = creditos_avulsos + $2,
       avulsos_expira_em = greatest(coalesce(avulsos_expira_em, now()), now() + interval '${MESES_AVULSO} months'),
       updated_at = now() where user_id = $1`,
    [userId, qtd]
  );
  await registrar(pool(), userId, qtd, 0, qtd, motivo, ref);
}

/**
 * Ativa (ou renova) um plano pago até `ate`.
 *  - Renovação do mesmo plano: só estende a validade (a recarga mensal segue o calendário).
 *  - Plano novo / trocado / reativado: créditos do plano = cota cheia agora, próxima recarga em 1 mês.
 */
export async function ativarPlano(
  userId: string,
  plano: Exclude<PlanoId, "gratis">,
  intervalo: Intervalo,
  ate: Date,
  opts: { ref: string; stripeCustomerId?: string | null; stripeSubscriptionId?: string | null }
): Promise<void> {
  const conta = await carregarConta(userId);
  const renovacao = conta.plano === plano && conta.planoExpiraEm && new Date(conta.planoExpiraEm) > new Date();
  const extras = [opts.stripeCustomerId ?? null, opts.stripeSubscriptionId ?? null];

  if (renovacao) {
    await pool().query(
      `update creditos_conta set plano_expira_em = greatest(plano_expira_em, $2), intervalo = $3,
         stripe_customer_id = coalesce($4, stripe_customer_id),
         stripe_subscription_id = coalesce($5, stripe_subscription_id), updated_at = now()
       where user_id = $1`,
      [userId, ate, intervalo, ...extras]
    );
    await registrar(pool(), userId, 0, 0, 0, "renovacao_plano", opts.ref);
    return;
  }

  const cota = PLANOS[plano].creditos;
  await pool().query(
    `update creditos_conta set plano = $2, intervalo = $3, plano_expira_em = $4,
       proxima_recarga_em = now() + interval '1 month', creditos_plano = $5,
       stripe_customer_id = coalesce($6, stripe_customer_id),
       stripe_subscription_id = coalesce($7, stripe_subscription_id), updated_at = now()
     where user_id = $1`,
    [userId, plano, intervalo, ate, cota, ...extras]
  );
  await registrar(pool(), userId, cota - conta.creditosPlano, cota - conta.creditosPlano, 0, "ativacao_plano", opts.ref);
}

/**
 * Atalho para as rotas: debita ou devolve a resposta 402 pronta.
 * Sem créditos ativos (modo dev, sem login), não cobra nada.
 */
/**
 * Pagamento estornado: volta a conta para o gratuito agora (zera os créditos
 * do plano; os avulsos ficam) e desliga a assinatura guardada.
 */
export async function removerPlanoPorEstorno(userId: string, ref: string): Promise<void> {
  const conta = await carregarConta(userId);
  if (conta.plano === "gratis") return;
  await pool().query(
    `update creditos_conta set plano = 'gratis', intervalo = null, plano_expira_em = null,
       proxima_recarga_em = null, creditos_plano = 0, stripe_subscription_id = null, updated_at = now()
     where user_id = $1`,
    [userId]
  );
  await registrar(pool(), userId, -conta.creditosPlano, -conta.creditosPlano, 0, "estorno_pagamento", ref);
}

/**
 * Pagamento de créditos estornado: tira os créditos comprados. Se parte já foi
 * gasta, tira o que sobrou (o saldo nunca fica negativo). Devolve quanto tirou.
 */
export async function retirarAvulsosPorEstorno(userId: string, qtd: number, ref: string): Promise<number> {
  await carregarConta(userId);
  const { rows } = await pool().query<{ tirou: number }>(
    `with alvo as (select user_id, creditos_avulsos as a from creditos_conta where user_id = $1 for update)
     update creditos_conta c set creditos_avulsos = alvo.a - least(alvo.a, $2), updated_at = now()
       from alvo where c.user_id = alvo.user_id
     returning least(alvo.a, $2)::int as tirou`,
    [userId, qtd]
  );
  const tirou = rows[0]?.tirou ?? 0;
  if (tirou) await registrar(pool(), userId, -tirou, 0, -tirou, "estorno_pagamento", ref);
  return tirou;
}

export async function cobrarOuResponder(
  userId: string | null,
  qtd: number,
  motivo: string,
  ref?: string
): Promise<{ cobranca: Cobranca | null } | NextResponse> {
  if (!creditosAtivos() || !userId) return { cobranca: null };
  const cobranca = await debitar(userId, qtd, motivo, ref);
  if (cobranca) return { cobranca };
  const conta = await carregarConta(userId);
  return NextResponse.json(
    {
      error: `Créditos insuficientes: esta geração custa ${qtd} e você tem ${conta.total}. Veja os planos e pacotes.`,
      code: "SEM_CREDITOS",
      necessario: qtd,
      saldo: conta.total,
    },
    { status: 402 }
  );
}

/** Estorna se houver cobrança (atalho para os `catch` das rotas). */
export async function estornarSeHouver(c: Cobranca | null | undefined, motivo = "estorno"): Promise<void> {
  if (c) await estornar(c, motivo).catch((e) => console.error("[creditos] estorno falhou:", e));
}

/** Plano atual da conta. Sem login configurado (modo dev), libera tudo. */
export async function planoAtual(userId: string | null): Promise<PlanoId> {
  if (!creditosAtivos() || !userId) return "studio"; // modo dev (sem login): sem restrições de plano
  return (await carregarConta(userId)).plano;
}

/** Devolve parte de uma cobrança (ex.: lote em que só algumas gerações deram certo). */
export async function estornarParcial(c: Cobranca | null | undefined, qtd: number, motivo = "estorno_parcial"): Promise<void> {
  if (!c || qtd <= 0) return;
  const total = Math.min(qtd, c.total);
  const doAvulso = Math.min(total, c.doAvulso);
  const doPlano = total - doAvulso;
  await estornar({ ...c, total, doPlano, doAvulso }, motivo).catch((e) =>
    console.error("[creditos] estorno parcial falhou:", e)
  );
}

/** A cobrança que sobra depois de um `estornarParcial(c, qtd)` (mesma regra: devolve primeiro o avulso). */
export function cobrancaRestante(c: Cobranca, qtd: number): Cobranca {
  const devolvido = Math.max(0, Math.min(qtd, c.total));
  const doAvulso = Math.min(devolvido, c.doAvulso);
  return {
    ...c,
    total: c.total - devolvido,
    doAvulso: c.doAvulso - doAvulso,
    doPlano: c.doPlano - (devolvido - doAvulso),
  };
}
