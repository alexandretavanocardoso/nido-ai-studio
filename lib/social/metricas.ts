import type { Bundlesocial } from "bundlesocial";
import type { Pool } from "@neondatabase/serverless";
import { mensagemBundle } from "./bundle";
import { REDES, type Rede } from "./redes";

/** Números de um post numa rede (ou somados). */
export interface Metricas {
  views: number;
  curtidas: number;
  comentarios: number;
  reposts: number;
  quotes: number;
  salvos: number;
}

export const CAMPOS_METRICAS = [
  "views",
  "curtidas",
  "comentarios",
  "reposts",
  "quotes",
  "salvos",
] as const satisfies ReadonlyArray<keyof Metricas>;

/** Janela do Dashboard: o maior período (90 dias) mais o período anterior, pra comparar. */
export const DIAS_METRICAS = 180;
/** Máximo de posts por chamada do analytics em lote (limite do bundle.social). */
const MAX_POR_REDE = 60;

/** Leitura normalizada do bundle.social (o `raw` é o que a rede devolveu). */
interface Leitura {
  impressions: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  raw?: unknown;
  createdAt: string | null;
  updatedAt: string | null;
}

// Reposts e quotes não existem na leitura normalizada (só "shares"): saem do
// `raw` quando a rede separa os dois (X).
const CHAVES_REPOST = ["retweet_count", "repost_count", "reposts", "retweets"];
const CHAVES_QUOTE = ["quote_count", "quote_tweet_count", "quotes"];

function acharNumero(v: unknown, chaves: string[], nivel = 0): number | null {
  if (!v || typeof v !== "object" || nivel > 4) return null;
  for (const [k, x] of Object.entries(v))
    if (chaves.includes(k) && typeof x === "number") return x;
  for (const x of Object.values(v)) {
    const n = acharNumero(x, chaves, nivel + 1);
    if (n !== null) return n;
  }
  return null;
}

/** Converte a leitura do bundle.social nos números do Dashboard. */
export function extrairMetricas(l: Leitura): Metricas {
  return {
    views: l.views || l.impressions || 0,
    curtidas: l.likes || 0,
    comentarios: l.comments || 0,
    reposts: acharNumero(l.raw, CHAVES_REPOST) ?? (l.shares || 0),
    quotes: acharNumero(l.raw, CHAVES_QUOTE) ?? 0,
    salvos: l.saves || 0,
  };
}

/** Mensagem em português para a recusa do analytics num post. */
function mensagemAnalytics(msg: string): string {
  return /subscription tier/i.test(msg)
    ? "O plano atual do bundle.social não inclui analytics; as métricas ficam zeradas até o upgrade."
    : `bundle.social: ${msg}`;
}

const maisRecente = (l: Leitura) =>
  new Date(l.updatedAt ?? l.createdAt ?? 0).getTime();

/**
 * Busca no bundle.social as métricas dos posts publicados da conta que estão
 * sem leitura (ou com leitura mais velha que `minutos`) e grava em
 * posts_metricas. Devolve a mensagem de erro, se alguma rede falhou.
 */
export async function atualizarMetricas(
  bundle: Bundlesocial,
  pool: Pool,
  userId: string,
  minutos: number,
): Promise<string | null> {
  const { rows } = await pool.query<{
    id: string;
    bundle_post_id: string;
    rede: Rede;
  }>(
    `select p.id, p.bundle_post_id, r.rede
     from posts_agendados p
     cross join lateral unnest(p.redes) as r(rede)
     left join posts_metricas m on m.post_id = p.id and m.rede = r.rede
     where p.user_id = $1 and p.status = 'POSTED' and p.bundle_post_id is not null
       and p.post_date > now() - make_interval(days => $2)
       and (m.atualizado_em is null or m.atualizado_em < now() - make_interval(mins => $3))
     order by p.post_date desc`,
    [userId, DIAS_METRICAS, minutos],
  );

  let erro: string | null = null;
  await Promise.all(
    REDES.map(async (rede) => {
      const pendentes = rows
        .filter((r) => r.rede === rede)
        .slice(0, MAX_POR_REDE);
      if (!pendentes.length) return;
      const idLocal = new Map(pendentes.map((p) => [p.bundle_post_id, p.id]));
      const lidos = new Map<string, Metricas>();
      try {
        for (let page = 1; page <= MAX_POR_REDE / 20; page++) {
          const r = await bundle.analytics.analyticsGetBulkPostAnalytics({
            postIds: [...idLocal.keys()],
            platformType: rede,
            page,
            limit: 20,
          });
          for (const res of r.results) {
            const id = idLocal.get(res.postId);
            const ultima = [...res.items].sort(
              (a, b) => maisRecente(b) - maisRecente(a),
            )[0];
            if (id && ultima) lidos.set(id, extrairMetricas(ultima));
            // Recusa por post (ex.: plano do bundle.social sem analytics): avisa em vez de mostrar zero calado.
            else if (res.error) erro = mensagemAnalytics(res.error);
          }
          if (page >= r.pagination.totalPages) break;
        }
      } catch (e) {
        console.error("[social/metricas]", rede, e);
        erro = mensagemBundle(e);
        return;
      }

      const com = [...lidos.entries()];
      if (com.length)
        await pool.query(
          `insert into posts_metricas (post_id, rede, views, curtidas, comentarios, reposts, quotes, salvos)
           select t.id, $2, t.views, t.curtidas, t.comentarios, t.reposts, t.quotes, t.salvos
           from unnest($1::text[], $3::bigint[], $4::bigint[], $5::bigint[], $6::bigint[], $7::bigint[], $8::bigint[])
             as t(id, views, curtidas, comentarios, reposts, quotes, salvos)
           on conflict (post_id, rede) do update set views = excluded.views, curtidas = excluded.curtidas,
             comentarios = excluded.comentarios, reposts = excluded.reposts, quotes = excluded.quotes,
             salvos = excluded.salvos, atualizado_em = now()`,
          [
            com.map(([id]) => id),
            rede,
            ...CAMPOS_METRICAS.map((c) => com.map(([, m]) => Math.round(m[c]))),
          ],
        );
      // Sem leitura ainda (a rede demora a liberar): marca a tentativa e mantém o que havia.
      const sem = pendentes.map((p) => p.id).filter((id) => !lidos.has(id));
      if (sem.length)
        await pool.query(
          `insert into posts_metricas (post_id, rede) select id, $2 from unnest($1::text[]) as t(id)
           on conflict (post_id, rede) do update set atualizado_em = now()`,
          [sem, rede],
        );
    }),
  );
  return erro;
}

