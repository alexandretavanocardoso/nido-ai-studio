import type Stripe from "stripe";
import { pontosPorIndicacao } from "@/lib/pontos-server";
import { customAlphabet, nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import type { RedeUsdc } from "@/lib/pagamentos/redes-usdc";
import {
  carteiraValida,
  prepararEnvioUsdc,
  redesDeSaqueUsdc,
} from "./onchain";
import { cambioUsdBrl } from "@/lib/moeda";
import {
  carenciaDoPagamento,
  COMISSAO,
  comissaoEmCentavos,
  MESES_COMISSAO,
  JANELA_VINCULO_DIAS,
  moedaDaComissao,
  normalizarCodigo,
  problemaDoCodigo,
  SAQUE_MINIMO,
  saldoDaMoeda,
  type MoedaComissao,
  type SaldoComissao,
} from "./regras";

/** O saldo da comissão em SQL (o mesmo que saldoDaMoeda): USD e USDC somam juntos. */
const SALDO_SQL = "(case when moeda = 'BRL' then 'BRL' else 'USD' end)";

/** Código inicial de quem ainda não escolheu o seu: 8 caracteres sem ambiguidade. */
const codigoAleatorio = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 8);

function pool() {
  const p = getPool();
  if (!p) throw new Error("Banco não configurado.");
  return p;
}

export interface ContaIndicacao {
  codigo: string;
  personalizado: boolean;
  stripeAccountId: string | null;
}

/** Conta de indicação do usuário; cria com um código aleatório na primeira vez. */
export async function contaDeIndicacao(userId: string): Promise<ContaIndicacao> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { rows } = await pool().query<{
      codigo: string;
      personalizado: boolean;
      stripe_account_id: string | null;
    }>(
      `insert into indicacao_contas (user_id, codigo) values ($1, $2)
       on conflict (user_id) do update set updated_at = indicacao_contas.updated_at
       returning codigo, personalizado, stripe_account_id`,
      [userId, codigoAleatorio()],
    ).catch((e: { code?: string }) => {
      if (e.code === "23505") return { rows: [] }; // código sorteado já existe: sorteia outro
      throw e;
    });
    if (rows[0])
      return {
        codigo: rows[0].codigo,
        personalizado: rows[0].personalizado,
        stripeAccountId: rows[0].stripe_account_id,
      };
  }
  throw new Error("Não foi possível criar o código de indicação.");
}

/**
 * Troca o código pelo que o usuário escolheu. Só uma vez: depois de
 * personalizado, não muda mais. Devolve o erro em texto, ou null se trocou.
 */
export async function escolherCodigo(
  userId: string,
  bruto: string,
): Promise<string | null> {
  const problema = problemaDoCodigo(bruto);
  if (problema) return problema;
  const codigo = normalizarCodigo(bruto);
  const conta = await contaDeIndicacao(userId);
  if (conta.personalizado) return "Você já escolheu o seu código.";
  try {
    const { rowCount } = await pool().query(
      `update indicacao_contas set codigo = $2, personalizado = true, updated_at = now()
       where user_id = $1 and personalizado = false`,
      [userId, codigo],
    );
    return rowCount ? null : "Você já escolheu o seu código.";
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return "Este código já está em uso. Tente outro.";
    throw e;
  }
}

/**
 * Liga o usuário (recém-cadastrado) a quem o indicou. Não vincula: o próprio
 * dono do código, quem já foi indicado, conta antiga, quem já pagou algo, nem
 * quem entrou pelo mesmo endereço de rede (IP) que o dono do código — é o jeito
 * mais comum de indicar a si mesmo com uma segunda conta. (Também barra duas
 * pessoas na mesma casa ou escritório; é o preço de não pagar comissão falsa.)
 */
export async function vincularIndicacao(
  userId: string,
  bruto: string,
): Promise<boolean> {
  const codigo = normalizarCodigo(bruto);
  if (problemaDoCodigo(codigo)) return false;
  const { rowCount } = await pool().query(
    `insert into indicacoes (indicado_user_id, indicador_user_id, codigo)
     select u."id", c.user_id, c.codigo
     from "user" u
     join indicacao_contas c on c.codigo = $2 and c.user_id <> u."id"
     where u."id" = $1
       and u."createdAt" > now() - make_interval(days => $3)
       and not exists (select 1 from pagamentos p where p.user_id = u."id" and p.status = 'pago')
       -- Mesma rede (IP) que o dono do código: quase sempre é a própria pessoa com outra conta.
       and not exists (
         select 1 from "session" a join "session" b on b."ipAddress" = a."ipAddress"
         where a."userId" = u."id" and b."userId" = c.user_id and coalesce(a."ipAddress", '') <> '')
     on conflict (indicado_user_id) do nothing`,
    [userId, codigo, JANELA_VINCULO_DIAS],
  );
  return !!rowCount;
}

