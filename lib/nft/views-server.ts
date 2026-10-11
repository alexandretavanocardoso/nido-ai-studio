import type { Pool } from "@neondatabase/serverless";
import type { Bundlesocial } from "bundlesocial";
import { usuarioLiberado } from "@/lib/admin/acesso";
import { criarAviso } from "@/lib/avisos-server";
import { contasDoTime, type ContaSocial } from "@/lib/social/bundle";
import { metricasDoLink } from "@/lib/social/link-apify";
import { gravarMetricas } from "@/lib/social/metricas";
import { INFO_REDES, type Rede } from "@/lib/social/redes";
import { LinkError, tokenApify } from "@/lib/video/link";
import {
  BADGES,
  badgesAtingidos,
  ESCADAS,
  lerTotais,
  METRICAS_BADGE,
  precisaAprovacao,
  precisaConexao,
  SEM_TOTAIS,
  type Badge,
  type Totais,
} from "./badges";
import {
  chaveDaMarca,
  classificarPost,
  contasPeloPrimeiroLink,
  juntarPostsQueContam,
  leitura,
  marcasDaConta,
  resumir,
  saltoSuspeito,
  type MarcaMinha,
  type OrigemConta,
  type PostLido,
  type ResumoDosPosts,
} from "./views";

/**
 * Os números que contam para os badges, e a concessão dos badges.
 *
 * Em cada rede o personagem tem UMA conta: a conectada (login na rede, pelo
 * bundle.social), ou a do autor do primeiro post cadastrado por link. Só os
 * posts dessa conta contam, e cada conta serve a um personagem só — o primeiro
 * que ficou com ela (nft_contas_rede). O @ escrito na ficha não vale nada.
 *
 * Conexão é prova forte e ganha do link: se a conta estava com outro
 * personagem só pelo primeiro link e alguém a conecta, ela passa para quem
 * conectou (ver tomarConta).
 *
 * O que não conta: números digitados à mão (views_manual), posts de outra
 * conta, posts cujo autor não foi lido, e o mesmo post duas vezes.
 *
 * Os totais são a soma da MAIOR leitura de cada post (nft_views_post) e por
 * isso não diminuem. Badge concedido não é retirado sozinho — a não ser quando
 * a conta que dava os números é tomada por quem a conectou.
 *
 * Conta ligada só pelo primeiro link é prova fraca: a partir de certa marca
 * (100 mil views, ver ESCADAS) o badge espera aprovação do admin, a não ser que
 * os números de contas conectadas já batam a marca.
 */

/** Um personagem não é conferido de novo antes disto. */
export const MINUTOS_ENTRE_CONFERENCIAS = 10;
/** Posts por link lidos de uma vez para descobrir o autor (cada um é uma execução no Apify). */
export const AUTORES_POR_VEZ = 6;
/** Quantas vezes o app tenta ler o autor de um post. Depois, fica como "não informado". */
export const MAX_TENTATIVAS_AUTOR = 3;
/** Depois de uma leitura que falhou, o post só é tentado de novo passado isto. */
export const MINUTOS_ENTRE_TENTATIVAS = 10;
/** Uma rodada que não terminou (função derrubada no meio) libera a vez depois disto. */
const MINUTOS_DE_UMA_RODADA = 3;

/** Por que um badge espera aprovação (o texto fica no banco e aparece no admin). */
export const MOTIVOS = {
  marcaAlta: "Marca alta: sempre conferida por um admin.",
  semConexao:
    "A conta do influencer veio do primeiro link (não está conectada). Marcas altas só saem sozinhas com conta conectada.",
  salto: "Os números de um post saltaram fora do normal nesta leitura.",
} as const;

const COLUNAS = METRICAS_BADGE.join(", ");

interface LinhaPost {
  id: string;
  manual: boolean;
  bundle_post_id: string | null;
  links: Partial<Record<Rede, string>> | null;
  autor: string | null;
  autor_tentativas: number;
  created_at: Date;
  rede: Rede;
  views: string | null;
  curtidas: string | null;
  comentarios: string | null;
  reposts: string | null;
  quotes: string | null;
  salvos: string | null;
}

