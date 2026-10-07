import { getPool } from "@/lib/db";

/**
 * Consultas da área admin (somente leitura). Tudo agregado no Postgres;
 * 1 crédito ≈ US$ 0,01 de custo de provedor (ver lib/planos.ts).
 */
const pool = () => getPool()!;
const n = (v: unknown) => Number(v ?? 0);

/** Motivos de movimento que são gasto em geração (o resto é compra, bônus, estorno, ajuste). */
const MOTIVOS_ADMIN = ["ajuste_admin", "remocao_plano"];

export interface ResumoAdmin {
  usuarios: { total: number; novos7: number; novos30: number; ativos7: number };
  planos: Array<{ plano: string; n: number }>;
  receita: Array<{
    moeda: string;
    provedor: string;
    total: number;
    d30: number;
    pagamentos: number;
  }>;
  pagamentos: { pendentes: number; pagos30: number };
  creditos: { gastos30: number; estornados30: number; emCirculacao: number };
  conteudo: {
    personagens: number;
    videos: number;
    videosErro: number;
    posts: number;
    postsAgendados: number;
    armazenamentoBytes: number;
  };
  serie: Array<{ dia: string; usuarios: number; creditos: number }>;
  erros: Array<{
    id: string;
    tipo: string;
    email: string | null;
    erro: string | null;
    quando: string;
  }>;
}

export async function resumoAdmin(): Promise<ResumoAdmin> {
  const db = pool();
  const [
    usuarios,
    planos,
    receita,
    pagamentos,
    creditos,
    conteudo,
    serie,
    erros,
  ] = await Promise.all([
    db.query(
      `select count(*) as total,
              count(*) filter (where "createdAt" > now() - interval '7 days') as novos7,
              count(*) filter (where "createdAt" > now() - interval '30 days') as novos30,
              (select count(distinct "userId") from session where "updatedAt" > now() - interval '7 days') as ativos7
       from "user"`,
    ),
    db.query(
      `select case when plano <> 'gratis' and (plano_expira_em is null or plano_expira_em > now()) then plano else 'gratis' end as plano,
              count(*) as n
       from creditos_conta group by 1 order by 2 desc`,
    ),
    db.query(
      `select moeda, provedor, coalesce(sum(valor), 0) as total,
              coalesce(sum(valor) filter (where pago_em > now() - interval '30 days'), 0) as d30,
              count(*) as pagamentos
       from pagamentos where status = 'pago' group by 1, 2 order by 3 desc`,
    ),
    db.query(
      `select count(*) filter (where status = 'pendente' and created_at > now() - interval '24 hours') as pendentes,
              count(*) filter (where status = 'pago' and pago_em > now() - interval '30 days') as pagos30
       from pagamentos`,
    ),
    db.query(
      `select
         (select coalesce(-sum(delta), 0) from creditos_mov
           where delta < 0 and motivo <> all($1) and created_at > now() - interval '30 days') as gastos30,
         (select coalesce(sum(delta), 0) from creditos_mov
           where motivo like 'estorno%' and created_at > now() - interval '30 days') as estornados30,
         (select coalesce(sum(creditos_plano + creditos_avulsos), 0) from creditos_conta) as em_circulacao`,
      [MOTIVOS_ADMIN],
    ),
    db.query(
      `select
         (select count(*) from characters) as personagens,
         (select count(*) from video_jobs) as videos,
         (select count(*) from video_jobs where status = 'erro' or error is not null) as videos_erro,
         (select count(*) from posts_agendados) as posts,
         (select count(*) from posts_agendados where status = 'SCHEDULED') as posts_agendados,
         (select coalesce(sum(armazenamento_bytes), 0) from creditos_conta) as armazenamento`,
    ),
    db.query(
      `select to_char(d, 'YYYY-MM-DD') as dia,
              (select count(*) from "user" u where u."createdAt"::date = d::date) as usuarios,
              (select coalesce(-sum(delta), 0) from creditos_mov m
                where m.delta < 0 and m.motivo <> all($1) and m.created_at::date = d::date) as creditos
       from generate_series(current_date - 13, current_date, interval '1 day') d order by d`,
      [MOTIVOS_ADMIN],
    ),
    db.query(
      `select * from (
         select j.id, 'Vídeo · ' || coalesce(j.tipo, j.modelo, 'job') as tipo, u.email, j.error as erro, j.updated_at as quando
           from video_jobs j left join "user" u on u.id = j.user_id
          where j.error is not null or j.status = 'erro'
         union all
         select p.id, 'Post nas redes' as tipo, u.email, p.erros::text as erro, p.updated_at as quando
           from posts_agendados p left join "user" u on u.id = p.user_id where p.status = 'ERROR'
         union all
         select t.id, 'Treino de persona' as tipo, u.email, t.error as erro, t.updated_at as quando
           from personas_treino t left join "user" u on u.id = t.user_id where t.error is not null
       ) e order by quando desc limit 8`,
    ),
  ]);
  const u = usuarios.rows[0];
  const c = creditos.rows[0];
  const k = conteudo.rows[0];
  return {
    usuarios: {
      total: n(u.total),
      novos7: n(u.novos7),
      novos30: n(u.novos30),
      ativos7: n(u.ativos7),
    },
    planos: planos.rows.map((r) => ({ plano: r.plano, n: n(r.n) })),
    receita: receita.rows.map((r) => ({
      moeda: r.moeda,
      provedor: r.provedor,
      total: n(r.total),
      d30: n(r.d30),
      pagamentos: n(r.pagamentos),
    })),
    pagamentos: {
      pendentes: n(pagamentos.rows[0].pendentes),
      pagos30: n(pagamentos.rows[0].pagos30),
    },
    creditos: {
      gastos30: n(c.gastos30),
      estornados30: n(c.estornados30),
      emCirculacao: n(c.em_circulacao),
    },
    conteudo: {
      personagens: n(k.personagens),
      videos: n(k.videos),
      videosErro: n(k.videos_erro),
      posts: n(k.posts),
      postsAgendados: n(k.posts_agendados),
      armazenamentoBytes: n(k.armazenamento),
    },
    serie: serie.rows.map((r) => ({
      dia: r.dia,
      usuarios: n(r.usuarios),
      creditos: n(r.creditos),
    })),
    erros: erros.rows.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      email: r.email,
      erro: r.erro ? String(r.erro).slice(0, 300) : null,
      quando: new Date(r.quando).toISOString(),
    })),
  };
}