/**
 * Gera a comissão de um pagamento de plano já pago, se o pagador foi indicado
 * por alguém. Vale para cada pagamento de plano do indicado (primeira
 * assinatura e renovações) por MESES_COMISSAO meses a partir da primeira
 * comissão; depois disso o indicado não gera mais. Repetir a chamada
 * (webhook reenviado) não duplica. Nunca lança: um erro aqui não pode
 * atrapalhar a ativação do plano.
 */
export async function registrarComissao(pagamentoId: string): Promise<void> {
  try {
    const { rows } = await pool().query<{
      user_id: string;
      indicador_user_id: string;
      plano: string | null;
      valor: string;
      moeda: string;
      provedor: string;
      rede: string | null;
    }>(
      `select p.user_id, i.indicador_user_id, p.plano, p.valor, p.moeda, p.provedor, p.rede
       from pagamentos p
       join indicacoes i on i.indicado_user_id = p.user_id
       where p.id = $1 and p.status = 'pago' and p.tipo = 'plano'
         -- Janela de comissão: acaba N meses depois da primeira comissão deste indicado.
         and not exists (
           select 1 from indicacao_comissoes m
           where m.indicado_user_id = p.user_id
             and m.created_at <= now() - make_interval(months => $2))`,
      [pagamentoId, MESES_COMISSAO],
    );
    const p = rows[0];
    if (!p) return;
    // Pontos de quem indicou: uma vez por indicado, na primeira assinatura.
    await pontosPorIndicacao(p.indicador_user_id, p.user_id);
    const centavos = comissaoEmCentavos(Number(p.valor));
    if (!centavos) return;
    await pool().query(
      `insert into indicacao_comissoes
         (id, indicador_user_id, indicado_user_id, pagamento_id, plano, valor_base, moeda, valor, disponivel_em, rede)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9), $10)
       on conflict do nothing`,
      [
        `com_${nanoid(14)}`,
        p.indicador_user_id,
        p.user_id,
        pagamentoId,
        p.plano,
        p.valor,
        moedaDaComissao(p.moeda, p.provedor),
        (centavos / 100).toFixed(2),
        carenciaDoPagamento(p.provedor),
        // USDC sai pela rede em que entrou (nulo = solana, pagamentos antigos).
        p.provedor === "usdc" ? (p.rede ?? "solana") : null,
      ],
    );
  } catch (e) {
    console.error("[indicacao] comissão do pagamento", pagamentoId, e);
  }
}

/**
 * Desfaz a comissão de um pagamento estornado ou contestado. Se ela ainda não
 * foi sacada, some do saldo ("estornada"). Se já foi sacada, vira uma dívida
 * ("estorno_devido") descontada do próximo saque. Devolve se desfez alguma.
 */
export async function estornarComissao(pagamentoId: string): Promise<boolean> {
  const { rowCount } = await pool().query(
    `update indicacao_comissoes
     set status = case when status = 'sacada' then 'estorno_devido' else 'estornada' end
     where pagamento_id = $1 and status in ('disponivel', 'sacada')`,
    [pagamentoId],
  );
  return !!rowCount;
}

/**
 * Estorno parcial do pagamento: a comissão ainda não sacada passa a ser
 * `fracao` (0–1) do valor original. Depois de sacada não muda (o valor
 * devolvido ao cliente foi parcial e a compra continua valendo).
 */
export async function ajustarComissaoParcial(
  pagamentoId: string,
  fracao: number,
): Promise<void> {
  if (!(fracao >= 0 && fracao < 1)) return;
  await pool().query(
    `update indicacao_comissoes
     set valor = floor(valor_base * $2 * $3 * 100) / 100
     where pagamento_id = $1 and status = 'disponivel'`,
    [pagamentoId, COMISSAO, fracao],
  );
}