/** Posts publicados do personagem, um por rede em que saíram, com as leituras da rede. */
async function postsDoPersonagem(
  pool: Pool,
  userId: string,
  characterId: string,
): Promise<PostLido[]> {
  const { rows } = await pool.query<LinhaPost>(
    `select p.id, p.manual, p.bundle_post_id, p.links, p.autor, p.autor_tentativas, p.created_at, r.rede,
       m.views::text as views, m.curtidas::text as curtidas, m.comentarios::text as comentarios,
       m.reposts::text as reposts, m.quotes::text as quotes, m.salvos::text as salvos
     from posts_agendados p
     cross join lateral unnest(p.redes) as r(rede)
     left join posts_metricas m on m.post_id = p.id and m.rede = r.rede
     where p.user_id = $1 and p.character_id = $2 and p.status = 'POSTED'`,
    [userId, characterId],
  );
  const lePorLink = !!tokenApify();
  return rows.map((r) => ({
    id: r.id,
    manual: r.manual,
    bundle_post_id: r.bundle_post_id,
    links: r.links,
    autor: r.autor,
    // A mesma condição de AUTOR_A_LER, post a post.
    autorPendente:
      lePorLink &&
      r.manual &&
      r.autor === null &&
      r.rede !== "LINKEDIN" &&
      r.autor_tentativas < MAX_TENTATIVAS_AUTOR &&
      !!r.links?.[r.rede],
    rede: r.rede,
    criado: r.created_at.getTime(),
    metricas: {
      views: leitura(r.views),
      curtidas: leitura(r.curtidas),
      comentarios: leitura(r.comentarios),
      reposts: leitura(r.reposts),
      quotes: leitura(r.quotes),
      salvos: leitura(r.salvos),
    },
  }));
}

/** Totais do personagem: tudo o que conta, e só o que vem de conta conectada. */
async function somarTotais(
  pool: Pool,
  characterId: string,
): Promise<{ totais: Totais; verificados: Totais }> {
  const { rows } = await pool.query<Record<string, string>>(
    `select ${METRICAS_BADGE.map(
      (m) =>
        `coalesce(sum(${m}), 0)::text as ${m}, coalesce(sum(${m}) filter (where verificada), 0)::text as ${m}_ok`,
    ).join(", ")}
     from nft_views_post where character_id = $1`,
    [characterId],
  );
  const totais = { ...SEM_TOTAIS };
  const verificados = { ...SEM_TOTAIS };
  for (const m of METRICAS_BADGE) {
    totais[m] = Number(rows[0][m]);
    verificados[m] = Number(rows[0][`${m}_ok`]);
  }
  return { totais, verificados };
}

/**
 * A conta estava com outro personagem só pelo primeiro link, e agora alguém a
 * conectou (login na rede): ela passa para quem conectou. O personagem que a
 * perdeu fica sem conta naquela rede, os posts dela deixam de contar para ele
 * e os badges que os números restantes não sustentam são retirados (podem ser
 * conquistados de novo). Devolve se alguma marca mudou de dono.
 */
