import { nanoid } from "nanoid";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Admin } from "@/lib/admin/acesso";
import { criarAviso } from "@/lib/avisos-server";
import { estornar, type Cobranca } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { presignGet } from "@/lib/storage/s3";
import {
  REEMBOLSO_TEXTO_MAX,
  type MotivoReembolso,
  type ReembolsoDoVideo,
  type StatusReembolso,
} from "./reembolso";

/**
 * Reembolso dos créditos de um vídeo gerado (tabela reembolsos_video,
 * migration 0033). Server-side apenas.
 *
 *  - A pessoa pede uma vez por vídeo, com o motivo. Só vale para vídeo pronto
 *    que custou créditos (a cobrança fica guardada no job).
 *  - O admin aprova (a cobrança inteira do job volta, para os mesmos baldes)
 *    ou recusa, com a explicação. Nos dois casos a pessoa recebe um aviso.
 */

/** Erro com mensagem para mostrar a quem pediu. */
export class ReembolsoError extends Error {}

function pool() {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL não configurada.");
  return p;
}

const textoLivre = (t: string | null | undefined) =>
  t?.trim().slice(0, REEMBOLSO_TEXTO_MAX) || null;

/** Registra o pedido de reembolso de um vídeo da conta. */
export async function pedirReembolso(o: {
  userId: string;
  jobId: string;
  motivo: MotivoReembolso;
  detalhe?: string | null;
}): Promise<ReembolsoDoVideo> {
  const detalhe = textoLivre(o.detalhe);
  if (o.motivo === "outro" && !detalhe)
    throw new ReembolsoError("Escreva o motivo do reembolso.");

  const { rows } = await pool().query<{
    status: string;
    tipo: string;
    result_key: string | null;
    input: { cobranca?: Cobranca | null } | null;
  }>(
    "select status, tipo, result_key, input from video_jobs where id = $1 and user_id = $2",
    [o.jobId, o.userId],
  );
  const job = rows[0];
  if (!job || job.tipo.startsWith("treino")) throw new ReembolsoError("Vídeo não encontrado.");
  if (job.status !== "concluido" || !job.result_key)
    throw new ReembolsoError("Só dá para pedir reembolso de um vídeo pronto.");
  const creditos = job.input?.cobranca?.total ?? 0;
  if (creditos <= 0)
    throw new ReembolsoError("Este vídeo não gastou créditos.");

  const criado = await pool().query(
    `insert into reembolsos_video (id, user_id, job_id, motivo, detalhe, creditos)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (job_id) do nothing`,
    [nanoid(12), o.userId, o.jobId, o.motivo, detalhe, creditos],
  );
  if (!criado.rowCount)
    throw new ReembolsoError("Você já pediu o reembolso deste vídeo.");
  return { jobId: o.jobId, status: "pendente", creditos, resposta: null };
}

/**
 * Registra uma edição feita na hora pelo ffmpeg (corte, legenda rápida, fala)
 * como um job já concluído, com a cobrança guardada — é o que permite pedir o
 * reembolso dela e saber se o vídeo foi baixado ou publicado. Devolve o id, ou
 * null se nada foi cobrado. Nunca lança: a edição já saiu.
 */
export async function registrarEdicao(o: {
  userId: string;
  tipo: "corte" | "legenda" | "audio";
  key: string;
  duracao: number;
  cobranca: Cobranca | null;
  characterId?: string;
}): Promise<string | null> {
  const db = getPool();
  if (!db || !o.cobranca) return null;
  const id = nanoid(12);
  try {
    await db.query(
      `insert into video_jobs (id, user_id, character_id, status, provedor, tipo, modelo, fal_request_id, input, duracao, result_key)
       values ($1, $2, $3, 'concluido', 'ffmpeg', $4, 'ffmpeg', '', $5, $6, $7)`,
      [
        id,
        o.userId,
        o.characterId ?? "",
        o.tipo,
        JSON.stringify({ cobranca: o.cobranca }),
        o.duracao,
        o.key,
      ],
    );
    return id;
  } catch (e) {
    console.warn("[reembolso] não registrei a edição:", (e as Error).message);
    return null;
  }
}

/** Motivo da cobrança de cada edição no extrato (creditos_mov). */
const MOTIVO_DA_EDICAO = {
  corte: "video_corte",
  legenda: "video_legenda",
  audio: "video_audio",
} as const;
export type TipoEdicao = keyof typeof MOTIVO_DA_EDICAO;

/**
 * Edição antiga, de antes de as edições serem registradas (o vídeo não tem
 * job): acha no extrato uma cobrança desse tipo de edição que ainda não foi
 * ligada a nenhum vídeo e registra a edição com ela. Devolve o id do job.
 * O extrato não diz de que vídeo foi cada cobrança, nem liga o estorno de uma
 * edição que falhou à cobrança dela: quem confere é o admin, vendo o vídeo.
 */