export interface SaldoIndicacao {
  /** USD = comissões de cartão e de USDC juntas; sai pelo Stripe ou em USDC. BRL só pelo Stripe. */
  moeda: SaldoComissao;
  /** Já pode sacar (descontadas as comissões estornadas depois de sacadas). */
  disponivel: number;
  /** Parte do disponível que pode sair em USDC: só comissões de quem pagou em USDC. */
  porUsdc: number;
  /** Ainda na carência. */
  pendente: number;
  /** Já transferido (para a conta Stripe ou para a carteira, no caso do USDC). */
  sacado: number;
  minimo: number;
}

export interface ResumoIndicacao {
  codigo: string;
  personalizado: boolean;
  indicados: Array<{
    nome: string;
    desde: string;
    assinou: boolean;
    /** Todos os pagamentos deste indicado foram estornados: não sobrou comissão. */
    estornada: boolean;
    plano: string | null;
    /** Soma das comissões deste indicado (sem as estornadas). */
    comissao: number | null;
    moeda: MoedaComissao | null;
  }>;
  saldos: SaldoIndicacao[];
  saques: Array<{
    id: string;
    moeda: MoedaComissao;
    valor: number;
    status: string;
    quando: string;
    /** Saque on-chain: rede e hash da transação. */
    rede: string | null;
    txHash: string | null;
    /** Saque em dólar pago pelo Stripe: quanto saiu em reais. */
    pago: { valor: number; moeda: string } | null;
  }>;
  /** Saque em USDC on-chain: redes ligadas neste deploy e o teto automático. */
  usdc: { redes: RedeUsdc[]; teto: number };
  stripe: {
    /** Pagamentos por Stripe configurados neste deploy. */
    configurado: boolean;
    /** O usuário já começou o cadastro da conta de recebimento. */
    conectado: boolean;
    /** Cadastro completo: já pode receber transferências. */
    pronto: boolean;
  };
}

/** Tudo que a tela de indicações mostra. */
export async function resumoDaIndicacao(
  userId: string,
  stripe: Stripe | null,
): Promise<ResumoIndicacao> {
  const conta = await contaDeIndicacao(userId);
  const db = pool();
  const [indicados, saldos, saques] = await Promise.all([
    db.query<{
      nome: string;
      desde: Date;
      plano: string | null;
      valor: string | null;
      moeda: MoedaComissao | null;
      pagamentos: number;
      estornadas: number;
    }>(
      // Um indicado pode ter várias comissões (uma por pagamento): soma por pessoa.
      `select u."name" as nome, i.created_at as desde, c.plano, c.valor, c.moeda, c.pagamentos, c.estornadas
       from indicacoes i
       join "user" u on u."id" = i.indicado_user_id
       left join lateral (
         select count(*)::int as pagamentos,
                count(*) filter (where m.status like 'estorn%')::int as estornadas,
                sum(m.valor) filter (where m.status not like 'estorn%') as valor,
                max(m.moeda) as moeda,
                (array_agg(m.plano order by m.created_at desc))[1] as plano
         from indicacao_comissoes m where m.indicado_user_id = i.indicado_user_id) c on true
       where i.indicador_user_id = $1
       order by i.created_at desc limit 200`,
      [userId],
    ),
    db.query<{
      moeda: SaldoComissao;
      disponivel: string;
      por_usdc: string;
      pendente: string;
      sacado: string;
    }>(
      `select ${SALDO_SQL} as moeda,
         coalesce(sum(valor) filter (where status = 'disponivel' and disponivel_em <= now()), 0)
           - coalesce(sum(valor) filter (where status = 'estorno_devido'), 0) as disponivel,
         coalesce(sum(valor) filter (where moeda = 'USDC' and status = 'disponivel' and disponivel_em <= now()), 0)
           - coalesce(sum(valor) filter (where moeda = 'USDC' and status = 'estorno_devido'), 0) as por_usdc,
         coalesce(sum(valor) filter (where status = 'disponivel' and disponivel_em > now()), 0) as pendente,
         coalesce(sum(valor) filter (where status in ('sacada', 'estorno_devido', 'estorno_quitado')), 0) as sacado
       from indicacao_comissoes where indicador_user_id = $1 group by 1 order by 1 desc`,
      [userId],
    ),
    db.query<{
      id: string;
      moeda: MoedaComissao;
      valor: string;
      status: string;
      created_at: Date;
      rede: string | null;
      tx_hash: string | null;
      valor_pago: string | null;
      moeda_paga: string | null;
    }>(
      `select id, moeda, valor, status, created_at, rede, tx_hash, valor_pago, moeda_paga
       from indicacao_saques where user_id = $1 order by created_at desc limit 20`,
      [userId],
    ),
  ]);

  let pronto = false;
  if (stripe && conta.stripeAccountId) {
    try {
      const a = await stripe.accounts.retrieve(conta.stripeAccountId);
      pronto = !!a.details_submitted && !!a.payouts_enabled;
    } catch (e) {
      console.error("[indicacao] conta Stripe:", e);
    }
  }

  return {
    codigo: conta.codigo,
    personalizado: conta.personalizado,
    indicados: indicados.rows.map((r) => ({
      // Só o primeiro nome: quem indica não precisa ver o nome completo de ninguém.
      nome: r.nome.trim().split(/\s+/)[0] || "—",
      desde: r.desde.toISOString(),
      assinou: r.pagamentos > 0,
      estornada: r.pagamentos > 0 && r.estornadas === r.pagamentos,
      plano: r.plano,
      comissao: r.pagamentos > 0 ? Number(r.valor ?? 0) : null,
      moeda: r.moeda,
    })),
    saldos: saldos.rows.map((s) => ({
      moeda: s.moeda,
      disponivel: Number(s.disponivel),
      porUsdc: Number(s.por_usdc),
      pendente: Number(s.pendente),
      sacado: Number(s.sacado),
      minimo: SAQUE_MINIMO[s.moeda],
    })),
    saques: saques.rows.map((s) => ({
      id: s.id,
      moeda: s.moeda,
      valor: Number(s.valor),
      status: s.status,
      quando: s.created_at.toISOString(),
      rede: s.rede,
      txHash: s.tx_hash,
      pago:
        s.valor_pago != null && s.moeda_paga && s.moeda_paga !== s.moeda
          ? { valor: Number(s.valor_pago), moeda: s.moeda_paga }
          : null,
    })),
    usdc: { redes: redesDeSaqueUsdc(), teto: tetoDoSaque() },
    stripe: {
      configurado: !!stripe,
      conectado: !!conta.stripeAccountId,
      pronto,
    },
  };
}