export interface UsuarioAdmin {
  id: string;
  nome: string | null;
  email: string;
  imagem: string | null;
  criadoEm: string;
  ultimoAcesso: string | null;
  plano: string;
  planoAtivo: boolean;
  planoExpiraEm: string | null;
  intervalo: string | null;
  assinaturaStripe: boolean;
  creditosPlano: number;
  creditosAvulsos: number;
  personagens: number;
  gastos30: number;
  pago: Array<{ moeda: string; total: number }>;
  armazenamentoBytes: number;
}

const SELECT_USUARIO = `
  select u.id, u.name, u.email, u.image, u."createdAt" as criado,
         (select max(s."updatedAt") from session s where s."userId" = u.id) as ultimo,
         coalesce(c.plano, 'gratis') as plano, c.plano_expira_em, c.intervalo,
         (c.stripe_subscription_id is not null) as assinatura,
         coalesce(c.creditos_plano, 0) as creditos_plano, coalesce(c.creditos_avulsos, 0) as creditos_avulsos,
         coalesce(c.armazenamento_bytes, 0) as armazenamento,
         (select count(*) from characters ch where ch.user_id = u.id) as personagens,
         (select coalesce(-sum(delta), 0) from creditos_mov m
           where m.user_id = u.id and m.delta < 0 and m.motivo <> all($1)
             and m.created_at > now() - interval '30 days') as gastos30,
         (select coalesce(json_agg(json_build_object('moeda', x.moeda, 'total', x.total)), '[]'::json)
            from (select moeda, sum(valor) as total from pagamentos p
                   where p.user_id = u.id and p.status = 'pago' group by moeda) x) as pago
    from "user" u left join creditos_conta c on c.user_id = u.id`;