async function tomarConta(
  pool: Pool,
  o: { rede: Rede; marcas: string[]; characterId: string; userId: string },
): Promise<boolean> {
  // A troca de dono é um comando só: quem perdeu não consegue pegar de volta no meio.
  const { rows: tomadas } = await pool.query<{
    de: string;
    dono: string | null;
  }>(
    `with antes as (
       select usuario, character_id, user_id from nft_contas_rede
       where rede = $1 and usuario = any($2::text[]) and origem = 'link' and character_id <> $3
       for update
     )
     update nft_contas_rede c set character_id = $3, user_id = $4, origem = 'conectada'
       from antes where c.rede = $1 and c.usuario = antes.usuario
     returning antes.character_id as de, antes.user_id as dono`,
    [o.rede, o.marcas, o.characterId, o.userId],
  );
  const catalogo = BADGES.map((b) => b.id);
  for (const de of new Set(tomadas.map((t) => t.de))) {
    // O que sobrou da mesma conta com quem perdeu (a outra marca dela).
    await pool.query(
      "delete from nft_contas_rede where rede = $1 and character_id = $2 and origem = 'link'",
      [o.rede, de],
    );
    await pool.query(
      "delete from nft_views_post where rede = $1 and character_id = $2",
      [o.rede, de],
    );
    const { totais, verificados } = await somarTotais(pool, de);
    // conferido_em no passado: a próxima visita refaz a conta e o resumo.
    await pool.query(
      `update nft_views set total = $2, totais = $3, verificados = $4, conferido_em = to_timestamp(0)
       where character_id = $1`,
      [de, totais.views, JSON.stringify(totais), JSON.stringify(verificados)],
    );
    const valem = badgesAtingidos(totais).map((b) => b.id);
    const { rows: retirados } = await pool.query<{ badge: string }>(
      `delete from nft_badges
       where character_id = $1 and status in ('concedido', 'aguardando')
         and badge = any($2::text[]) and not (badge = any($3::text[]))
       returning badge`,
      [de, catalogo, valem],
    );
    console.warn(
      `[nft] ALERTA conta de ${o.rede} conectada pelo personagem ${o.characterId} saiu do personagem ${de} (estava pelo primeiro link). Badges retirados: ${retirados.map((r) => r.badge).join(", ") || "nenhum"}`,
    );
    const dono = tomadas.find((t) => t.de === de)?.dono;
    if (dono && (await usuarioLiberado("nft", dono)))
      await criarAviso(dono, {
        rotulo: `A conta do ${INFO_REDES[o.rede].nome} foi conectada por outro personagem e deixou de contar para este NFT`,
        erro: true,
        href: `/app/personagem/${de}?aba=nft`,
        chave: `nft-conta:${de}:${o.rede}:${o.characterId}`,
      });
  }
  return tomadas.length > 0;
}

/**
 * Tenta ficar com as marcas de uma conta para o personagem. Ou fica com todas
 * as que estavam livres, ou — se alguma já é de outro personagem — com nenhuma.
 * As marcas vão sempre na mesma ordem, para dois pedidos ao mesmo tempo não se
 * travarem. Quem conecta a conta ganha de quem só a tinha pelo primeiro link.
 */
async function reivindicar(
  pool: Pool,
  o: {
    rede: Rede;
    marcas: string[];
    characterId: string;
    userId: string;
    origem: OrigemConta;
  },
): Promise<boolean> {
  const marcas = [...new Set(o.marcas)].sort();
  if (!marcas.length) return false;
  const pegar = async () =>
    (
      await pool.query<{ usuario: string }>(
        `insert into nft_contas_rede (rede, usuario, character_id, user_id, origem)
         select $1, t.usuario, $3, $4, $5 from unnest($2::text[]) as t(usuario)
         on conflict (rede, usuario) do nothing
         returning usuario`,
        [o.rede, marcas, o.characterId, o.userId, o.origem],
      )
    ).rows;
  const deOutros = async () =>
    (
      await pool.query<{ origem: OrigemConta }>(
        `select origem from nft_contas_rede
         where rede = $1 and usuario = any($2::text[]) and character_id <> $3`,
        [o.rede, marcas, o.characterId],
      )
    ).rows;

  let novas = await pegar();
  let outros = await deOutros();
  if (
    outros.length &&
    o.origem === "conectada" &&
    outros.every((d) => d.origem === "link") &&
    (await tomarConta(pool, { ...o, marcas }))
  ) {
    novas = [...novas, ...(await pegar())];
    outros = await deOutros();
  }
  if (outros.length) {
    // A conta é (em parte) de outro personagem: devolve o que acabou de pegar.
    if (novas.length)
      await pool.query(
        "delete from nft_contas_rede where rede = $1 and character_id = $2 and usuario = any($3::text[])",
        [o.rede, o.characterId, novas.map((n) => n.usuario)],
      );
    return false;
  }
  // Conta que estava ligada pelo link e agora está conectada: passa a valer a prova forte.
  if (o.origem === "conectada")
    await pool.query(
      `update nft_contas_rede set origem = 'conectada'
       where rede = $1 and character_id = $2 and usuario = any($3::text[]) and origem <> 'conectada'`,
      [o.rede, o.characterId, marcas],
    );
  return true;
}