/** Conta Connect (Express) do usuário para receber os saques; cria na primeira vez. */
export async function contaStripeDeSaque(
  stripe: Stripe,
  userId: string,
  email: string | null,
): Promise<string> {
  const conta = await contaDeIndicacao(userId);
  if (conta.stripeAccountId) return conta.stripeAccountId;
  const nova = await stripe.accounts.create(
    {
      type: "express",
      ...(email ? { email } : {}),
      capabilities: { transfers: { requested: true } },
      metadata: { userId },
    },
    // Dois cliques seguidos não criam duas contas: a chave vale por um minuto.
    // Fixa por usuário, o Stripe repetia por 24h a resposta da 1ª tentativa,
    // inclusive um erro já resolvido (Connect ainda não ativado, 16/10/2026).
    {
      idempotencyKey: `indicacao-conta-${userId}-${Math.floor(Date.now() / 60_000)}`,
    },
  );
  const { rows } = await pool().query<{ stripe_account_id: string }>(
    `update indicacao_contas set stripe_account_id = coalesce(stripe_account_id, $2), updated_at = now()
     where user_id = $1 returning stripe_account_id`,
    [userId, nova.id],
  );
  return rows[0].stripe_account_id;
}

/** Maior saque automático, em dólar, pelos dois caminhos; acima disso, só pelo suporte (padrão 200). */
export function tetoDoSaque(): number {
  const n = Number(process.env.SAQUE_TETO ?? process.env.USDC_SAQUE_TETO);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

/** Soma máxima de saques em 24 horas, de todos os usuários e pelos dois caminhos, em dólar (padrão 1000). */
export function tetoDiarioDeSaques(): number {
  const n = Number(process.env.SAQUE_TETO_DIA ?? process.env.USDC_SAQUE_TETO_DIA);
  return Number.isFinite(n) && n > 0 ? n : 1000;
}

/** Como o saque sai: pelo Stripe (o saldo de uma moeda) ou em USDC, numa rede, para uma carteira. */
type Via =
  | { tipo: "stripe"; saldo: SaldoComissao }
  | { tipo: "usdc"; rede: RedeUsdc; carteira: string };

/**
 * Quais comissões cada caminho leva (SQL). Pelo Stripe sai o saldo inteiro da
 * moeda — em dólar, cartão e USDC juntos. Em USDC só saem as comissões de
 * quem pagou em USDC: pagamento no cartão pode ser contestado meses depois, e
 * um envio on-chain não volta (seria o jeito de transformar cartão roubado em
 * cripto). Pelo Stripe, quem recebe tem cadastro verificado.
 */
function comissoesDoCaminho(via: Via): string {
  if (via.tipo === "usdc") return "moeda = 'USDC'";
  return via.saldo === "BRL" ? "moeda = 'BRL'" : "moeda in ('USD', 'USDC')";
}

/** PTAX do Banco Central (compra) do último dia útil da semana; null se não respondeu. */
async function ptaxDoBancoCentral(): Promise<number | null> {
  const data = (d: Date) =>
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 7 * 86_400_000);
  const url =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
    "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
    `?@dataInicial='${data(inicio)}'&@dataFinalCotacao='${data(fim)}'` +
    "&$format=json&$orderby=dataHoraCotacao%20desc&$top=1";
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return null;
  const b = (await r.json()) as { value?: Array<{ cotacaoCompra?: number }> };
  const v = Number(b.value?.[0]?.cotacaoCompra);
  return v > 0 ? v : null;
}

