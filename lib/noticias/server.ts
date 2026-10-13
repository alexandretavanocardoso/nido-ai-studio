import { nanoid } from "nanoid";
import { emailsAdmin } from "@/lib/admin/acesso";
import { criarAviso } from "@/lib/avisos-server";
import { getPool } from "@/lib/db";
import { grokDisponivel } from "@/lib/radar/grok";
import { pesquisarAgente } from "./pesquisar";
import {
  AGENTES,
  ALVOS,
  chaveNoticia,
  type Agente,
  type FonteNoticia,
  type Noticia,
  type NoticiaAchada,
  type NoticiasAdmin,
  type ResumoNoticias,
} from "./tipos";

/**
 * Notícias do admin (tabelas noticias_admin e noticias_admin_buscas, migration
 * 0036). Server-side apenas. Cada agente (concorrentes, IAs que usamos) roda
 * uma vez por dia e grava só o que ainda não estava na lista.
 */

function pool() {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL não configurada.");
  return p;
}

export const ehAgente = (a: string | null | undefined): a is Agente =>
  AGENTES.includes(a as Agente);

/** Notícias de um agente, mais recentes primeiro (até 150). */
export async function listarNoticias(agente: Agente): Promise<NoticiasAdmin> {
  const [lista, ultima] = await Promise.all([
    pool().query<{
      id: string;
      alvo: string;
      titulo: string;
      resumo: string;
      impacto: string;
      fonte: FonteNoticia;
      url: string | null;
      publicado_em: string | null;
      nota: number;
      created_at: Date;
    }>(
      `select id, alvo, titulo, resumo, impacto, fonte, url, publicado_em, nota, created_at
         from noticias_admin
        where agente = $1
        order by created_at::date desc, nota desc, created_at desc
        limit 150`,
      [agente],
    ),
    pool().query<{ quando: Date | null }>(
      "select max(created_at) as quando from noticias_admin_buscas where agente = $1 and erro is null",
      [agente],
    ),
  ]);
  const quando = ultima.rows[0]?.quando;
  return {
    itens: lista.rows.map(
      (r): Noticia => ({
        id: r.id,
        agente,
        alvo: r.alvo,
        titulo: r.titulo,
        resumo: r.resumo,
        impacto: r.impacto,
        fonte: r.fonte,
        url: r.url,
        publicadoEm: r.publicado_em,
        nota: r.nota,
        criadoEm: new Date(r.created_at).toISOString(),
      }),
    ),
    ultimaBusca: quando ? new Date(quando).toISOString() : null,
    comX: grokDisponivel(),
  };
}

/** A partir desta nota a notícia vai para o sino dos admins. */
export const NOTA_DO_SINO = 9;

/**
 * Avisa no sino de cada admin as notícias que pedem atenção agora. O aviso
 * leva para a aba Notícias; a chave impede avisar duas vezes da mesma.
 */
async function avisarAdmins(
  agente: Agente,
  novas: Array<NoticiaAchada & { id: string }>,
): Promise<void> {
  const urgentes = novas.filter((n) => n.nota >= NOTA_DO_SINO);
  if (!urgentes.length) return;
  const { rows } = await pool().query<{ id: string }>(
    `select id from "user" where "emailVerified" and lower(email) = any($1)`,
    [emailsAdmin()],
  );
  for (const admin of rows)
    for (const n of urgentes) {
      const quem = ALVOS[agente].find((a) => a.id === n.alvo)?.nome ?? n.alvo;
      await criarAviso(admin.id, {
        rotulo: `${quem}: ${n.titulo}`,
        href: `/app/admin?aba=noticias&agente=${agente}`,
        chave: `noticia:${n.id}`,
      });
    }
}

/**
 * Grava as notícias de uma rodada; a que já estava (mesmo link) fica como
 * está. As novas com nota alta vão para o sino dos admins. Devolve quantas
 * são novas.
 */