export async function registrarEdicaoAntiga(o: {
  userId: string;
  tipo: TipoEdicao;
  key: string;
}): Promise<string> {
  const ja = await pool().query<{ id: string }>(
    "select id from video_jobs where user_id = $1 and result_key = $2 limit 1",
    [o.userId, o.key],
  );
  if (ja.rows[0]) return ja.rows[0].id;
  const { rows } = await pool().query<{
    id: string;
    do_plano: number;
    do_avulso: number;
  }>(
    `select m.id, -m.do_plano as do_plano, -m.do_avulso as do_avulso
       from creditos_mov m
      where m.user_id = $1 and m.motivo = $2 and m.delta < 0
        and not exists (select 1 from video_jobs j
                         where j.user_id = m.user_id and j.input->>'movimento' = m.id)
      order by m.created_at desc
      limit 1`,
    [o.userId, MOTIVO_DA_EDICAO[o.tipo]],
  );
  const mov = rows[0];
  if (!mov) throw new ReembolsoError("Este vídeo não gastou créditos.");
  const id = nanoid(12);
  const cobranca: Cobranca = {
    id: mov.id,
    userId: o.userId,
    total: mov.do_plano + mov.do_avulso,
    doPlano: mov.do_plano,
    doAvulso: mov.do_avulso,
  };
  await pool().query(
    `insert into video_jobs (id, user_id, character_id, status, provedor, tipo, modelo, fal_request_id, input, result_key)
     values ($1, $2, '', 'concluido', 'ffmpeg', $3, 'ffmpeg', '', $4, $5)`,
    [
      id,
      o.userId,
      o.tipo,
      JSON.stringify({ cobranca, movimento: mov.id }),
      o.key,
    ],
  );
  return id;
}