/**
 * Reais por dólar agora. Primeiro a cotação do Stripe (API de câmbio, ainda em
 * prévia: a versão vai no pedido e pode ser trocada por STRIPE_FX_VERSAO), pela
 * taxa base, sem a margem dele. Se o Stripe não responder, a PTAX do Banco
 * Central. Cotação a mais de 30% do CAMBIO_USD_BRL é descartada: nenhum saque
 * é pago com um câmbio absurdo. Sem nenhuma cotação, devolve null.
 */
async function cambioDoDia(stripe: Stripe): Promise<number | null> {
  const plausivel = (v: number) =>
    v > 0 && Math.abs(v / cambioUsdBrl() - 1) < 0.3;
  try {
    const r = (await stripe.rawRequest(
      "POST",
      "/v1/fx_quotes",
      { to_currency: "brl", "from_currencies[0]": "usd", lock_duration: "none" },
      { apiVersion: process.env.STRIPE_FX_VERSAO?.trim() || "2026-09-30.preview" },
    )) as { rates?: Record<string, { rate_details?: { base_rate?: number } }> };
    const v = Number(r.rates?.usd?.rate_details?.base_rate);
    if (plausivel(v)) return v;
    console.error("[indicacao] cotação do Stripe fora da faixa:", v);
  } catch (e) {
    console.error("[indicacao] cotação do Stripe:", e);
  }
  try {
    const v = await ptaxDoBancoCentral();
    if (v && plausivel(v)) return v;
    console.error("[indicacao] PTAX fora da faixa ou vazia:", v);
  } catch (e) {
    console.error("[indicacao] PTAX do Banco Central:", e);
  }
  return null;
}

/**
 * Reserva as comissões disponíveis do caminho para um saque novo e calcula o
 * valor a pagar (já descontado o que foi estornado depois de sacado). Abaixo
 * do mínimo, ou acima dos tetos (por saque e do dia, somando todos os
 * usuários e os dois caminhos), desfaz a reserva e devolve o erro.
 */
async function abrirSaque(
  userId: string,
  via: Via,
): Promise<
  | { erro: string }
  | {
      saqueId: string;
      total: number;
      devolver: () => Promise<unknown>;
      falhar: (motivo: string, paraUsuario: string) => Promise<{ erro: string }>;
    }
