import type { Metricas } from "./metricas";
import type { Rede } from "./redes";

/**
 * Métricas de um post pelo link público (post feito à mão, fora do app).
 * Só o que não depende de servidor: reconhecer a rede e ler o resultado do
 * scraper. A chamada ao Apify fica em ./link-apify.ts.
 */

/** Rede do link de um post (null = não é link de post de uma rede suportada). */
export function detectarRedeDoLink(url: string): Rede | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m|mobile|vm|vt)\./, "");
  const caminho = u.pathname;
  if (/(^|\.)tiktok\.com$/.test(host)) return "TIKTOK";
  if (host === "instagram.com" && /^\/([^/]+\/)?(reel|reels|p|tv)\//.test(caminho))
    return "INSTAGRAM";
  if (host === "youtu.be" || (/(^|\.)youtube\.com$/.test(host) && /^\/(shorts|watch)/.test(caminho)))
    return "YOUTUBE";
  if ((host === "x.com" || host === "twitter.com") && /\/status\/\d+/.test(caminho))
    return "TWITTER";
  if (/(^|\.)linkedin\.com$/.test(host) && /^\/(posts|feed\/update)\//.test(caminho))
    return "LINKEDIN";
  // Link curto do "Copiar link" do LinkedIn.
  if (host === "lnkd.in" && caminho.length > 1) return "LINKEDIN";
  return null;
}

/** Link sem rastreio (query e #), pra não cadastrar o mesmo post duas vezes. */
export function limparLink(url: string): string {
  const u = new URL(url.trim());
  const v = u.searchParams.get("v");
  u.search = v && /youtube\.com$/.test(u.hostname) ? `?v=${v}` : "";
  u.hash = "";
  return u.toString();
}

type Item = Record<string, unknown>;

// Nomes que os scrapers usam para cada número (um por rede; a ordem importa).
const CHAVES: Record<keyof Metricas, string[]> = {
  views: ["playCount", "videoPlayCount", "videoViewCount", "viewCount", "views", "impressions"],
  curtidas: ["diggCount", "likesCount", "likeCount", "numLikes", "likes"],
  comentarios: ["commentCount", "commentsCount", "replyCount", "numComments", "comments"],
  reposts: ["retweetCount", "shareCount", "numShares", "repostCount", "reposts", "shares"],
  quotes: ["quoteCount", "quotes"],
  salvos: ["collectCount", "bookmarkCount", "saves"],
};
const CHAVES_DATA = ["createTimeISO", "timestamp", "postedAtISO", "date", "createdAt", "postedAt"];
const CHAVES_TEXTO = ["text", "caption", "title", "fullText"];

function numero(item: Item, chaves: string[]): number {
  for (const k of chaves) {
    const v = item[k];
    // Curtidas ocultas no Instagram vêm como -1.
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  }
  return 0;
}

// Onde cada scraper põe o autor do post: o @, o id dele na rede e o link do perfil.
const CHAVES_AUTOR = [
  "ownerUsername",
  "authorMeta.name",
  "author.userName",
  "author.username",
  "channelUsername",
  "authorUsername",
  "username",
];
const CHAVES_ID_AUTOR = ["ownerId", "authorMeta.id", "author.id", "channelId", "authorId"];
const CHAVES_PERFIL = ["channelUrl", "authorMeta.profileUrl", "author.url", "authorUrl"];

function campo(item: Item, caminho: string): string {
  let v: unknown = item;
  for (const parte of caminho.split(".")) {
    if (!v || typeof v !== "object") return "";
    v = (v as Item)[parte];
  }
  return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
}

/**
 * Autor do post no resultado do scraper, como marcas separadas por espaço:
 * o @ em minúsculas e "id:<id na rede>" (ex.: "lilanova id:6812345"). É o que
 * a regra dos badges compara com as contas conectadas (lib/nft/views.ts).
 * Vazio = o scraper não informou.
 */
export function lerAutorDoItem(item: Item): string {
  const marcas = new Set<string>();
  const arroba = (s: string) =>
    s.replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  for (const k of CHAVES_AUTOR) {
    const v = arroba(campo(item, k));
    if (v && !/\s/.test(v)) marcas.add(v);
  }
  for (const k of CHAVES_PERFIL) {
    // youtube.com/@canal · tiktok.com/@perfil
    const v = campo(item, k).match(/\/@([^/?#]+)/)?.[1];
    if (v) marcas.add(arroba(decodeURIComponent(v)));
  }
  for (const k of CHAVES_ID_AUTOR) {
    const v = campo(item, k);
    if (v && !/\s/.test(v)) marcas.add(`id:${v}`);
  }
  return [...marcas].join(" ").slice(0, 300);
}

export interface LeituraDoLink {
  metricas: Metricas;
  /** Data da publicação (null = o scraper não informou). */
  quando: Date | null;
  texto: string;
  /** Autor do post (ver lerAutorDoItem). Vazio = não informado. */
  autor?: string;
}

/** Lê os números do post no resultado do scraper. */
export function lerMetricasDoItem(item: Item): LeituraDoLink {
  let quando: Date | null = null;
  for (const k of CHAVES_DATA) {
    const v = item[k];
    const d = typeof v === "string" || typeof v === "number" ? new Date(v) : null;
    if (d && !Number.isNaN(d.getTime())) {
      quando = d;
      break;
    }
  }
  const texto = CHAVES_TEXTO.map((k) => item[k]).find(
    (v): v is string => typeof v === "string" && !!v.trim(),
  );
  return {
    metricas: {
      views: numero(item, CHAVES.views),
      curtidas: numero(item, CHAVES.curtidas),
      comentarios: numero(item, CHAVES.comentarios),
      reposts: numero(item, CHAVES.reposts),
      quotes: numero(item, CHAVES.quotes),
      salvos: numero(item, CHAVES.salvos),
    },
    quando,
    texto: (texto ?? "").trim().slice(0, 5000),
    autor: lerAutorDoItem(item),
  };
}

/**
 * Lê um post do LinkedIn pela página pública dele (dados estruturados do
 * próprio LinkedIn): reações, comentários e data. Views/impressões só o autor
 * vê, então ficam em zero. null = a página não é de um post (ex.: tela de login).
 */
export function lerPaginaLinkedIn(html: string): LeituraDoLink | null {
  const bruto = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];
  let ld: Item;
  try {
    ld = JSON.parse(bruto ?? "") as Item;
  } catch {
    return null;
  }
  if (!ld || typeof ld !== "object" || !("interactionStatistic" in ld))
    return null;
  const contadores = Array.isArray(ld.interactionStatistic)
    ? (ld.interactionStatistic as Item[])
    : [];
  const contar = (acao: string) => {
    const c = contadores.find((x) => String(x.interactionType).endsWith(acao));
    return typeof c?.userInteractionCount === "number" ? c.userInteractionCount : 0;
  };
  const atributo = (nome: string) =>
    Number(html.match(new RegExp(`data-num-${nome}="(\\d+)"`))?.[1] ?? 0);
  const quando = new Date(String(ld.datePublished ?? ld.uploadDate ?? ""));
  const texto = [ld.articleBody, ld.description, ld.headline, ld.name].find(
    (v): v is string => typeof v === "string" && !!v.trim(),
  );
  return {
    metricas: {
      views: 0,
      curtidas: Math.max(contar("LikeAction"), atributo("reactions")),
      comentarios: Math.max(
        contar("CommentAction"),
        typeof ld.commentCount === "number" ? ld.commentCount : 0,
        atributo("comments"),
      ),
      reposts: atributo("reposts"),
      quotes: 0,
      salvos: 0,
    },
    quando: Number.isNaN(quando.getTime()) ? null : quando,
    texto: (texto ?? "").trim().slice(0, 5000),
  };
}