function paraUsuario(r: Record<string, unknown>): UsuarioAdmin {
  const expira = r.plano_expira_em
    ? new Date(r.plano_expira_em as string)
    : null;
  const plano = String(r.plano);
  return {
    id: String(r.id),
    nome: (r.name as string) ?? null,
    email: String(r.email),
    imagem: (r.image as string) ?? null,
    criadoEm: new Date(r.criado as string).toISOString(),
    ultimoAcesso: r.ultimo ? new Date(r.ultimo as string).toISOString() : null,
    plano,
    planoAtivo: plano !== "gratis" && (!expira || expira > new Date()),
    planoExpiraEm: expira?.toISOString() ?? null,
    intervalo: (r.intervalo as string) ?? null,
    assinaturaStripe: !!r.assinatura,
    creditosPlano: n(r.creditos_plano),
    creditosAvulsos: n(r.creditos_avulsos),
    personagens: n(r.personagens),
    gastos30: n(r.gastos30),
    pago: ((r.pago as Array<{ moeda: string; total: number }>) ?? []).map(
      (p) => ({ moeda: p.moeda, total: n(p.total) }),
    ),
    armazenamentoBytes: n(r.armazenamento),
  };
}

export async function listarUsuarios(o: {
  q?: string;
  plano?: string;
}): Promise<UsuarioAdmin[]> {
  const filtros: string[] = [];
  const params: unknown[] = [MOTIVOS_ADMIN];
  if (o.q?.trim()) {
    params.push(`%${o.q.trim().toLowerCase()}%`);
    filtros.push(
      `(lower(u.email) like $${params.length} or lower(coalesce(u.name, '')) like $${params.length} or u.id like $${params.length})`,
    );
  }
  if (o.plano) {
    params.push(o.plano);
    filtros.push(`coalesce(c.plano, 'gratis') = $${params.length}`);
  }
  const { rows } = await pool().query(
    `${SELECT_USUARIO} ${filtros.length ? "where " + filtros.join(" and ") : ""} order by u."createdAt" desc limit 200`,
    params,
  );
  return rows.map(paraUsuario);
}

export interface MovimentoAdmin {
  id: string;
  delta: number;
  motivo: string;
  ref: string | null;
  quando: string;
}

export interface PagamentoAdmin {
  id: string;
  userId: string;
  email: string | null;
  nome: string | null;
  provedor: string;
  rede: string | null;
  tipo: string;
  plano: string | null;
  intervalo: string | null;
  pacote: string | null;
  creditos: number | null;
  valor: number;
  moeda: string;
  status: string;
  assinatura: string | null;
  pagador: string | null;
  criadoEm: string;
  pagoEm: string | null;
}

function paraPagamento(r: Record<string, unknown>): PagamentoAdmin {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    email: (r.email as string) ?? null,
    nome: (r.name as string) ?? null,
    provedor: String(r.provedor),
    rede: (r.rede as string) ?? (r.provedor === "usdc" ? "solana" : null),
    tipo: String(r.tipo),
    plano: (r.plano as string) ?? null,
    intervalo: (r.intervalo as string) ?? null,
    pacote: (r.pacote as string) ?? null,
    creditos:
      r.creditos === null || r.creditos === undefined ? null : n(r.creditos),
    valor: n(r.valor),
    moeda: String(r.moeda),
    status: String(r.status),
    assinatura: (r.assinatura as string) ?? null,
    pagador: (r.pagador as string) ?? null,
    criadoEm: new Date(r.created_at as string).toISOString(),
    pagoEm: r.pago_em ? new Date(r.pago_em as string).toISOString() : null,
  };
}

const SELECT_PAGAMENTO = `select p.*, u.email, u.name from pagamentos p left join "user" u on u.id = p.user_id`;