async function minhasMarcas(
  pool: Pool,
  characterId: string,
): Promise<MarcaMinha[]> {
  const { rows } = await pool.query<{
    rede: Rede;
    usuario: string;
    origem: OrigemConta;
  }>(
    "select rede, usuario, origem from nft_contas_rede where character_id = $1",
    [characterId],
  );
  return rows.map((r) => ({ rede: r.rede, marca: r.usuario, origem: r.origem }));
}

/** Das marcas de autor que aparecem nos posts, as que já são de outro personagem. */
async function marcasDeOutros(
  pool: Pool,
  characterId: string,
  posts: PostLido[],
): Promise<Set<string>> {
  const marcas = [
    ...new Set(posts.flatMap((p) => (p.autor ?? "").split(/\s+/).filter(Boolean))),
  ];
  if (!marcas.length) return new Set();
  const { rows } = await pool.query<{ rede: string; usuario: string }>(
    "select rede, usuario from nft_contas_rede where usuario = any($1::text[]) and character_id <> $2",
    [marcas, characterId],
  );
  return new Set(rows.map((r) => chaveDaMarca(r.rede, r.usuario)));
}

export interface ViewsDoPersonagem {
  totais: Totais;
  resumo: ResumoDosPosts;
}

/**
 * Recalcula os totais de um personagem e concede os badges batidos.
 * `conectadas` são as contas de rede conectadas a ele agora (pode ser vazio).
 */