/** Grava a leitura de um post numa rede (null = só marca a tentativa e mantém o que havia). */
export async function gravarMetricas(
  pool: Pool,
  postId: string,
  rede: Rede,
  m: Metricas | null,
): Promise<void> {
  if (!m) {
    await pool.query(
      `insert into posts_metricas (post_id, rede) values ($1, $2)
       on conflict (post_id, rede) do update set atualizado_em = now()`,
      [postId, rede],
    );
    return;
  }
  await pool.query(
    `insert into posts_metricas (post_id, rede, views, curtidas, comentarios, reposts, quotes, salvos)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (post_id, rede) do update set views = excluded.views, curtidas = excluded.curtidas,
       comentarios = excluded.comentarios, reposts = excluded.reposts, quotes = excluded.quotes,
       salvos = excluded.salvos, atualizado_em = now()`,
    [postId, rede, ...CAMPOS_METRICAS.map((c) => Math.round(m[c]))],
  );
}

/** Leitura de post por link mais velha que isto é refeita ao abrir o Dashboard. */
export const HORAS_LINK_VELHO = 12;

export interface PostMetricas {
  id: string;
  characterId: string;
  quando: string;
  redes: Rede[];
  /** Post publicado por fora e cadastrado pelo link (null = saiu pelo app). */
  link: string | null;
  /** As views deste post foram digitadas pelo usuário (não vêm da rede). */
  viewsManual: boolean;
  texto: string;
  metricas: Partial<Record<Rede, Metricas>>;
}

/** Posts publicados da conta na janela do Dashboard, com as métricas por rede. */
export async function postsComMetricas(
  pool: Pool,
  userId: string,
): Promise<{
  posts: PostMetricas[];
  atualizadoEm: string | null;
  /** Posts por link com leitura velha (o Dashboard relê em segundo plano). */
  linksVelhos: number;
}> {
  const { rows } = await pool.query<{
    id: string;
    character_id: string;
    post_date: Date;
    redes: Rede[];
    manual: boolean;
    links: Partial<Record<Rede, string>> | null;
    texto: string;
    views_manual: boolean | null;
    metricas: Partial<Record<Rede, Metricas>>;
    atualizado_em: Date | null;
  }>(
    `select p.id, p.character_id, p.post_date, p.redes, p.manual, p.links, p.texto,
       max(m.atualizado_em) as atualizado_em, bool_or(m.views_manual is not null) as views_manual,
       coalesce(json_object_agg(m.rede, json_build_object('views', coalesce(m.views_manual, m.views), 'curtidas', m.curtidas,
         'comentarios', m.comentarios, 'reposts', m.reposts, 'quotes', m.quotes, 'salvos', m.salvos))
         filter (where m.rede is not null), '{}') as metricas
     from posts_agendados p
     left join posts_metricas m on m.post_id = p.id
     where p.user_id = $1 and p.status = 'POSTED' and p.post_date > now() - make_interval(days => $2)
     group by p.id order by p.post_date desc`,
    [userId, DIAS_METRICAS],
  );
  const leituras = rows
    .map((r) => r.atualizado_em?.getTime() ?? 0)
    .filter(Boolean);
  const velho = Date.now() - HORAS_LINK_VELHO * 3600_000;
  return {
    linksVelhos: rows.filter(
      (r) => r.manual && (r.atualizado_em?.getTime() ?? 0) < velho,
    ).length,
    posts: rows.map((r) => ({
      id: r.id,
      characterId: r.character_id,
      quando: r.post_date.toISOString(),
      redes: r.redes,
      link: r.manual ? (r.links?.[r.redes[0]] ?? null) : null,
      viewsManual: !!r.views_manual,
      texto: r.manual ? r.texto.slice(0, 140) : "",
      metricas: r.metricas,
    })),
    atualizadoEm: leituras.length
      ? new Date(Math.max(...leituras)).toISOString()
      : null,
  };
}
