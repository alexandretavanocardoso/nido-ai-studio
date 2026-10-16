import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import {
  CHECKIN_ESPERA_HORAS,
  checkinLiberado,
  diaDoCiclo,
  MISSOES,
  PONTOS_INDICACAO,
  PONTOS_POR_CREDITO,
  PONTOS_POST,
  pontosDoCheckin,
  POSTS_POR_DIA,
  proximaSequencia,
  sequenciaViva,
  type MissaoId,
  type ResumoPontos,
} from "@/lib/pontos";

/**
 * Pontos por conta (tabelas pontos_conta / pontos_mov, migration 0034).
 * Server-side apenas.
 *
 * Os pontos contam para todas as contas desde já; só a tela (indicador,
 * check-in e página) fica fechada enquanto o recurso está em teste.
 * Quem dá pontos NUNCA lança: ponto que não entrou não pode derrubar a
 * geração, o pagamento ou o post que o causou.
 */

/** O "hoje" dos pontos: o dia no horário de Brasília. */
const HOJE = "(now() at time zone 'America/Sao_Paulo')::date";

/**
 * Soma (ou tira) pontos. Com `chave`, a mesma coisa só pontua uma vez por
 * conta. Devolve o saldo novo, ou null se não pontuou (já tinha pontuado, ou
 * o limite do dia acabou).
 */
async function mover(o: {
  userId: string;
  pontos: number;
  motivo: string;
  ref?: string | null;
  chave?: string | null;
  /** No máximo este tanto de lançamentos deste motivo por dia. */
  porDia?: number;
}): Promise<number | null> {
  const pool = getPool();
  if (!pool || !o.pontos) return null;
  const { rows } = await pool.query<{ saldo: number }>(
    `with novo as (
       insert into pontos_mov (id, user_id, delta, motivo, ref, chave)
       select $1, $2, $3::int, $4, $5, $6
        where $7::int is null or (
          select count(*) from pontos_mov
           where user_id = $2 and motivo = $4
             and (created_at at time zone 'America/Sao_Paulo')::date = ${HOJE}) < $7::int
       on conflict (user_id, chave) do nothing
       returning delta
     )
     insert into pontos_conta (user_id, saldo)
     select $2, delta from novo
     on conflict (user_id) do update
       set saldo = pontos_conta.saldo + excluded.saldo, updated_at = now()
     returning saldo`,
    [
      nanoid(14),
      o.userId,
      o.pontos,
      o.motivo,
      o.ref ?? null,
      o.chave ?? null,
      o.porDia ?? null,
    ],
  );
  return rows[0]?.saldo ?? null;
}

/** `mover` que nunca lança (para quem pontua de dentro de outra operação). */
async function pontuar(o: Parameters<typeof mover>[0]): Promise<void> {
  try {
    await mover(o);
  } catch (e) {
    console.warn("[pontos] não pontuei:", o.motivo, (e as Error).message);
  }
}

/**
 * Prêmio de sorteio em pontos (uma vez por sorteio). Lança se falhar: quem
 * entrega o prêmio precisa saber (lib/sorteio/server.ts).
 */
export async function pontosDoSorteio(userId: string, pontos: number, sorteioId: string): Promise<void> {
  await mover({ userId, pontos, motivo: "sorteio", ref: sorteioId, chave: `sorteio:${sorteioId}` });
}

/**
 * Pontos por participar de um sorteio: todos que correram, de uma vez (um
 * lançamento por conta e por sorteio — chamar de novo não pontua outra vez).
 * Lança se falhar.
 */
export async function pontosPorParticipar(userIds: string[], pontos: number, sorteioId: string): Promise<void> {
  const pool = getPool();
  if (!pool || !userIds.length || !pontos) return;
  await pool.query(
    `with novos as (
       insert into pontos_mov (id, user_id, delta, motivo, ref, chave)
       select substr(md5(random()::text || u || clock_timestamp()::text), 1, 14), u, $2::int, 'sorteio_participou', $3,
              'sorteio-participou:' || $3
         from unnest($1::text[]) as u
       on conflict (user_id, chave) do nothing
       returning user_id, delta
     )
     insert into pontos_conta (user_id, saldo)
     select user_id, delta from novos
     on conflict (user_id) do update
       set saldo = pontos_conta.saldo + excluded.saldo, updated_at = now()`,
    [userIds, pontos, sorteioId],
  );
}

/** Primeiro passo cumprido (pontua uma vez por conta). */
export async function missaoCumprida(
  userId: string | null | undefined,
  id: MissaoId,
): Promise<void> {
  if (!userId) return;
  await pontuar({
    userId,
    pontos: MISSOES[id].pontos,
    motivo: "missao",
    ref: id,
    chave: `missao:${id}`,
  });
}

/** Créditos gastos numa geração (`cobrancaId` liga ao estorno, se houver). */
export async function pontosPorGasto(
  userId: string,
  creditos: number,
  cobrancaId: string,
): Promise<void> {
  await pontuar({
    userId,
    pontos: Math.floor(creditos * PONTOS_POR_CREDITO),
    motivo: "creditos_gastos",
    ref: cobrancaId,
  });
}

/**
 * Créditos devolvidos (geração que falhou ou reembolso): saem os pontos que
 * aquela cobrança rendeu, no máximo o que ela ainda tem. Cobrança de antes dos
 * pontos não rendeu nada, então não tira nada.
 */
