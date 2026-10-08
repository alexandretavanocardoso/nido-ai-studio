import type Stripe from "stripe";
import { customAlphabet, nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import type { RedeUsdc } from "@/lib/pagamentos/redes-usdc";
import {
  carteiraValida,
  prepararEnvioUsdc,
  redesDeSaqueUsdc,
  tetoDiarioUsdc,
  tetoDoSaqueUsdc,
} from "./onchain";
import {
  CARENCIA_DIAS,
  COMISSAO,
  comissaoEmCentavos,
  JANELA_VINCULO_DIAS,
  moedaDaComissao,
  normalizarCodigo,
  problemaDoCodigo,
  SAQUE_MINIMO,
  type MoedaComissao,
} from "./regras";

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
 * por alguém. Vale só a primeira assinatura do indicado; repetir a chamada
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
    }>(
      `select p.user_id, i.indicador_user_id, p.plano, p.valor, p.moeda, p.provedor
       from pagamentos p
       join indicacoes i on i.indicado_user_id = p.user_id
       where p.id = $1 and p.status = 'pago' and p.tipo = 'plano'`,
      [pagamentoId],
    );
    const p = rows[0];
    if (!p) return;
    const centavos = comissaoEmCentavos(Number(p.valor));
    if (!centavos) return;
    await pool().query(
      `insert into indicacao_comissoes
         (id, indicador_user_id, indicado_user_id, pagamento_id, plano, valor_base, moeda, valor, disponivel_em)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9))
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
        CARENCIA_DIAS,
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
  moeda: MoedaComissao;
  /** Já pode sacar (descontadas as comissões estornadas depois de sacadas). */
  disponivel: number;
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
    /** O pagamento foi estornado: a comissão foi desfeita. */
    estornada: boolean;
    plano: string | null;
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
      status: string | null;
    }>(
      `select u."name" as nome, i.created_at as desde, c.plano, c.valor, c.moeda, c.status
       from indicacoes i
       join "user" u on u."id" = i.indicado_user_id
       left join indicacao_comissoes c on c.indicado_user_id = i.indicado_user_id
       where i.indicador_user_id = $1
       order by i.created_at desc limit 200`,
      [userId],
    ),
    db.query<{
      moeda: MoedaComissao;
      disponivel: string;
      pendente: string;
      sacado: string;
    }>(
      `select moeda,
         coalesce(sum(valor) filter (where status = 'disponivel' and disponivel_em <= now()), 0)
           - coalesce(sum(valor) filter (where status = 'estorno_devido'), 0) as disponivel,
         coalesce(sum(valor) filter (where status = 'disponivel' and disponivel_em > now()), 0) as pendente,
         coalesce(sum(valor) filter (where status in ('sacada', 'estorno_devido', 'estorno_quitado')), 0) as sacado
       from indicacao_comissoes where indicador_user_id = $1 group by moeda order by moeda`,
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
    }>(
      `select id, moeda, valor, status, created_at, rede, tx_hash from indicacao_saques
       where user_id = $1 order by created_at desc limit 20`,
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
      assinou: r.valor != null,
      estornada: !!r.status?.startsWith("estorn"),
      plano: r.plano,
      comissao: r.valor != null ? Number(r.valor) : null,
      moeda: r.moeda,
    })),
    saldos: saldos.rows.map((s) => ({
      moeda: s.moeda,
      disponivel: Number(s.disponivel),
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
    })),
    usdc: { redes: redesDeSaqueUsdc(), teto: tetoDoSaqueUsdc() },
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
    // Dois cliques seguidos não criam duas contas.
    { idempotencyKey: `indicacao-conta-${userId}` },
  );
  const { rows } = await pool().query<{ stripe_account_id: string }>(
    `update indicacao_contas set stripe_account_id = coalesce(stripe_account_id, $2), updated_at = now()
     where user_id = $1 returning stripe_account_id`,
    [userId, nova.id],
  );
  return rows[0].stripe_account_id;
}

/**
 * Reserva as comissões disponíveis de uma moeda para um saque novo e calcula
 * o valor a pagar (já descontado o que foi estornado depois de sacado).
 * Abaixo do mínimo, desfaz a reserva e devolve o erro.
 */
async function abrirSaque(
  userId: string,
  moeda: MoedaComissao,
  destino: { rede: RedeUsdc; carteira: string } | null,
): Promise<
  | { erro: string }
  | { saqueId: string; total: number; dividas: string[]; devolver: () => Promise<unknown> }
> {
  const db = pool();
  const saqueId = `saq_${nanoid(14)}`;
  const devolver = () =>
    db.query(
      "update indicacao_comissoes set status = 'disponivel', saque_id = null where saque_id = $1",
      [saqueId],
    );

  await db.query(
    "insert into indicacao_saques (id, user_id, moeda, valor, rede, carteira) values ($1, $2, $3, 0.01, $4, $5)",
    [saqueId, userId, moeda, destino?.rede ?? null, destino?.carteira ?? null],
  );
  const { rows } = await db.query<{ total: string | null }>(
    `with reservadas as (
       update indicacao_comissoes set status = 'sacada', saque_id = $3
       where indicador_user_id = $1 and moeda = $2 and status = 'disponivel' and disponivel_em <= now()
       returning valor)
     select sum(valor) as total from reservadas`,
    [userId, moeda, saqueId],
  );
  // Comissões já sacadas e depois estornadas: descontam deste saque.
  const dividas = await db.query<{ id: string; valor: string }>(
    `select id, valor from indicacao_comissoes
     where indicador_user_id = $1 and moeda = $2 and status = 'estorno_devido'`,
    [userId, moeda],
  );
  const devido = dividas.rows.reduce((t, d) => t + Number(d.valor), 0);
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
  await db.query("update indicacao_saques set valor = $2 where id = $1", [
    saqueId,
    total.toFixed(2),
  ]);
  return { saqueId, total, dividas: dividas.rows.map((d) => d.id), devolver };
}

/** Saque pago: quita as dívidas de estorno que foram descontadas dele. */
async function quitarDividas(ids: string[]) {
  if (ids.length)
    await pool().query(
      "update indicacao_comissoes set status = 'estorno_quitado' where id = any($1) and status = 'estorno_devido'",
      [ids],
    );
}

/**
 * Saca pelo Stripe todo o saldo disponível em BRL ou USD: reserva as
 * comissões, transfere para a conta Connect do usuário e, se a transferência
 * falhar, devolve as comissões ao saldo. Devolve o valor sacado ou o erro.
 */
export async function sacarComissoes(
  stripe: Stripe,
  userId: string,
  moeda: Exclude<MoedaComissao, "USDC">,
): Promise<{ valor: number } | { erro: string }> {
  const conta = await contaDeIndicacao(userId);
  if (!conta.stripeAccountId)
    return { erro: "Conecte sua conta do Stripe antes de sacar." };
  const destino = await stripe.accounts.retrieve(conta.stripeAccountId);
  if (!destino.details_submitted || !destino.payouts_enabled)
    return { erro: "Termine o cadastro da sua conta no Stripe para sacar." };

  const saque = await abrirSaque(userId, moeda, null);
  if ("erro" in saque) return saque;
  const { saqueId, total } = saque;
  const db = pool();
  try {
    const transferencia = await stripe.transfers.create(
      {
        amount: Math.round(total * 100),
        currency: moeda.toLowerCase(),
        destination: conta.stripeAccountId,
        description: "NIDO AI Studio · comissão de indicações",
        // O admin acha a transferência por aqui se o saque ficar pela metade.
        transfer_group: saqueId,
        metadata: { userId, saqueId },
      },
      { idempotencyKey: saqueId },
    );
    await db.query(
      "update indicacao_saques set status = 'pago', stripe_transfer_id = $2 where id = $1",
      [saqueId, transferencia.id],
    );
    await quitarDividas(saque.dividas);
    return { valor: total };
  } catch (e) {
    const msg = (e as Error).message ?? "Falha na transferência.";
    console.error("[indicacao] saque", saqueId, e);
    await saque.devolver();
    await db.query(
      "update indicacao_saques set status = 'falhou', erro = $2 where id = $1",
      [saqueId, msg.slice(0, 500)],
    );
    return {
      erro: "O Stripe não concluiu a transferência. O saldo continua disponível; tente de novo mais tarde.",
    };
  }
}

/**
 * Saca on-chain todo o saldo disponível em USDC: da carteira de saques da
 * NIDO para a carteira do usuário, na rede escolhida.
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

  const saque = await abrirSaque(userId, "USDC", { rede, carteira });
  if ("erro" in saque) return saque;
  const { saqueId, total } = saque;
  const db = pool();
  const falhar = async (msg: string, paraUsuario: string) => {
    await saque.devolver();
    await db.query(
      "update indicacao_saques set status = 'falhou', erro = $2 where id = $1",
      [saqueId, msg.slice(0, 500)],
    );
    return { erro: paraUsuario };
  };

  if (total > tetoDoSaqueUsdc())
    return falhar(
      `Acima do teto automático (${tetoDoSaqueUsdc()} USDC).`,
      "Este valor passa do limite do saque automático. Fale com o suporte para receber.",
    );

  // Teto do dia, somando todos os usuários: limita o estrago se alguém achar
  // um jeito de gerar comissão indevida. Conta o que saiu e o que está saindo.
  const { rows: dia } = await db.query<{ soma: string }>(
    `select coalesce(sum(valor), 0) as soma from indicacao_saques
     where rede is not null and id <> $1 and status in ('pago', 'processando')
       and created_at > now() - interval '24 hours'`,
    [saqueId],
  );
  if (Number(dia[0].soma) + total > tetoDiarioUsdc()) {
    console.error(
      `[indicacao] ALERTA: teto diário de saque em USDC atingido (${dia[0].soma} + ${total} > ${tetoDiarioUsdc()}). Saque ${saqueId} recusado.`,
    );
    return falhar(
      `Teto diário de saques em USDC atingido (${tetoDiarioUsdc()} USDC).`,
      "O limite diário de saques em USDC foi atingido. O saldo continua disponível; tente de novo amanhã.",
    );
  }

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

  // Daqui em diante a transação existe (assinada): guarda o hash antes de transmitir.
  await db.query("update indicacao_saques set tx_hash = $2 where id = $1", [
    saqueId,
    envio.hash,
  ]);
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
  await quitarDividas(saque.dividas);
  return { valor: total, hash: envio.hash };
}