export async function salvarNoticias(
  agente: Agente,
  itens: NoticiaAchada[],
): Promise<number> {
  const novas: Array<NoticiaAchada & { id: string }> = [];
  for (const n of itens) {
    const chave = chaveNoticia(n.titulo, n.url);
    if (!chave) continue;
    const id = nanoid(12);
    const r = await pool().query(
      `insert into noticias_admin (id, agente, alvo, chave, titulo, resumo, impacto, fonte, url, publicado_em, nota)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (agente, chave) do nothing`,
      [
        id,
        agente,
        n.alvo,
        chave,
        n.titulo,
        n.resumo,
        n.impacto,
        n.fonte,
        n.url,
        n.publicadoEm,
        n.nota,
      ],
    );
    if (r.rowCount) novas.push({ ...n, id });
  }
  try {
    await avisarAdmins(agente, novas);
  } catch (e) {
    // As notícias já estão gravadas: o aviso que falha não derruba a rodada.
    console.warn("[noticias] não avisei os admins:", (e as Error).message);
  }
  return novas.length;
}

/** Agentes sem rodada que deu certo nas últimas `horas` (para o cron não pagar duas vezes). */
export async function agentesPendentes(horas = 20): Promise<Agente[]> {
  const { rows } = await pool().query<{ agente: string }>(
    `select distinct agente from noticias_admin_buscas
      where erro is null and created_at > now() - make_interval(hours => $1)`,
    [horas],
  );
  const feitos = new Set(rows.map((r) => r.agente));
  return AGENTES.filter((a) => !feitos.has(a));
}

const DIA = 86_400_000;
const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * De que dia para cá o agente procura: desde a véspera da última rodada que
 * deu certo (a folga cobre fuso e o que saiu durante a rodada), no máximo uma
 * semana. Na primeira vez, a última semana.
 */
export function desdeQuando(ultimaOk: Date | null, agora = Date.now()): string {
  const piso = agora - 7 * DIA;
  return dia(
    ultimaOk ? Math.max(piso, Math.min(ultimaOk.getTime(), agora) - DIA) : piso,
  );
}

/**
 * Roda os agentes pedidos, ao mesmo tempo, e grava o que acharam. Um agente
 * que falha não derruba o outro: fica registrado com o erro.
 */
export async function pesquisarNoticias(
  agentes: readonly Agente[] = AGENTES,
): Promise<ResumoNoticias> {
  const resumo: ResumoNoticias = {
    achados: 0,
    novos: 0,
    usd: 0,
    usouX: [],
    falhas: [],
  };
  await Promise.all(
    agentes.map(async (agente) => {
      let achados = 0;
      let novos = 0;
      let usd = 0;
      let usouX = false;
      let erro: string | null = null;
      try {
        const [ultima, recentes] = await Promise.all([
          pool().query<{ quando: Date | null }>(
            "select max(created_at) as quando from noticias_admin_buscas where agente = $1 and erro is null",
            [agente],
          ),
          pool().query<{ titulo: string }>(
            "select titulo from noticias_admin where agente = $1 order by created_at desc limit 40",
            [agente],
          ),
        ]);
        const quando = ultima.rows[0]?.quando;
        const r = await pesquisarAgente({
          agente,
          desde: desdeQuando(quando ? new Date(quando) : null),
          hoje: dia(Date.now()),
          conhecidas: recentes.rows.map((x) => x.titulo),
        });
        usd = r.usd;
        usouX = r.usouX;
        achados = r.itens.length;
        novos = await salvarNoticias(agente, r.itens);
        if (usouX) resumo.usouX.push(agente);
      } catch (e) {
        erro = (e as Error).message.slice(0, 500);
        console.error("[noticias]", agente, erro);
        resumo.falhas.push({ agente, erro });
      }
      resumo.achados += achados;
      resumo.novos += novos;
      resumo.usd += usd;
      await pool().query(
        `insert into noticias_admin_buscas (id, agente, achados, novos, custo_usd, usou_x, erro)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [nanoid(12), agente, achados, novos, usd.toFixed(4), usouX, erro],
      );
    }),
  );
  return resumo;
}