export async function listarPagamentos(o: {
  q?: string;
  status?: string;
  provedor?: string;
  userId?: string;
}): Promise<{
  itens: PagamentoAdmin[];
  totais: Array<{ status: string; n: number }>;
}> {
  const filtros: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    filtros.push(sql.replace("?", `$${params.length}`));
  };
  if (o.status) add("p.status = ?", o.status);
  if (o.provedor) add("p.provedor = ?", o.provedor);
  if (o.userId) add("p.user_id = ?", o.userId);
  if (o.q?.trim()) {
    params.push(`%${o.q.trim().toLowerCase()}%`);
    const i = `$${params.length}`;
    filtros.push(
      `(lower(u.email) like ${i} or lower(p.id) like ${i} or lower(coalesce(p.assinatura, '')) like ${i} or lower(coalesce(p.pagador, '')) like ${i})`,
    );
  }
  const [itens, totais] = await Promise.all([
    pool().query(
      `${SELECT_PAGAMENTO} ${filtros.length ? "where " + filtros.join(" and ") : ""} order by p.created_at desc limit 200`,
      params,
    ),
    pool().query("select status, count(*) as n from pagamentos group by 1"),
  ]);
  return {
    itens: itens.rows.map(paraPagamento),
    totais: totais.rows.map((r) => ({ status: r.status, n: n(r.n) })),
  };
}

export interface DetalheUsuario {
  usuario: UsuarioAdmin;
  movimentos: MovimentoAdmin[];
  pagamentos: PagamentoAdmin[];
  personagens: Array<{
    id: string;
    nome: string;
    atualizadoEm: string;
    imagens: number;
    videos: number;
  }>;
}

export async function detalheUsuario(
  id: string,
): Promise<DetalheUsuario | null> {
  const db = pool();
  const [u, mov, pag, per] = await Promise.all([
    db.query(`${SELECT_USUARIO} where u.id = $2`, [MOTIVOS_ADMIN, id]),
    db.query(
      "select id, delta, motivo, ref, created_at from creditos_mov where user_id = $1 order by created_at desc limit 40",
      [id],
    ),
    listarPagamentos({ userId: id }),
    db.query(
      `select id, coalesce(nullif(data->'identidade'->>'nome', ''), 'Sem nome') as nome, updated_at,
              jsonb_array_length(coalesce(data->'geradas', '[]'::jsonb)) as imagens,
              jsonb_array_length(coalesce(data->'videos', '[]'::jsonb)) as videos
       from characters where user_id = $1 order by updated_at desc limit 30`,
      [id],
    ),
  ]);
  if (!u.rows[0]) return null;
  return {
    usuario: paraUsuario(u.rows[0]),
    movimentos: mov.rows.map((r) => ({
      id: r.id,
      delta: n(r.delta),
      motivo: r.motivo,
      ref: r.ref,
      quando: new Date(r.created_at).toISOString(),
    })),
    pagamentos: pag.itens.slice(0, 20),
    personagens: per.rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      atualizadoEm: new Date(r.updated_at).toISOString(),
      imagens: n(r.imagens),
      videos: n(r.videos),
    })),
  };
}

export interface UsoAdmin {
  dias: number;
  total: number;
  porRecurso: Array<{
    motivo: string;
    modelo: string | null;
    usos: number;
    creditos: number;
    usuarios: number;
  }>;
  porUsuario: Array<{
    userId: string;
    email: string | null;
    creditos: number;
    usos: number;
  }>;
  entradas: Array<{ motivo: string; creditos: number; n: number }>;
}