> {
  const db = pool();
  const saqueId = `saq_${nanoid(14)}`;
  const moeda: MoedaComissao = via.tipo === "usdc" ? "USDC" : via.saldo;
  const filtro = comissoesDoCaminho(via);
  const devolver = () => devolverComissoes(saqueId);
  const falhar = async (motivo: string, paraUsuario: string) => {
    await devolver();
    await db.query(
      "update indicacao_saques set status = 'falhou', erro = $2 where id = $1",
      [saqueId, motivo.slice(0, 500)],
    );
    return { erro: paraUsuario };
  };

  await db.query(
    "insert into indicacao_saques (id, user_id, moeda, valor, rede, carteira) values ($1, $2, $3, 0.01, $4, $5)",
    [
      saqueId,
      userId,
      moeda,
      via.tipo === "usdc" ? via.rede : null,
      via.tipo === "usdc" ? via.carteira : null,
    ],
  );
  const { rows } = await db.query<{ total: string | null }>(
    `with reservadas as (
       update indicacao_comissoes set status = 'sacada', saque_id = $2
       where indicador_user_id = $1 and ${filtro}
         and status = 'disponivel' and disponivel_em <= now()
       returning valor)
     select sum(valor) as total from reservadas`,
    [userId, saqueId],
  );
  // Comissões já sacadas e depois estornadas: descontam deste saque. Ficam
  // presas a ele na mesma instrução (dois saques não descontam a mesma dívida)
  // e voltam a ser dívida se o saque não sair (devolverComissoes).
  const { rows: cobradas } = await db.query<{ devido: string }>(
    `with cobradas as (
       update indicacao_comissoes set status = 'estorno_quitado', cobrada_no_saque = $2
       where indicador_user_id = $1 and ${filtro} and status = 'estorno_devido'
       returning valor)
     select coalesce(sum(valor), 0) as devido from cobradas`,
    [userId, saqueId],
  );
  const devido = Number(cobradas[0]?.devido ?? 0);
  const total =
    Math.round((Number(rows[0]?.total ?? 0) - devido) * 100) / 100;
  if (total < SAQUE_MINIMO[moeda]) {
    await devolver();
    await db.query("delete from indicacao_saques where id = $1", [saqueId]);
    return {
      erro:
        total > 0
          ? `O saque mínimo é de ${SAQUE_MINIMO[moeda]} ${moeda}.`
          : "Não há saldo disponível para sacar.",
    };
  }
  // Tetos: limitam o estrago se alguém achar um jeito de gerar comissão
  // indevida. Em dólar (reais convertidos pelo CAMBIO_USD_BRL).
  const dolares = moeda === "BRL" ? total / cambioUsdBrl() : total;
  if (dolares > tetoDoSaque())
    return falhar(
      `Acima do teto automático (US$ ${tetoDoSaque()}).`,
      "Este valor passa do limite do saque automático. Fale com o suporte para receber.",
    );

  // Teto do dia (todos os usuários, o que saiu e o que está saindo em 24h).
  // Uma trava no banco faz um saque de cada vez passar por aqui: o valor deste
  // saque é gravado ainda com a trava, então o próximo já o vê na soma — dois
  // pedidos ao mesmo tempo não passam juntos do limite.
  let soma = 0;
  let cabe = false;
  const cliente = await db.connect();
  try {
    await cliente.query("begin");
    await cliente.query("select pg_advisory_xact_lock(hashtext('indicacao_teto_diario'))");
    const { rows: dia } = await cliente.query<{ soma: string }>(
      `select coalesce(sum(case when moeda = 'BRL' then valor / $2 else valor end), 0) as soma
       from indicacao_saques
       where id <> $1 and status in ('pago', 'processando')
         and created_at > now() - interval '24 hours'`,
      [saqueId, cambioUsdBrl()],
    );
    soma = Number(dia[0].soma);
    cabe = soma + dolares <= tetoDiarioDeSaques();
    if (cabe)
      await cliente.query("update indicacao_saques set valor = $2 where id = $1", [
        saqueId,
        total.toFixed(2),
      ]);
    await cliente.query("commit");
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    console.error("[indicacao] teto diário", saqueId, e);
    return falhar(
      `Falha ao conferir o teto diário: ${(e as Error).message}`,
      "O saque está indisponível no momento. O saldo continua disponível; tente de novo mais tarde.",
    );
  } finally {
    cliente.release();
  }
  if (!cabe) {
    console.error(
      `[indicacao] ALERTA: teto diário de saques atingido (US$ ${soma.toFixed(2)} + ${dolares.toFixed(2)} > ${tetoDiarioDeSaques()}). Saque ${saqueId} recusado.`,
    );
    return falhar(
      `Teto diário de saques atingido (US$ ${tetoDiarioDeSaques()}).`,
      "O limite diário de saques foi atingido. O saldo continua disponível; tente de novo amanhã.",
    );
  }
  return { saqueId, total, devolver, falhar };
}

/**
 * Saque que não saiu: as comissões reservadas voltam ao saldo. As que foram
 * estornadas enquanto o saque andava (viraram "estorno_devido") nunca foram
 * pagas: ficam só estornadas — não voltam ao saldo nem viram dívida. As
 * dívidas que este saque ia descontar voltam a ser dívida.
 */
