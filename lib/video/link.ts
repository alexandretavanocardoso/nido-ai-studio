import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { abrirDownloadSeguro } from "./destino-seguro";

/**
 * Vídeo por link (TikTok, Instagram, YouTube Shorts, X ou arquivo direto).
 * O Apify ("actors" de scraping) acha o arquivo do vídeo — no X, quem acha é
 * o twitterapi.io (TWITTER_API_KEY), que já devolve o .mp4; o servidor baixa
 * pra uma pasta temporária, mede e entrega à IA pelo storage temporário do
 * fal — o vídeo de origem NÃO vai pro S3. Só o vídeo gerado é salvo.
 *
 * Actors configuráveis por env (dá pra trocar sem mexer no código):
 *   APIFY_ACTOR_TIKTOK     padrão clockworks/tiktok-scraper
 *   APIFY_ACTOR_INSTAGRAM  padrão apify/instagram-scraper
 *   APIFY_ACTOR_YOUTUBE    padrão streamers/youtube-video-downloader
 *
 * No YouTube o actor tem que GUARDAR o arquivo (no Apify): o link direto do
 * YouTube é assinado para o IP de quem o pediu e dá 403 em qualquer outro
 * servidor — foi por isso que o maximedupre/youtube-shorts-downloader, que só
 * devolve esse link, parou de servir.
 */
export type Plataforma = "tiktok" | "instagram" | "youtube" | "x" | "direto";
/** Redes buscadas pelo Apify. */
type PlataformaApify = Exclude<Plataforma, "direto" | "x">;

/** Id do post num link do X/Twitter (x.com/perfil/status/123…), ou null. */
export function idDoPostNoX(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\.|^mobile\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    return u.pathname.match(/^\/[^/]+\/status(?:es)?\/(\d{5,25})/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Maior arquivo de vídeo aceito por link. */
export const LINK_MAX_BYTES = 300 * 1024 * 1024;

export function detectarPlataforma(url: string): Plataforma | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (
    /(^|\.)instagram\.com$/.test(host) &&
    /^\/(reel|reels|p|tv)\//.test(u.pathname)
  )
    return "instagram";
  if (
    host === "youtu.be" ||
    (/(^|\.)youtube\.com$/.test(host) && /^\/(shorts|watch)/.test(u.pathname))
  )
    return "youtube";
  if (idDoPostNoX(url)) return "x";
  if (/\.(mp4|mov|webm)$/i.test(u.pathname)) return "direto";
  return null;
}

function ator(p: PlataformaApify): string {
  const padrao = {
    tiktok: "clockworks/tiktok-scraper",
    instagram: "apify/instagram-scraper",
    youtube: "streamers/youtube-video-downloader",
  }[p];
  const env = {
    tiktok: "APIFY_ACTOR_TIKTOK",
    instagram: "APIFY_ACTOR_INSTAGRAM",
    youtube: "APIFY_ACTOR_YOUTUBE",
  }[p];
  return (process.env[env]?.trim() || padrao).replace("/", "~");
}

function entradaAtor(
  p: PlataformaApify,
  url: string,
): Record<string, unknown> {
  if (p === "tiktok")
    return { postURLs: [url], shouldDownloadVideos: true, resultsPerPage: 1 };
  if (p === "instagram")
    return { directUrls: [url], resultsType: "posts", resultsLimit: 1 };
  return {
    videos: [{ url }],
    // Guarda o arquivo no Apify (some em ~3 dias): é o que dá para baixar daqui.
    storeInKVStore: true,
    // O actor limita pela ALTURA: num Short (vertical) "1440p" dá 720×1280 e
    // "1080p" cairia para 480×854. Vídeo deitado fica em 1280×720. Cobra por MB.
    preferredQuality:
      process.env.APIFY_YOUTUBE_QUALIDADE?.trim() ||
      (/\/shorts\//.test(url) ? "1440p" : "720p"),
    preferredFormat: "mp4",
  };
}

/** Segundos que o Apify espera o actor terminar (o do YouTube baixa e guarda o arquivo: ~1–2 min). */
const esperaAtor = (p: PlataformaApify) => (p === "youtube" ? 240 : 120);

export interface VideoDoLink {
  plataforma: Plataforma;
  videoUrl: string;
  /** Áudio separado (YouTube em 1080p e Reels do Instagram vêm sem som; o servidor junta). */
  audioUrl?: string | null;
  duracao: number | null;
  titulo: string | null;
  autor: string | null;
  thumb: string | null;
}

type Item = Record<string, unknown>;
const txt = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Item) : {});