/** Onde os créditos foram gastos (e de onde entraram) nos últimos `dias`. */
export async function usoAdmin(dias: number): Promise<UsoAdmin> {
  const db = pool();
  // `ref` é o modelo/recurso nas gerações; em posts, links e estornos é um id — agrupa só pelo motivo.
  const SEM_MODELO = ["post_redes", "video_link"];
  const [rec, usu, ent] = await Promise.all([
    db.query(
      `select motivo, case when motivo = any($3) then null else ref end as modelo,
              count(*) as usos, -sum(delta) as creditos, count(distinct user_id) as usuarios
       from creditos_mov
       where delta < 0 and motivo <> all($1) and created_at > now() - make_interval(days => $2)
       group by 1, 2 order by 4 desc limit 60`,
      [MOTIVOS_ADMIN, dias, SEM_MODELO],
    ),
    db.query(
      `select m.user_id, u.email, -sum(m.delta) as creditos, count(*) as usos
       from creditos_mov m left join "user" u on u.id = m.user_id
       where m.delta < 0 and m.motivo <> all($1) and m.created_at > now() - make_interval(days => $2)
       group by 1, 2 order by 3 desc limit 10`,
      [MOTIVOS_ADMIN, dias],
    ),
    db.query(
      `select motivo, sum(delta) as creditos, count(*) as n from creditos_mov
       where delta > 0 and created_at > now() - make_interval(days => $1)
       group by 1 order by 2 desc`,
      [dias],
    ),
  ]);
  const porRecurso = rec.rows.map((r) => ({
    motivo: r.motivo,
    modelo: r.modelo,
    usos: n(r.usos),
    creditos: n(r.creditos),
    usuarios: n(r.usuarios),
  }));
  return {
    dias,
    total: porRecurso.reduce((t, r) => t + r.creditos, 0),
    porRecurso,
    porUsuario: usu.rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      creditos: n(r.creditos),
      usos: n(r.usos),
    })),
    entradas: ent.rows.map((r) => ({
      motivo: r.motivo,
      creditos: n(r.creditos),
      n: n(r.n),
    })),
  };
}

export interface LucroAdmin {
  /** Período em dias (0 = desde o início). */
  dias: number;
  /** Reais por dólar usados para somar a receita em BRL (CAMBIO_USD_BRL). */
  cambio: number;
  totais: {
    receitaBRL: number;
    receitaUSD: number;
    /** Receita somada em dólar (BRL convertido pelo câmbio). */
    receitaTotalUSD: number;
    creditosGastos: number;
    custoUSD: number;
    lucroUSD: number;
    pagantes: number;
    /** Créditos ainda não gastos em todas as contas (custo futuro). */
    saldoCreditos: number;
  };
  assinantes: Array<{ plano: string; intervalo: string; n: number }>;
  porUsuario: Array<{
    userId: string;
    email: string;
    nome: string | null;
    plano: string;
    planoAtivo: boolean;
    receitaBRL: number;
    receitaUSD: number;
    receitaTotalUSD: number;
    creditosGastos: number;
    custoUSD: number;
    lucroUSD: number;
    saldoCreditos: number;
  }>;
}

/** Reais por dólar para somar receita em BRL e USD (padrão: a paridade da tabela de preços). */
export function cambioUsdBrl(): number {
  const v = Number(process.env.CAMBIO_USD_BRL);
  return v > 0 ? v : 5.3;
}

/** Créditos gastos, já descontados os estornos ($1 = MOTIVOS_ADMIN). */
const CREDITOS_LIQUIDOS = `case
  when delta < 0 and motivo <> all($1) then -delta
  when delta > 0 and motivo like 'estorno%' then -delta
  else 0 end`;
/**
 * Custo de provedor em dólar: 1 crédito = US$ 0,01, menos os estornos.
 * Exceção de lib/planos.ts: Nano Banana Pro cobra 10 créditos e custa ~US$ 0,15.
 */
const CUSTO_USD = `case
  when delta < 0 and motivo <> all($1) then
    case when motivo = 'imagem' and ref like '%nano-banana' and delta = -10 then 0.15 else -delta * 0.01 end
  when delta > 0 and motivo like 'estorno%' then -delta * 0.01
  else 0 end`;