export async function atualizarViewsDoPersonagem(
  pool: Pool,
  userId: string,
  characterId: string,
  conectadas: ContaSocial[],
): Promise<ViewsDoPersonagem> {
  const posts = await postsDoPersonagem(pool, userId, characterId);

  // 1. Contas conectadas: prova forte. Ficam com o personagem se estiverem
  //    livres, ou se outro personagem só as tinha pelo primeiro link.
  const redesConectadas = new Set<Rede>();
  for (const c of conectadas) {
    const marcas = marcasDaConta(c);
    if (!marcas.length) continue;
    if (
      await reivindicar(pool, {
        rede: c.rede,
        marcas,
        characterId,
        userId,
        origem: "conectada",
      })
    )
      redesConectadas.add(c.rede);
  }

  // 2. Redes ainda sem conta: o autor do primeiro link vira a conta.
  let minhas = await minhasMarcas(pool, characterId);
  let deOutros = await marcasDeOutros(pool, characterId, posts);
  const novas = contasPeloPrimeiroLink(posts, minhas, deOutros);
  for (const nova of novas)
    await reivindicar(pool, { ...nova, characterId, userId, origem: "link" });
  if (novas.length) {
    minhas = await minhasMarcas(pool, characterId);
    // Outro personagem pode ter ficado com a conta no mesmo instante.
    deOutros = await marcasDeOutros(pool, characterId, posts);
  }

  // 3. O que conta, post a post.
  const classificados = posts.map((p) =>
    classificarPost(p, minhas, deOutros, redesConectadas),
  );
  const contados = juntarPostsQueContam(classificados);

  let salto = false;
  if (contados.size) {
    const chaves = [...contados.keys()];
    const legados = [...contados.values()]
      .map((c) => c.legado)
      .filter((l): l is string => !!l);
    const { rows: gravados } = await pool.query<
      { chave: string; character_id: string; verificada: boolean } & Record<
        keyof Totais,
        string
      >
    >(
      `select chave, character_id, verificada, ${METRICAS_BADGE.map((m) => `${m}::text as ${m}`).join(", ")}
       from nft_views_post where chave = any($1::text[])`,
      [[...chaves, ...legados]],
    );
    const gravado = new Map(gravados.map((g) => [g.chave, g]));
    const gravar: Array<{
      chave: string;
      rede: Rede;
      verificada: boolean;
      m: Totais;
    }> = [];
    const apagar: string[] = [];
    for (const [chave, c] of contados) {
      const ja = gravado.get(chave);
      // O post já conta para outro personagem: fica com quem chegou primeiro.
      if (ja && ja.character_id !== characterId) continue;
      const antigo = c.legado ? gravado.get(c.legado) : undefined;
      const meuAntigo =
        antigo && antigo.character_id === characterId ? antigo : undefined;
      const m = { ...SEM_TOTAIS };
      for (const k of METRICAS_BADGE) {
        const antes = Math.max(
          Number(ja?.[k] ?? 0),
          Number(meuAntigo?.[k] ?? 0),
        );
        m[k] = Math.max(c.metricas[k], antes);
        // Em cada métrica, o salto mínimo é a marca que já pede conta conectada.
        if (saltoSuspeito(antes, c.metricas[k], ESCADAS[k].semConexaoDe))
          salto = true;
      }
      gravar.push({
        chave,
        rede: c.rede,
        verificada: c.verificada || !!ja?.verificada || !!meuAntigo?.verificada,
        m,
      });
      if (meuAntigo && c.legado) apagar.push(c.legado);
    }
    if (gravar.length)
      await pool.query(
        `insert into nft_views_post (chave, character_id, user_id, rede, verificada, ${COLUNAS})
         select t.chave, $10, $11, t.rede, t.verificada, t.views, t.curtidas, t.comentarios, t.reposts, t.quotes, t.salvos
         from unnest($1::text[], $2::text[], $3::boolean[], $4::bigint[], $5::bigint[], $6::bigint[], $7::bigint[], $8::bigint[], $9::bigint[])
           as t(chave, rede, verificada, views, curtidas, comentarios, reposts, quotes, salvos)
         on conflict (chave) do update set
           views = greatest(nft_views_post.views, excluded.views),
           curtidas = greatest(nft_views_post.curtidas, excluded.curtidas),
           comentarios = greatest(nft_views_post.comentarios, excluded.comentarios),
           reposts = greatest(nft_views_post.reposts, excluded.reposts),
           quotes = greatest(nft_views_post.quotes, excluded.quotes),
           salvos = greatest(nft_views_post.salvos, excluded.salvos),
           verificada = nft_views_post.verificada or excluded.verificada,
           atualizado_em = now()
           where nft_views_post.character_id = excluded.character_id`,
        [
          gravar.map((g) => g.chave),
          gravar.map((g) => g.rede),
          gravar.map((g) => g.verificada),
          ...METRICAS_BADGE.map((k) => gravar.map((g) => g.m[k])),
          characterId,
          userId,
        ],
      );
    if (apagar.length)
      await pool.query(
        "delete from nft_views_post where chave = any($1::text[]) and character_id = $2",
        [apagar, characterId],
      );
  }

  // 4. Totais (tudo, e só o que vem de conta conectada).
  const { totais, verificados } = await somarTotais(pool, characterId);
  const resumo = resumir(classificados, minhas);
  await pool.query(
    `insert into nft_views (character_id, user_id, total, totais, verificados, resumo)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (character_id) do update set total = excluded.total, totais = excluded.totais,
       verificados = excluded.verificados, resumo = excluded.resumo, conferido_em = now()`,
    [
      characterId,
      userId,
      totais.views,
      JSON.stringify(totais),
      JSON.stringify(verificados),
      JSON.stringify(resumo),
    ],
  );
  await concederBadges(pool, userId, characterId, totais, verificados, salto);
  return { totais, resumo };
}

/** Por que este badge não sai sozinho agora (null = sai). */
function motivoDeEspera(
  b: Badge,
  verificados: Totais,
  salto: boolean,
): string | null {
  if (precisaAprovacao(b)) return MOTIVOS.marcaAlta;
  if (precisaConexao(b) && verificados[b.metrica] < b.limite)
    return MOTIVOS.semConexao;
  return salto ? MOTIVOS.salto : null;
}

