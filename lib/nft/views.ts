import type { Rede } from "@/lib/social/redes";
import { METRICAS_BADGE, SEM_TOTAIS, type Totais } from "./badges";

/**
 * Regras dos números que contam para os badges (sem banco, sem rede). Quem
 * aplica é lib/nft/views-server.ts.
 *
 * Em cada rede, o personagem tem UMA conta:
 *  - a conta conectada (login na rede, pelo bundle.social), quando existe; ou
 *  - a conta do autor do primeiro post cadastrado por link naquela rede.
 * Só os posts dessa conta contam, e cada conta serve a um personagem só (o
 * primeiro que ficou com ela). O mesmo post nunca soma duas vezes.
 */

/** Leitura acima disto é descartada (nenhum post tem isso; é erro do scraper). */
export const MAX_VIEWS_POST = 100_000_000_000;

/** "@Lila.Nova " → "lila.nova" */
export function normalizarUsuario(u: string | null | undefined): string {
  return (u ?? "").trim().replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
}

function url(link: string): URL | null {
  try {
    return new URL(link.trim());
  } catch {
    return null;
  }
}

/**
 * Identidade do post na rede, igual para todos os formatos de link do mesmo
 * post (youtu.be e /shorts, /reel e /p…). Sem um id reconhecível, vale o
 * endereço sem rastreio.
 */
export function chaveDoPost(rede: Rede, link: string): string {
  const u = url(link);
  if (!u) return `${rede}:${link.trim().toLowerCase()}`;
  const caminho = u.pathname;
  let id: string | undefined;
  if (rede === "INSTAGRAM")
    id = caminho.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/)?.[1];
  else if (rede === "TIKTOK") id = caminho.match(/\/(?:video|photo)\/(\d+)/)?.[1];
  else if (rede === "YOUTUBE")
    id =
      (u.hostname.replace(/^www\./, "") === "youtu.be"
        ? caminho.slice(1).split("/")[0]
        : undefined) ||
      caminho.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]+)/)?.[1] ||
      u.searchParams.get("v") ||
      undefined;
  else if (rede === "TWITTER") id = caminho.match(/\/status\/(\d+)/)?.[1];
  else if (rede === "LINKEDIN")
    id = `${caminho}${u.search}`.match(/(?:activity|ugcPost|share)[-:](\d+)/)?.[1];
  if (id) return `${rede}:${id}`;
  const host = u.hostname.replace(/^(www|m|mobile)\./, "").toLowerCase();
  return `${rede}:${host}${caminho.replace(/\/+$/, "")}`;
}

/** Como uma conta de rede é reconhecida: pelo id na rede e pelo @. */
export interface ContaDaRede {
  usuario: string | null;
  idExterno: string | null;
}

/** Marcas que identificam a conta ("id:123", "lilanova"), em ordem fixa. */
export function marcasDaConta(c: ContaDaRede): string[] {
  const marcas: string[] = [];
  if (c.idExterno?.trim()) marcas.push(`id:${c.idExterno.trim()}`);
  const u = normalizarUsuario(c.usuario);
  if (u) marcas.push(u);
  return [...new Set(marcas)].sort();
}

/**
 * Marcas do autor lido de um post (ver lerAutorDoItem: "lilanova id:123"), em
 * ordem fixa. Vazio = autor não lido ou não informado pela rede.
 */
export function marcasDoAutor(autor: string | null | undefined): string[] {
  return [...new Set((autor ?? "").split(/\s+/).filter(Boolean))].sort();
}

/** De onde veio a ligação da conta com o personagem. */
export type OrigemConta = "conectada" | "link";

/** Uma marca de conta que pertence a este personagem. */
export interface MarcaMinha {
  rede: Rede;
  marca: string;
  origem: OrigemConta;
}

/** "INSTAGRAM|lilanova": chave de uma marca numa rede. */
export const chaveDaMarca = (rede: string, marca: string) => `${rede}|${marca}`;