export async function devolverComissoes(saqueId: string): Promise<void> {
  const db = pool();
  await db.query(
    "update indicacao_comissoes set status = 'disponivel', saque_id = null where saque_id = $1 and status = 'sacada'",
    [saqueId],
  );
  await db.query(
    "update indicacao_comissoes set status = 'estornada', saque_id = null where saque_id = $1 and status = 'estorno_devido'",
    [saqueId],
  );
  await db.query(
    "update indicacao_comissoes set status = 'estorno_devido', cobrada_no_saque = null where cobrada_no_saque = $1 and status = 'estorno_quitado'",
    [saqueId],
  );
}

/**
 * Comissão que já tinha saído pelo Stripe e depois foi estornada (contestação
 * do cartão): tenta trazer o valor de volta da conta Connect do indicador,
 * revertendo parte da transferência, enquanto o dinheiro ainda está lá.
 * Conseguiu → a dívida some. Não conseguiu (já foi para o banco dele) →
 * continua como dívida, descontada dos próximos saques. Nunca lança.
 */
export async function recuperarComissaoSacada(
  stripe: Stripe,
  pagamentoId: string,
): Promise<void> {
  try {
    const { rows } = await pool().query<{
      id: string;
      valor: string;
      transferencia: string;
      cambio: string | null;
    }>(
      `select c.id, c.valor, s.stripe_transfer_id as transferencia, s.cambio
       from indicacao_comissoes c
       join indicacao_saques s on s.id = c.saque_id
       where c.pagamento_id = $1 and c.status = 'estorno_devido'
         and s.status = 'pago' and s.stripe_transfer_id is not null`,
      [pagamentoId],
    );
    for (const c of rows) {
      // Na moeda da transferência (reais), pelo mesmo câmbio do saque.
      const centavos = c.cambio
        ? Math.floor(Number(c.valor) * Number(c.cambio) * 100)
        : Math.round(Number(c.valor) * 100);
      try {
        await stripe.transfers.createReversal(
          c.transferencia,
          { amount: centavos, metadata: { comissaoId: c.id, pagamentoId } },
          { idempotencyKey: `reversao-${c.id}` },
        );
        await pool().query(
          "update indicacao_comissoes set status = 'estorno_quitado' where id = $1 and status = 'estorno_devido'",
          [c.id],
        );
      } catch (e) {
        console.error("[indicacao] reverter comissão sacada", c.id, e);
      }
    }
  } catch (e) {
    console.error("[indicacao] recuperar comissão", pagamentoId, e);
  }
}

/**
 * Saca pelo Stripe todo o saldo disponível em dólar (comissões de cartão e de
 * USDC) ou em reais: reserva as comissões e transfere para a conta Connect do
 * usuário. A conta do Stripe da NIDO só tem saldo em reais, então o saldo em
 * dólar sai em reais, pela cotação do dia (arredondado para baixo).
 *
 * Só devolve o saldo quando há certeza de que a transferência não saiu.
 */
export async function sacarComissoes(
  stripe: Stripe,
  userId: string,
  saldo: SaldoComissao,
): Promise<
  { valor: number; pago: { valor: number; moeda: "BRL"; cambio: number | null } } | { erro: string }