export async function tirarPontosDoEstorno(
  userId: string,
  cobrancaId: string,
  creditos: number,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `with dado as (
         select coalesce(sum(delta), 0)::int as n from pontos_mov
          where user_id = $1 and ref = $2 and motivo in ('creditos_gastos', 'estorno')
       ), novo as (
         insert into pontos_mov (id, user_id, delta, motivo, ref)
         select $3, $1, -least($4::int, dado.n), 'estorno', $2 from dado where dado.n > 0
         returning delta
       )
       update pontos_conta c set saldo = c.saldo + novo.delta, updated_at = now()
         from novo where c.user_id = $1`,
      [
        userId,
        cobrancaId,
        nanoid(14),
        Math.floor(creditos * PONTOS_POR_CREDITO),
      ],
    );
  } catch (e) {
    console.warn(
      "[pontos] não tirei os pontos do estorno:",
      (e as Error).message,
    );
  }
}

/** Post publicado nas redes (até POSTS_POR_DIA por dia) + o primeiro post. */
export async function pontosPorPost(
  userId: string,
  postId: string,
): Promise<void> {
  await pontuar({
    userId,
    pontos: PONTOS_POST,
    motivo: "post",
    ref: postId,
    chave: `post:${postId}`,
    porDia: POSTS_POR_DIA,
  });
  await missaoCumprida(userId, "primeiro_post");
}

/** Quem `indicadorId` indicou assinou um plano (uma vez por indicado). */
export async function pontosPorIndicacao(
  indicadorId: string,
  indicadoId: string,
): Promise<void> {
  await pontuar({
    userId: indicadorId,
    pontos: PONTOS_INDICACAO,
    motivo: "indicacao",
    ref: indicadoId,
    chave: `indicacao:${indicadoId}`,
  });
}

/** Erro com mensagem para mostrar a quem clicou. */
export class PontosError extends Error {}

interface Situacao {
  saldo: number;
  sequencia: number;
  /** Quando foi o último check-in (ISO), ou null se nunca fez. */
  ultimo: string | null;
  /** Horas desde o último check-in (null se nunca fez). */
  horas: number | null;
  /** Dia de hoje em Brasília (só para a chave do check-in). */
  hoje: string;
}

async function situacao(userId: string): Promise<Situacao> {
  const { rows } = await getPool()!.query<Situacao>(
    `select coalesce(c.saldo, 0)::int as saldo, coalesce(c.sequencia, 0)::int as sequencia,
            to_char(u.em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ultimo,
            (extract(epoch from now() - u.em) / 3600)::float8 as horas,
            ${HOJE}::text as hoje
       from (select max(created_at) as em from pontos_mov
              where user_id = $1 and motivo = 'checkin') u
       left join pontos_conta c on c.user_id = $1`,
    [userId],
  );
  return rows[0];
}

const JA_FEZ = "Você já fez o check-in. O próximo libera 24 horas depois do último.";

/** Check-in. Devolve quanto rendeu; lança PontosError se o último foi há menos de 24 horas. */
export async function fazerCheckin(
  userId: string,
): Promise<{ pontos: number; sequencia: number; saldo: number }> {
  const s = await situacao(userId);
  if (!checkinLiberado(s.horas)) throw new PontosError(JA_FEZ);
  const sequencia = proximaSequencia(s.sequencia, s.horas);
  const pontos = pontosDoCheckin(sequencia);
  // A chave do dia garante um check-in só, mesmo com dois cliques juntos (com
  // 24 horas entre um e outro, dois check-ins nunca caem no mesmo dia).
  const saldo = await mover({
    userId,
    pontos,
    motivo: "checkin",
    chave: `checkin:${s.hoje}`,
  });
  if (saldo === null) throw new PontosError(JA_FEZ);
  await getPool()!.query(
    "update pontos_conta set sequencia = $2, ultimo_checkin = $3::date where user_id = $1",
    [userId, sequencia, s.hoje],
  );
  return { pontos, sequencia, saldo };
}

/** Saldo, check-in, primeiros passos e histórico da conta. */
export async function resumoPontos(userId: string): Promise<ResumoPontos> {
  const pool = getPool()!;
  const [s, mov, feitas] = await Promise.all([
    situacao(userId),
    pool.query<{
      id: string;
      delta: number;
      motivo: string;
      ref: string | null;
      created_at: Date;
    }>(
      `select id, delta, motivo, ref, created_at from pontos_mov
        where user_id = $1 order by created_at desc limit 50`,
      [userId],
    ),
    pool.query<{ ref: string }>(
      "select ref from pontos_mov where user_id = $1 and motivo = 'missao'",
      [userId],
    ),
  ]);
  const emEspera = !checkinLiberado(s.horas);
  const sequencia = sequenciaViva(s.horas) ? s.sequencia : 0;
  return {
    saldo: s.saldo,
    sequencia,
    checkinHoje: emEspera,
    proximoEm:
      emEspera && s.ultimo
        ? new Date(
            new Date(s.ultimo).getTime() + CHECKIN_ESPERA_HORAS * 3_600_000,
          ).toISOString()
        : null,
    dia: diaDoCiclo(emEspera ? sequencia : sequencia + 1),
    missoesFeitas: feitas.rows
      .map((r) => r.ref)
      .filter((r): r is MissaoId => r in MISSOES),
    historico: mov.rows.map((m) => ({
      id: m.id,
      delta: m.delta,
      motivo: m.motivo,
      ref: m.ref,
      quando: new Date(m.created_at).toISOString(),
    })),
  };
}