/** Um post numa rede, com as leituras que vieram da rede (nunca as digitadas). */
export interface PostLido {
  id: string;
  /** Cadastrado por link (publicado por fora do app). */
  manual: boolean;
  bundle_post_id: string | null;
  links: Partial<Record<Rede, string>> | null;
  /** Autor lido da rede. null = ainda não lido · "" = a rede não informou. */
  autor: string | null;
  /**
   * O autor ainda não foi lido e o app ainda vai tentar ler. Falso quando não
   * há mais o que tentar (LinkedIn não informa autor; as tentativas acabaram).
   */
  autorPendente?: boolean;
  rede: Rede;
  /** Quando o post foi cadastrado no app (define o "primeiro link"). */
  criado: number;
  metricas: Totais;
}

/** Limpa uma leitura: número inteiro entre 0 e o teto, senão 0. */
export function leitura(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 && n <= MAX_VIEWS_POST ? Math.round(n) : 0;
}

const temLeitura = (m: Totais) => METRICAS_BADGE.some((k) => m[k] > 0);

/**
 * Para cada rede em que o personagem ainda não tem conta: o autor do primeiro
 * post cadastrado por link (com autor lido, e que não seja de outro
 * personagem) vira a conta dele naquela rede.
 *
 * "Primeiro" é pela ordem em que os links foram cadastrados, não pela ordem em
 * que os autores foram lidos: enquanto um link mais antigo da rede espera a
 * leitura do autor, nenhuma conta é definida para ela.
 */
export function contasPeloPrimeiroLink(
  posts: PostLido[],
  minhas: MarcaMinha[],
  deOutros: ReadonlySet<string>,
): Array<{ rede: Rede; marcas: string[] }> {
  const comConta = new Set(minhas.map((m) => m.rede));
  const esperando = new Set<Rede>();
  const novas = new Map<Rede, string[]>();
  for (const p of [...posts].sort(
    (a, b) => a.criado - b.criado || a.id.localeCompare(b.id),
  )) {
    if (!p.manual || comConta.has(p.rede) || novas.has(p.rede)) continue;
    if (esperando.has(p.rede)) continue;
    if (p.autor === null && p.autorPendente) {
      esperando.add(p.rede);
      continue;
    }
    const marcas = marcasDoAutor(p.autor);
    if (!marcas.length) continue;
    if (marcas.some((m) => deOutros.has(chaveDaMarca(p.rede, m)))) continue;
    novas.set(p.rede, marcas);
  }
  return [...novas].map(([rede, marcas]) => ({ rede, marcas }));
}

/**
 * conta = soma para os badges · sem_leitura = a rede ainda não deu número ·
 * sem_autor = post por link esperando a leitura de quem publicou (o autor dele,
 * ou o do primeiro link da rede, que é quem define a conta) · autor_oculto =
 * não deu para saber quem publicou (a rede não informa, ou a leitura não saiu)
 * · outra_conta = é de outra conta que não a do influencer naquela rede ·
 * outro_personagem = a conta já conta para outro personagem · sem_conta = post
 * do app numa rede sem conta conectada do personagem.
 */
export type Situacao =
  | "conta"
  | "sem_leitura"
  | "sem_autor"
  | "autor_oculto"
  | "outra_conta"
  | "outro_personagem"
  | "sem_conta";

export interface PostClassificado {
  post: PostLido;
  situacao: Situacao;
  /** O número vem de conta conectada (prova forte)? */
  verificada: boolean;
}

/** Diz se o post conta para os badges, e por quê não. */
export function classificarPost(
  p: PostLido,
  minhas: MarcaMinha[],
  deOutros: ReadonlySet<string>,
  /** Redes em que o personagem tem, agora, uma conta conectada que é dele. */
  conectadas: ReadonlySet<Rede>,
): PostClassificado {
  const fim = (situacao: Situacao, verificada = false) => ({
    post: p,
    situacao,
    verificada,
  });
  if (!temLeitura(p.metricas)) return fim("sem_leitura");
  if (!p.manual) {
    // Publicado pelo app: saiu pela conta conectada do personagem.
    if (!p.bundle_post_id) return fim("sem_conta");
    return conectadas.has(p.rede) ? fim("conta", true) : fim("sem_conta");
  }
  if (p.autor === null) return fim(p.autorPendente ? "sem_autor" : "autor_oculto");
  const marcas = marcasDoAutor(p.autor);
  if (!marcas.length) return fim("autor_oculto");
  if (marcas.some((m) => deOutros.has(chaveDaMarca(p.rede, m))))
    return fim("outro_personagem");
  const minhasNaRede = minhas.filter(
    (m) => m.rede === p.rede && marcas.includes(m.marca),
  );
  if (!minhasNaRede.length)
    // Rede ainda sem conta: há um link mais antigo dela esperando a leitura do
    // autor, e é ele que define a conta. Com a conta definida, este é de outra.
    return fim(
      minhas.some((m) => m.rede === p.rede) ? "outra_conta" : "sem_autor",
    );
  return fim(
    "conta",
    minhasNaRede.some((m) => m.origem === "conectada"),
  );
}