/** Lê o resultado do actor (cada um tem seu formato; cai num "procura o .mp4" genérico). */
export function lerItem(p: Plataforma, item: Item): VideoDoLink | null {
  let videoUrl: string | null = null;
  let duracao: number | null = null;
  let titulo: string | null = null;
  let autor: string | null = null;
  let thumb: string | null = null;
  let audioUrl: string | null = null;
  if (p === "tiktok") {
    const meta = obj(item.videoMeta);
    videoUrl =
      txt((item.mediaUrls as unknown[] | undefined)?.[0]) ??
      txt(meta.downloadAddr);
    duracao = num(meta.duration);
    titulo = txt(item.text);
    autor = txt(obj(item.authorMeta).name);
    thumb = txt(meta.coverUrl);
  } else if (p === "instagram") {
    videoUrl = txt(item.videoUrl);
    // Reels costumam vir com a imagem e o som em arquivos separados: o
    // `videoUrl` é só a imagem e o som vem em `audioUrl` (o servidor junta).
    audioUrl =
      txt(item.audioUrl) ??
      txt(obj(item.musicInfo).audio_url) ??
      txt(obj(item.musicInfo).audioUrl);
    duracao = num(item.videoDuration);
    titulo = txt(item.caption);
    autor = txt(item.ownerUsername);
    thumb = txt(item.displayUrl);
  } else if (p === "youtube") {
    // Arquivo guardado no Apify (já com áudio). `bestDownloadUrl` é o formato
    // do actor antigo: link direto do YouTube, com o áudio à parte.
    videoUrl = txt(item.downloadedFileUrl);
    if (!videoUrl) {
      videoUrl = txt(item.bestDownloadUrl);
      if (
        !txt(obj(item.bestFormat).audioCodec) ||
        obj(item.bestFormat).audioCodec === "none"
      )
        audioUrl = txt(item.audioDownloadUrl);
    }
    duracao = num(item.durationSeconds);
    titulo = txt(item.title);
    autor = txt(item.channelName);
    const id = txt(item.id) ?? txt(item.videoId);
    thumb =
      txt(item.thumbnailUrl) ??
      (id && /^[\w-]{11}$/.test(id)
        ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        : null);
  } else if (p === "x") {
    // Post do twitterapi.io: o vídeo vem em várias qualidades; fica o .mp4 de
    // maior bitrate. Sem vídeo no post, vale o do post citado ou repostado.
    const midiaDe = (t: Item) =>
      ((obj(t.extendedEntities).media as Item[] | undefined) ?? []).find(
        (m) => m.type === "video" || m.type === "animated_gif",
      );
    const midia =
      midiaDe(item) ??
      midiaDe(obj(item.quoted_tweet)) ??
      midiaDe(obj(item.retweeted_tweet));
    const info = obj(midia?.video_info);
    const melhor = ((info.variants as Item[] | undefined) ?? [])
      .filter((v) => v.content_type === "video/mp4" && txt(v.url))
      .sort((a, b) => (num(b.bitrate) ?? 0) - (num(a.bitrate) ?? 0))[0];
    videoUrl = txt(melhor?.url);
    const ms = num(info.duration_millis);
    duracao = ms ? ms / 1000 : null;
    // O texto do post termina com o link curto da própria mídia: sai do título.
    titulo = txt(txt(item.text)?.replace(/\s*https:\/\/t\.co\/\w+\s*$/, ""));
    autor = txt(obj(item.author).userName);
    thumb = txt(midia?.media_url_https);
  }
  // No X não há "procura genérica": o post tem muitos links que não são o vídeo.
  if (!videoUrl && p !== "x") {
    // Actor trocado por env: procura qualquer campo com cara de link de vídeo.
    for (const [k, v] of Object.entries(item)) {
      const s = txt(v);
      if (
        s &&
        /^https?:\/\//.test(s) &&
        (/video|download|media/i.test(k) || /\.(mp4|mov|webm)(\?|$)/i.test(s))
      ) {
        videoUrl = s;
        break;
      }
    }
  }
  return videoUrl
    ? {
        plataforma: p,
        videoUrl,
        audioUrl,
        duracao,
        titulo: titulo?.slice(0, 140) ?? null,
        autor,
        thumb,
      }
    : null;
}