/**
 * Concede os badges que os totais já bateram (uma vez só cada). Os que não
 * podem sair sozinhos ficam aguardando o admin. Badge que esperava só por
 * falta de conta conectada sai sozinho quando os números conectados batem a marca.
 */
export async function concederBadges(
  pool: Pool,
  userId: string,
  characterId: string,
  totais: Totais,
  verificados: Totais,
  salto: boolean,
): Promise<void> {
  const atingidos = badgesAtingidos(totais);
  if (!atingidos.length) return;
  const linhas = atingidos.map((b) => {
    const motivo = motivoDeEspera(b, verificados, salto);
    return { b, status: motivo ? "aguardando" : "concedido", motivo };
  });
  const { rows: novos } = await pool.query<{ badge: string; status: string }>(
    `insert into nft_badges (character_id, badge, user_id, views, status, motivo, metrica)
     select $1, t.badge, $2, t.valor, t.status, t.motivo, t.metrica
     from unnest($3::text[], $4::bigint[], $5::text[], $6::text[], $7::text[])
       as t(badge, valor, status, motivo, metrica)
     on conflict (character_id, badge) do nothing
     returning badge, status`,
    [
      characterId,
      userId,
      linhas.map((l) => l.b.id),
      linhas.map((l) => Math.round(totais[l.b.metrica])),
      linhas.map((l) => l.status),
      linhas.map((l) => l.motivo),
      linhas.map((l) => l.b.metrica),
    ],
  );
  // Esperava só pela conta conectada, e os números conectados já chegaram lá.
  const liberaveis = atingidos
    .filter((b) => !precisaAprovacao(b) && verificados[b.metrica] >= b.limite)
    .map((b) => b.id);
  const { rows: liberados } = liberaveis.length
    ? await pool.query<{ badge: string }>(
        `update nft_badges set status = 'concedido', motivo = null, concedido_em = now()
         where character_id = $1 and status = 'aguardando' and motivo = $2 and badge = any($3::text[])
         returning badge`,
        [characterId, MOTIVOS.semConexao, liberaveis],
      )
    : { rows: [] };

  const concedidos = [
    ...novos.filter((n) => n.status === "concedido").map((n) => n.badge),
    ...liberados.map((l) => l.badge),
  ];
  for (const n of novos)
    if (n.status !== "concedido")
      console.warn(
        `[nft] badge aguardando aprovação: ${n.badge} · personagem ${characterId}`,
      );
  if (!concedidos.length) return;
  // Recurso ainda fechado para a conta (lib/em-teste.ts): o badge fica
  // guardado, mas o sino não anuncia uma tela que ela não consegue abrir.
  if (!(await usuarioLiberado("nft", userId))) return;
  const { rows: p } = await pool.query<{ nome: string | null }>(
    "select data -> 'identidade' ->> 'nome' as nome from characters where id = $1",
    [characterId],
  );
  const nome = p[0]?.nome?.trim() || "personagem";
  for (const id of concedidos) {
    const badge = atingidos.find((b) => b.id === id)!;
    await criarAviso(userId, {
      rotulo: `Badge ${badge.nome} · ${nome}`,
      href: `/app/personagem/${characterId}?aba=nft`,
      chave: `badge:${characterId}:${badge.id}`,
    });
  }
}

/**
 * Concede os badges que os totais JÁ guardados sustentam, sem refazer a conta.
 * É para o catálogo que ganhou degraus (ou escadas) depois da última
 * conferência: a marca já estava batida e o badge ainda não existia.
 */
export async function concederPendentes(
  pool: Pool,
  userId: string,
  characterId: string,
): Promise<void> {
  const { rows } = await pool.query<{
    total: string;
    totais: unknown;
    verificados: unknown;
  }>(
    "select total::text as total, totais, verificados from nft_views where character_id = $1 and user_id = $2",
    [characterId, userId],
  );
  if (!rows[0]) return;
  await concederBadges(
    pool,
    userId,
    characterId,
    { ...lerTotais(rows[0].totais), views: Number(rows[0].total) },
    lerTotais(rows[0].verificados),
    false,
  );
}