export interface PostContado {
  rede: Rede;
  metricas: Totais;
  verificada: boolean;
  /** Chave antiga do mesmo post do app (antes de o link dele ser conhecido). */
  legado?: string;
}

/**
 * Junta os posts que contam por identidade do post: o mesmo post (pelo app e
 * pelo link, ou em dois formatos de link) entra uma vez, com a maior leitura
 * de cada métrica.
 */
export function juntarPostsQueContam(
  classificados: PostClassificado[],
): Map<string, PostContado> {
  const contados = new Map<string, PostContado>();
  for (const { post: p, situacao, verificada } of classificados) {
    if (situacao !== "conta") continue;
    const link = p.links?.[p.rede]?.trim();
    const semLink = `APP:${p.id}:${p.rede}`;
    if (p.manual && !link) continue;
    const chave = link ? chaveDoPost(p.rede, link) : semLink;
    const ja = contados.get(chave);
    const metricas = { ...SEM_TOTAIS };
    for (const m of METRICAS_BADGE)
      metricas[m] = Math.max(p.metricas[m], ja?.metricas[m] ?? 0);
    contados.set(chave, {
      rede: p.rede,
      metricas,
      verificada: verificada || !!ja?.verificada,
      legado: (!p.manual && link ? semLink : undefined) ?? ja?.legado,
    });
  }
  return contados;
}

/**
 * Leitura que cresceu de um jeito que nenhum post cresce de um dia para o
 * outro: 100 vezes, e pelo menos `minimo` a mais (100 mil nas views; nas outras
 * métricas, a marca equivalente da escada). Quase sempre é o scraper lendo
 * outro número. Os badges liberados numa rodada assim esperam aprovação.
 */
export function saltoSuspeito(
  anterior: number,
  nova: number,
  minimo = 100_000,
): boolean {
  return anterior > 0 && nova >= anterior * 100 && nova - anterior >= minimo;
}

/** O que ficou de fora da conta, para a tela explicar (guardado em nft_views.resumo). */
export interface ResumoDosPosts {
  /** Posts publicados do personagem (um por rede em que saiu). */
  posts: number;
  contam: number;
  semAutor: number;
  autorOculto: number;
  outraConta: number;
  outroPersonagem: number;
  semConta: number;
  /** A conta do influencer em cada rede. */
  contas: Array<{ rede: Rede; usuario: string; origem: OrigemConta }>;
}

export function resumir(
  classificados: PostClassificado[],
  minhas: MarcaMinha[],
): ResumoDosPosts {
  const n = (s: Situacao) => classificados.filter((c) => c.situacao === s).length;
  const redes = [...new Set(minhas.map((m) => m.rede))];
  return {
    posts: classificados.length,
    contam: n("conta"),
    semAutor: n("sem_autor"),
    autorOculto: n("autor_oculto"),
    outraConta: n("outra_conta"),
    outroPersonagem: n("outro_personagem"),
    semConta: n("sem_conta"),
    contas: redes.map((rede) => {
      const daRede = minhas.filter((m) => m.rede === rede);
      return {
        rede,
        // O @ quando existe; senão o id da conta na rede.
        usuario: (
          daRede.find((m) => !m.marca.startsWith("id:")) ?? daRede[0]
        ).marca,
        origem: daRede.some((m) => m.origem === "conectada")
          ? ("conectada" as const)
          : ("link" as const),
      };
    }),
  };
}