/** Receita paga menos o custo estimado de IA, no total e por usuário, nos últimos `dias` (0 = tudo). */
export async function lucroAdmin(dias: number): Promise<LucroAdmin> {
  const db = pool();
  const cambio = cambioUsdBrl();
  const noPeriodo = (coluna: string) =>
    `($2::int = 0 or ${coluna} > now() - make_interval(days => $2::int))`;
  const [usu, tot, ass] = await Promise.all([
    db.query(
      `with g as (
         select user_id, sum(${CREDITOS_LIQUIDOS}) as creditos, sum(${CUSTO_USD}) as custo
           from creditos_mov where ${noPeriodo("created_at")} group by 1),
       r as (
         select user_id,
                coalesce(sum(valor) filter (where moeda = 'BRL'), 0) as brl,
                coalesce(sum(valor) filter (where moeda <> 'BRL'), 0) as usd
           from pagamentos where status = 'pago' and ${noPeriodo("pago_em")} group by 1)
       select u.id, u.email, u.name, coalesce(c.plano, 'gratis') as plano, c.plano_expira_em,
              coalesce(c.creditos_plano, 0) + coalesce(c.creditos_avulsos, 0) as saldo,
              coalesce(g.creditos, 0) as creditos, coalesce(g.custo, 0) as custo,
              coalesce(r.brl, 0) as brl, coalesce(r.usd, 0) as usd
         from "user" u
         left join creditos_conta c on c.user_id = u.id
         left join g on g.user_id = u.id
         left join r on r.user_id = u.id
        where coalesce(g.creditos, 0) <> 0 or coalesce(r.brl, 0) + coalesce(r.usd, 0) > 0
        order by coalesce(r.brl, 0) / $3::numeric + coalesce(r.usd, 0) - coalesce(g.custo, 0) asc
        limit 500`,
      [MOTIVOS_ADMIN, dias, cambio],
    ),
    db.query(
      `select
         (select coalesce(sum(${CREDITOS_LIQUIDOS}), 0) from creditos_mov where ${noPeriodo("created_at")}) as creditos,
         (select coalesce(sum(${CUSTO_USD}), 0) from creditos_mov where ${noPeriodo("created_at")}) as custo,
         (select coalesce(sum(valor) filter (where moeda = 'BRL'), 0) from pagamentos
           where status = 'pago' and ${noPeriodo("pago_em")}) as brl,
         (select coalesce(sum(valor) filter (where moeda <> 'BRL'), 0) from pagamentos
           where status = 'pago' and ${noPeriodo("pago_em")}) as usd,
         (select count(distinct user_id) from pagamentos
           where status = 'pago' and ${noPeriodo("pago_em")}) as pagantes,
         (select coalesce(sum(creditos_plano + creditos_avulsos), 0) from creditos_conta) as saldo`,
      [MOTIVOS_ADMIN, dias],
    ),
    db.query(
      `select plano, coalesce(intervalo, 'mensal') as intervalo, count(*) as n
         from creditos_conta
        where plano <> 'gratis' and (plano_expira_em is null or plano_expira_em > now())
        group by 1, 2`,
    ),
  ]);
  const emDolar = (brl: number, usd: number) => brl / cambio + usd;
  const t = tot.rows[0];
  const receitaTotalUSD = emDolar(n(t.brl), n(t.usd));
  return {
    dias,
    cambio,
    totais: {
      receitaBRL: n(t.brl),
      receitaUSD: n(t.usd),
      receitaTotalUSD,
      creditosGastos: n(t.creditos),
      custoUSD: n(t.custo),
      lucroUSD: receitaTotalUSD - n(t.custo),
      pagantes: n(t.pagantes),
      saldoCreditos: n(t.saldo),
    },
    assinantes: ass.rows.map((r) => ({
      plano: r.plano,
      intervalo: r.intervalo,
      n: n(r.n),
    })),
    porUsuario: usu.rows.map((r) => {
      const expira = r.plano_expira_em ? new Date(r.plano_expira_em) : null;
      const receita = emDolar(n(r.brl), n(r.usd));
      return {
        userId: r.id,
        email: r.email,
        nome: r.name ?? null,
        plano: r.plano,
        planoAtivo: r.plano !== "gratis" && (!expira || expira > new Date()),
        receitaBRL: n(r.brl),
        receitaUSD: n(r.usd),
        receitaTotalUSD: receita,
        creditosGastos: n(r.creditos),
        custoUSD: n(r.custo),
        lucroUSD: receita - n(r.custo),
        saldoCreditos: n(r.saldo),
      };
    }),
  };
}