export class LinkError extends Error {}

/** Token do Apify (aceita os dois nomes usados no console). */
export function tokenApify(): string | null {
  return (
    process.env.APIFY_TOKEN?.trim() ||
    process.env.APIFY_API_TOKEN?.trim() ||
    null
  );
}

/** Post do X pelo twitterapi.io (devolve os .mp4 do vídeo em todas as qualidades). */
async function resolverPostDoX(url: string): Promise<VideoDoLink> {
  const chave = process.env.TWITTER_API_KEY?.trim();
  if (!chave)
    throw new LinkError("Busca de vídeos do X não configurada (TWITTER_API_KEY).");
  let res: Response;
  try {
    res = await fetch(
      `https://api.twitterapi.io/twitter/tweets?tweet_ids=${idDoPostNoX(url)}`,
      { headers: { "X-API-Key": chave }, signal: AbortSignal.timeout(30_000) },
    );
  } catch {
    throw new LinkError("A busca do vídeo demorou demais. Tente de novo.");
  }
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    console.error("[link] twitterapi", res.status, corpo.slice(0, 300));
    if (res.status === 402) throw new LinkError("Sem créditos no twitterapi.io.");
    throw new LinkError(
      `Não consegui buscar o vídeo (twitterapi.io HTTP ${res.status}).`,
    );
  }
  const corpo = (await res.json().catch(() => null)) as {
    tweets?: Item[];
  } | null;
  const post = corpo?.tweets?.[0];
  if (!post)
    throw new LinkError("Não achei esse post no X (é público? foi apagado?).");
  const video = lerItem("x", post);
  if (!video) throw new LinkError("Esse post do X não tem vídeo.");
  return video;
}