/** Os pedidos de reembolso da conta (um por vídeo). */
export async function reembolsosDaConta(
  userId: string,
): Promise<ReembolsoDoVideo[]> {
  const { rows } = await pool().query<{
    job_id: string;
    status: StatusReembolso;
    creditos: number;
    resposta: string | null;
    result_key: string | null;
  }>(
    `select r.job_id, r.status, r.creditos, r.resposta, j.result_key
       from reembolsos_video r join video_jobs j on j.id = r.job_id
      where r.user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({
    jobId: r.job_id,
    key: r.result_key,
    status: r.status,
    creditos: r.creditos,
    resposta: r.resposta,
  }));
}

/** Marca que a pessoa baixou o vídeo (a primeira vez é a que fica). Nunca lança. */
export async function registrarDownload(
  userId: string,
  key: string,
): Promise<void> {
  try {
    await getPool()?.query(
      `update video_jobs set baixado_em = now()
       where user_id = $1 and result_key = $2 and baixado_em is null`,
      [userId, key],
    );
  } catch (e) {
    console.warn("[reembolso] não registrei o download:", (e as Error).message);
  }
}

/** Um pedido, com tudo o que o admin precisa para julgar. */
export interface ReembolsoAdmin {
  id: string;
  userId: string;
  email: string | null;
  jobId: string;
  /** substituir | criar | legenda_ia, ou uma edição: corte | legenda | audio */
  tipo: string;
  modelo: string;
  duracao: number | null;
  /** Endereço temporário do vídeo (1h). Null se o arquivo não existe mais. */
  videoUrl: string | null;
  motivo: string;
  detalhe: string | null;
  creditos: number;
  status: StatusReembolso;
  resposta: string | null;
  resolvidoPor: string | null;
  pedidoEm: string;
  resolvidoEm: string | null;
  videoCriadoEm: string;
  /** Quando a pessoa baixou o vídeo pelo app (null = não baixou). */
  baixadoEm: string | null;
  /** Posts da plataforma que usam este vídeo (agendados, publicados ou com erro). */
  posts: Array<{ status: string; quando: string; redes: string[] }>;
}

/** Pedidos de reembolso para a área admin, mais recentes primeiro (até 100). */
export async function listarReembolsos(
  s3: S3Client | null,
  status?: string,
): Promise<{
  itens: ReembolsoAdmin[];
  totais: Array<{ status: string; n: number }>;
}> {
  const filtro = ["pendente", "aprovado", "recusado"].includes(status ?? "")
    ? status
    : null;
  const [lista, totais] = await Promise.all([
    pool().query<{
      id: string;
      user_id: string;
      email: string | null;
      job_id: string;
      tipo: string;
      modelo: string;
      duracao: number | null;
      result_key: string | null;
      motivo: string;
      detalhe: string | null;
      creditos: number;
      status: StatusReembolso;
      resposta: string | null;
      resolvido_por: string | null;
      created_at: Date;
      resolvido_em: Date | null;
      job_criado_em: Date;
      baixado_em: Date | null;
      posts: Array<{ status: string; quando: string; redes: string[] }> | null;
    }>(
      `select r.id, r.user_id, u.email, r.job_id, j.tipo, j.modelo, j.duracao, j.result_key,
              r.motivo, r.detalhe, r.creditos, r.status, r.resposta, r.resolvido_por,
              r.created_at, r.resolvido_em, j.created_at as job_criado_em, j.baixado_em,
              (select json_agg(json_build_object('status', p.status, 'quando', p.post_date, 'redes', p.redes)
                               order by p.post_date)
                 from posts_agendados p
                where p.user_id = r.user_id and p.midia_key = j.result_key) as posts
         from reembolsos_video r
         join video_jobs j on j.id = r.job_id
         join "user" u on u.id = r.user_id
        where ($1::text is null or r.status = $1)
        order by r.created_at desc
        limit 100`,
      [filtro],
    ),
    pool().query<{ status: string; n: number }>(
      "select status, count(*)::int as n from reembolsos_video group by status",
    ),
  ]);
  const itens = await Promise.all(
    lista.rows.map(async (r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      jobId: r.job_id,
      tipo: r.tipo,
      modelo: r.modelo,
      duracao: r.duracao,
      videoUrl:
        s3 && r.result_key
          ? await presignGet(s3, r.result_key, 3600).catch(() => null)
          : null,
      motivo: r.motivo,
      detalhe: r.detalhe,
      creditos: r.creditos,
      status: r.status,
      resposta: r.resposta,
      resolvidoPor: r.resolvido_por,
      pedidoEm: new Date(r.created_at).toISOString(),
      resolvidoEm: r.resolvido_em
        ? new Date(r.resolvido_em).toISOString()
        : null,
      videoCriadoEm: new Date(r.job_criado_em).toISOString(),
      baixadoEm: r.baixado_em ? new Date(r.baixado_em).toISOString() : null,
      posts: (r.posts ?? []).map((p) => ({
        status: p.status,
        quando: new Date(p.quando).toISOString(),
        redes: p.redes ?? [],
      })),
    })),
  );
  return { itens, totais: totais.rows };
}

/**
 * Aprova (devolve os créditos do vídeo) ou recusa (com a explicação) um pedido
 * pendente. O pedido muda de status antes de o crédito voltar, então dois
 * cliques ou dois admins nunca devolvem em dobro.
 */
export async function resolverReembolso(
  admin: Pick<Admin, "email">,
  id: string,
  decisao: { aprovar: true } | { aprovar: false; resposta: string },
): Promise<void> {
  const resposta = decisao.aprovar ? null : textoLivre(decisao.resposta);
  if (!decisao.aprovar && !resposta)
    throw new ReembolsoError("Escreva por que o reembolso foi recusado.");

  const { rows } = await pool().query<{
    user_id: string;
    job_id: string;
    creditos: number;
    character_id: string;
    input: { cobranca?: Cobranca | null } | null;
  }>(
    `update reembolsos_video r
        set status = $2, resposta = $3, resolvido_por = $4, resolvido_em = now()
       from video_jobs j
      where r.id = $1 and r.status = 'pendente' and j.id = r.job_id
      returning r.user_id, r.job_id, r.creditos, j.character_id, j.input`,
    [id, decisao.aprovar ? "aprovado" : "recusado", resposta, admin.email],
  );
  const pedido = rows[0];
  if (!pedido) throw new ReembolsoError("Este pedido não está mais pendente.");

  if (decisao.aprovar) {
    const cobranca = pedido.input?.cobranca;
    try {
      if (!cobranca) throw new Error("O job não guarda a cobrança.");
      // Motivo "estorno…": os relatórios e a regra de reembolso de compra descontam do uso.
      await estornar(cobranca, "estorno_reembolso_video");
    } catch (e) {
      // O crédito não voltou: o pedido volta a ficar pendente.
      await pool().query(
        `update reembolsos_video set status = 'pendente', resolvido_por = null, resolvido_em = null
         where id = $1`,
        [id],
      );
      throw new ReembolsoError(
        `Não consegui devolver os créditos: ${(e as Error).message}`,
      );
    }
  }

  await criarAviso(pedido.user_id, {
    rotulo: decisao.aprovar
      ? `Reembolso aprovado: ${pedido.creditos} créditos devolvidos`
      : `Reembolso recusado: ${resposta}`,
    erro: !decisao.aprovar,
    href: pedido.character_id
      ? `/app/personagem/${pedido.character_id}?aba=estudio&secao=videos`
      : null,
    chave: `reembolso:${id}`,
  });
}