/**
 * Posts por link do personagem cujo autor o app ainda vai tentar ler. LinkedIn
 * fica de fora (a página pública não informa quem publicou), e também o post
 * que já foi tentado três vezes.
 */
const AUTOR_A_LER = `p.user_id = $1 and p.character_id = $2 and p.manual and p.status = 'POSTED'
  and p.autor is null and p.autor_tentativas < ${MAX_TENTATIVAS_AUTOR}
  and p.redes[1] <> 'LINKEDIN' and p.links ->> p.redes[1] is not null`;
/** Dos posts acima, os que podem ser lidos agora (nunca tentados, ou tentados há tempo). */
const PODE_LER_AGORA = `(p.autor_tentado_em is null
  or p.autor_tentado_em < now() - interval '${MINUTOS_ENTRE_TENTATIVAS} minutes')`;

export interface AutoresPendentes {
  /** Posts que podem ser lidos já. */
  agora: number;
  /** Posts cuja leitura falhou há pouco e que serão tentados de novo mais tarde. */
  depois: number;
  /** Há uma rodada de leitura em curso. */
  rodada: boolean;
}

/** O que falta ler de autores dos posts por link do personagem (0 sem Apify). */
export async function autoresPendentes(
  pool: Pool,
  userId: string,
  characterId: string,
): Promise<AutoresPendentes> {
  if (!tokenApify()) return { agora: 0, depois: 0, rodada: false };
  const { rows } = await pool.query<{
    agora: number;
    depois: number;
    rodada: boolean;
  }>(
    `select count(*) filter (where ${PODE_LER_AGORA})::int as agora,
       count(*) filter (where not ${PODE_LER_AGORA})::int as depois,
       coalesce((select v.autores_em > now() - interval '${MINUTOS_DE_UMA_RODADA} minutes'
                 from nft_views v where v.character_id = $2), false) as rodada
     from posts_agendados p where ${AUTOR_A_LER}`,
    [userId, characterId],
  );
  return rows[0];
}

/**
 * Lê na rede o autor dos posts por link que ainda não têm autor (e atualiza as
 * métricas deles de passagem). Sem autor lido, o post não pode contar.
 *
 * Cada leitura é uma execução no Apify, por isso: uma rodada por vez por
 * personagem, no máximo `max` posts por rodada (os cadastrados primeiro, que
 * são os que definem a conta em cada rede) e no máximo três tentativas por
 * post, com 10 minutos entre uma e outra. Depois da terceira, o post fica como
 * "autor não informado" e só o Dashboard volta a lê-lo.
 *
 * Devolve quantos posts foram tentados (0 = nada a fazer, ou já há uma rodada).
 */
export async function lerAutoresPendentes(
  pool: Pool,
  userId: string,
  characterId: string,
  max = AUTORES_POR_VEZ,
): Promise<number> {
  if (!tokenApify()) return 0;
  // Uma rodada por vez: quem marcar a hora primeiro lê.
  const { rowCount } = await pool.query(
    `insert into nft_views (character_id, user_id, autores_em) values ($1, $2, now())
     on conflict (character_id) do update set autores_em = now()
       where nft_views.autores_em is null
          or nft_views.autores_em < now() - interval '${MINUTOS_DE_UMA_RODADA} minutes'`,
    [characterId, userId],
  );
  if (!rowCount) return 0;
  try {
    // A tentativa é contada ANTES da leitura: se a função cair no meio, ela não sai de graça.
    const { rows: posts } = await pool.query<{
      id: string;
      rede: Rede;
      url: string;
      tentativas: number;
    }>(
      `update posts_agendados alvo
          set autor_tentativas = alvo.autor_tentativas + 1, autor_tentado_em = now()
        where alvo.id in (
          select p.id from posts_agendados p
          where ${AUTOR_A_LER} and ${PODE_LER_AGORA}
          order by p.created_at, p.id limit $3)
       returning alvo.id, alvo.redes[1] as rede, alvo.links ->> alvo.redes[1] as url,
         alvo.autor_tentativas as tentativas`,
      [userId, characterId, max],
    );
    await Promise.all(
      posts.map(async (p) => {
        // null = a leitura falhou e ainda há tentativa; "" = não deu para saber.
        let autor: string | null = null;
        try {
          const lido = await metricasDoLink(p.url);
          await gravarMetricas(pool, p.id, p.rede, lido.metricas);
          autor = lido.autor ?? "";
        } catch (e) {
          if (!(e instanceof LinkError))
            console.error("[nft] leitura do autor do post", p.id, e);
          if (p.tentativas >= MAX_TENTATIVAS_AUTOR) autor = "";
        }
        if (autor !== null)
          await pool.query(
            "update posts_agendados set autor = $2 where id = $1 and autor is null",
            [p.id, autor],
          );
      }),
    );
    return posts.length;
  } finally {
    // Libera a vez: a próxima rodada pode começar em seguida.
    await pool
      .query("update nft_views set autores_em = null where character_id = $1", [
        characterId,
      ])
      .catch(() => {});
  }
}