/** Acha o arquivo de vídeo do link (Apify ou twitterapi.io para redes sociais; direto para .mp4/.mov/.webm). */
export async function resolverLink(url: string): Promise<VideoDoLink> {
  const p = detectarPlataforma(url);
  if (!p)
    throw new LinkError(
      "Link não suportado. Use TikTok, Instagram (reel/post), YouTube Shorts, X (post com vídeo) ou um link direto de .mp4.",
    );
  if (p === "x") return resolverPostDoX(url);
  if (p === "direto")
    return {
      plataforma: p,
      videoUrl: url.trim(),
      duracao: null,
      titulo: null,
      autor: null,
      thumb: null,
    };

  const token = tokenApify();
  if (!token)
    throw new LinkError("Busca por link não configurada (APIFY_TOKEN).");
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ator(p)}/run-sync-get-dataset-items?timeout=${esperaAtor(p)}&clean=true`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entradaAtor(p, url.trim())),
    },
  );
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    console.error("[link] apify", res.status, corpo.slice(0, 300));
    if (res.status === 402) throw new LinkError("Sem créditos no Apify.");
    if (res.status === 408)
      throw new LinkError("A busca do vídeo demorou demais. Tente de novo.");
    throw new LinkError(
      `Não consegui buscar o vídeo (Apify HTTP ${res.status}).`,
    );
  }
  const itens = (await res.json()) as Item[];
  const item = itens.find((i) => !i.error && !i.errorDescription) ?? itens[0];
  const video = item ? lerItem(p, item) : null;
  if (!video) {
    const motivo = txt(item?.error) ?? txt(item?.errorDescription);
    // A rede só mostra o post para quem está logado (conta privada, restrição
    // de idade ou de país): quem busca o vídeo entra sem login e não o vê.
    if (motivo && /restricted|private|login|not_?found/i.test(motivo)) {
      console.warn("[link] post restrito:", p, motivo);
      throw new LinkError(
        "Esse post é restrito (conta privada, restrição de idade ou de país) e só abre para quem está logado, então não dá para pegar pelo link. Baixe o vídeo e envie o arquivo.",
      );
    }
    throw new LinkError(
      motivo
        ? `Não consegui pegar o vídeo: ${motivo}.`
        : p === "youtube"
          ? "Não achei o vídeo. Para YouTube, só Shorts públicos são aceitos."
          : "Não achei o vídeo nesse link (é público? é um vídeo?).",
    );
  }
  // O actor do YouTube não devolve título nem canal: pega do próprio YouTube.
  if (p === "youtube" && !video.titulo) {
    const dados = await dadosDoYouTube(url.trim());
    video.titulo = dados.titulo?.slice(0, 140) ?? null;
    video.autor ??= dados.autor;
  }
  return video;
}

/** Título e canal de um vídeo público do YouTube (oEmbed, sem chave). Vazio se não responder. */
async function dadosDoYouTube(
  url: string,
): Promise<{ titulo: string | null; autor: string | null }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return { titulo: null, autor: null };
    const j = obj(await res.json());
    return { titulo: txt(j.title), autor: txt(j.author_name) };
  } catch {
    return { titulo: null, autor: null };
  }
}

/** Baixa o vídeo pra um arquivo local (com limite de tamanho). Links do Apify levam o token. */
export async function baixarVideo(
  url: string,
  destino: string,
  aceitarAudio = false,
): Promise<number> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (NIDO Studio)",
  };
  const token = tokenApify();
  if (/^https:\/\/api\.apify\.com\//.test(url) && token)
    headers.Authorization = `Bearer ${token}`;
  // Cada salto é conferido e a conexão só abre em endereço público: um link
  // público não pode levar o servidor a um endereço interno (ver ./destino-seguro.ts).
  let atual = url;
  let res: IncomingMessage;
  for (let salto = 0; ; salto++) {
    try {
      res = await abrirDownloadSeguro(
        atual,
        // O token do Apify só vai para o próprio Apify, nunca para onde ele redirecionar.
        salto === 0 ? headers : { "User-Agent": headers["User-Agent"] },
      );
    } catch (e) {
      throw new LinkError(
        `O vídeo não pôde ser baixado: ${(e as Error).message}`,
      );
    }
    const status = res.statusCode ?? 0;
    const para = res.headers.location;
    if (status < 300 || status >= 400 || !para) break;
    res.destroy();
    if (salto >= 5) throw new LinkError("O link redireciona vezes demais.");
    atual = new URL(para, atual).toString();
  }
  const status = res.statusCode ?? 0;
  if (status < 200 || status >= 300) {
    res.destroy();
    throw new LinkError(
      `O vídeo não pôde ser baixado (HTTP ${status}). O link pode ter expirado.`,
    );
  }
  const tamanho = Number(res.headers["content-length"] ?? 0);
  const tipo = res.headers["content-type"] ?? "";
  const tipoErrado =
    !!tipo &&
    !(
      aceitarAudio
        ? /video|audio|octet-stream|binary/i
        : /video|octet-stream|binary/i
    ).test(tipo);
  if (tamanho > LINK_MAX_BYTES || tipoErrado) {
    res.destroy();
    throw new LinkError(
      tipoErrado
        ? "O link não aponta para um arquivo de vídeo."
        : "Vídeo grande demais (máx. 300 MB).",
    );
  }
  // Corta o download ao passar do limite, mesmo sem content-length (não enche o disco).
  let recebido = 0;
  const limite = new Transform({
    transform(pedaco: Buffer, _enc, pronto) {
      recebido += pedaco.length;
      pronto(
        recebido > LINK_MAX_BYTES
          ? new LinkError("Vídeo grande demais (máx. 300 MB).")
          : null,
        pedaco,
      );
    },
  });
  await pipeline(res, limite, createWriteStream(destino));
  const { size } = await stat(destino);
  if (size > LINK_MAX_BYTES)
    throw new LinkError("Vídeo grande demais (máx. 300 MB).");
  return size;
}