> {
  const conta = await contaDeIndicacao(userId);
  if (!conta.stripeAccountId)
    return { erro: "Conecte sua conta do Stripe antes de sacar." };
  const destino = await stripe.accounts.retrieve(conta.stripeAccountId);
  if (!destino.details_submitted || !destino.payouts_enabled)
    return { erro: "Termine o cadastro da sua conta no Stripe para sacar." };

  // Cotação antes de reservar: sem ela, nada é mexido.
  const cambio = saldo === "USD" ? await cambioDoDia(stripe) : null;
  if (saldo === "USD" && !cambio)
    return {
      erro: "Não consegui a cotação do dólar agora. O saldo continua disponível; tente de novo em instantes.",
    };

  const saque = await abrirSaque(userId, { tipo: "stripe", saldo });
  if ("erro" in saque) return saque;
  const { saqueId, total } = saque;
  const centavos = cambio
    ? Math.floor(total * cambio * 100)
    : Math.round(total * 100);
  const db = pool();
  let transferencia: Stripe.Transfer;
  try {
    transferencia = await stripe.transfers.create(
      {
        amount: centavos,
        currency: "brl",
        destination: conta.stripeAccountId,
        description: "NIDO AI Studio · comissão de indicações",
        // O admin acha a transferência por aqui se o saque ficar pela metade.
        transfer_group: saqueId,
        metadata: {
          userId,
          saqueId,
          ...(cambio ? { valorUsd: total.toFixed(2), cambio: String(cambio) } : {}),
        },
      },
      { idempotencyKey: saqueId },
    );
  } catch (e) {
    const msg = ((e as Error).message ?? "Falha na transferência.").slice(0, 500);
    console.error("[indicacao] saque", saqueId, e);
    // Um erro de rede pode esconder uma transferência que saiu: confere pelo
    // grupo do saque antes de devolver o saldo. Sem como conferir, o saque fica
    // "processando" e o admin resolve (Conferir) — nunca devolve no escuro.
    const saiu = await stripe.transfers
      .list({ transfer_group: saqueId, limit: 1 })
      .then((r) => r.data[0] ?? null)
      .catch(() => undefined);
    if (saiu === undefined) {
      await db
        .query("update indicacao_saques set erro = $2 where id = $1", [saqueId, msg])
        .catch(() => {});
      return {
        erro: "Não consegui confirmar a transferência no Stripe. O saque ficou em análise e o saldo não se perde.",
      };
    }
    if (!saiu)
      return saque.falhar(
        msg,
        "O Stripe não concluiu a transferência. O saldo continua disponível; tente de novo mais tarde.",
      );
    transferencia = saiu;
  }
  // O dinheiro já saiu: uma falha daqui em diante não devolve o saldo (o saque
  // fica "processando" e o Conferir do admin acha a transferência pelo grupo).
  try {
    await db.query(
      `update indicacao_saques set status = 'pago', stripe_transfer_id = $2,
         valor_pago = $3, moeda_paga = 'BRL', cambio = $4 where id = $1`,
      [saqueId, transferencia.id, (transferencia.amount / 100).toFixed(2), cambio],
    );
  } catch (e) {
    console.error("[indicacao] saque pago mas não registrado", saqueId, transferencia.id, e);
  }
  return {
    valor: total,
    pago: { valor: transferencia.amount / 100, moeda: "BRL", cambio },
  };
}

/**
 * Saca on-chain, em USDC, as comissões disponíveis de quem pagou em USDC (de
 * qualquer rede), na rede que o usuário escolheu: da carteira de saques da
 * NIDO nessa rede para a carteira do usuário. Comissão de cartão não sai
 * por aqui (ver comissoesDoCaminho).
 *
 * O hash da transação é guardado antes do envio. Se a rede confirmar, o saque
 * fica pago; se reverter (ou for recusado antes de assinar), o saldo volta;
 * se o resultado ficar incerto, o saque fica "processando" até ser conferido
 * (o admin confere pelo hash) — nunca se devolve saldo de algo que pode ter saído.
 */
export async function sacarUsdc(
  userId: string,
  rede: RedeUsdc,
  carteiraBruta: string,
): Promise<{ valor: number; hash: string; pendente?: boolean } | { erro: string }> {
  const carteira = carteiraBruta.trim();
  if (!redesDeSaqueUsdc().includes(rede))
    return { erro: "O saque em USDC não está disponível nesta rede." };
  if (!carteiraValida(rede, carteira))
    return { erro: "Endereço de carteira inválido para esta rede." };

  const saque = await abrirSaque(userId, { tipo: "usdc", rede, carteira });
  if ("erro" in saque) return saque;
  const { saqueId, total, falhar } = saque;
  const db = pool();

  let envio;
  try {
    envio = await prepararEnvioUsdc(rede, carteira, total);
  } catch (e) {
    console.error("[indicacao] preparar saque USDC", saqueId, e);
    envio = { ok: false as const, erro: (e as Error).message };
  }
  if (!envio.ok)
    return falhar(
      envio.erro,
      "O saque em USDC está indisponível no momento. O saldo continua disponível; tente de novo mais tarde.",
    );

  // Daqui em diante a transação existe (assinada): guarda o hash (e, nas
  // redes EVM, a vez da carteira) antes de transmitir.
  await db.query(
    "update indicacao_saques set tx_hash = $2, tx_nonce = $3 where id = $1",
    [saqueId, envio.hash, envio.nonce ?? null],
  );
  const resultado = await envio.enviar();
  if (resultado === "revertido")
    return falhar(
      "A transação reverteu na rede.",
      "A rede recusou a transferência. O saldo continua disponível; tente de novo mais tarde.",
    );
  if (resultado === "incerto")
    return { valor: total, hash: envio.hash, pendente: true };
  await db.query("update indicacao_saques set status = 'pago' where id = $1", [
    saqueId,
  ]);
  return { valor: total, hash: envio.hash };
}