async function contasConectadas(
  bundle: Bundlesocial | null,
  teamId: string | null,
): Promise<ContaSocial[]> {
  return bundle && teamId ? contasDoTime(bundle, teamId) : [];
}

/**
 * Atualiza os totais (e os badges) dos personagens da conta que têm post
 * publicado. Personagem conferido há menos de 10 min é pulado, a não ser com
 * `forcar`. Falha num personagem (bundle.social fora) não mexe em nada dele.
 * Sem bundle.social configurado, contam só os posts por link.
 */
export async function atualizarViewsDaConta(
  pool: Pool,
  bundle: Bundlesocial | null,
  userId: string,
  o: { characterId?: string; forcar?: boolean } = {},
): Promise<void> {
  const { rows } = await pool.query<{
    character_id: string;
    team_id: string | null;
  }>(
    `select p.character_id, t.team_id
     from (select distinct character_id from posts_agendados
           where user_id = $1 and status = 'POSTED' and ($2::text is null or character_id = $2)) p
     left join social_times t on t.user_id = $1 and t.character_id = p.character_id
     left join nft_views v on v.character_id = p.character_id
     where $3 or v.conferido_em is null or v.conferido_em < now() - make_interval(mins => $4)`,
    [userId, o.characterId ?? null, !!o.forcar, MINUTOS_ENTRE_CONFERENCIAS],
  );
  for (const r of rows) {
    try {
      const contas = await contasConectadas(bundle, r.team_id);
      await atualizarViewsDoPersonagem(pool, userId, r.character_id, contas);
    } catch (e) {
      console.error("[nft] números do personagem", r.character_id, e);
    }
  }
}

/**
 * Cron: atualiza os personagens conferidos há mais tempo (até `max` por
 * rodada). Devolve quantos foram conferidos.
 */
export async function atualizarViewsDeTodos(
  pool: Pool,
  bundle: Bundlesocial | null,
  max: number,
): Promise<number> {
  const { rows } = await pool.query<{
    user_id: string;
    character_id: string;
    team_id: string | null;
  }>(
    `select p.user_id, p.character_id, t.team_id
     from (select distinct user_id, character_id from posts_agendados where status = 'POSTED') p
     left join social_times t on t.user_id = p.user_id and t.character_id = p.character_id
     left join nft_views v on v.character_id = p.character_id
     where v.conferido_em is null or v.conferido_em < now() - interval '6 hours'
     order by v.conferido_em asc nulls first limit $1`,
    [max],
  );
  let feitos = 0;
  for (const r of rows) {
    try {
      const contas = await contasConectadas(bundle, r.team_id);
      await atualizarViewsDoPersonagem(pool, r.user_id, r.character_id, contas);
      feitos++;
    } catch (e) {
      console.error("[nft] números do personagem", r.character_id, e);
    }
  }
  return feitos;
}
