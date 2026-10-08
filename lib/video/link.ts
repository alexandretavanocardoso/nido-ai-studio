import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { abrirDownloadSeguro } from "./destino-seguro";

/**
 * Vídeo por link (TikTok, Instagram, YouTube Shorts ou arquivo direto).
 * O Apify ("actors" de scraping) acha o arquivo do vídeo; o servidor baixa
 * pra uma pasta temporária, mede e entrega à IA pelo storage temporário do
 * fal — o vídeo de origem NÃO vai pro S3. Só o vídeo gerado é salvo.
 *
 * Actors configuráveis por env (dá pra trocar sem mexer no código):
 *   APIFY_ACTOR_TIKTOK     padrão clockworks/tiktok-scraper
 *   APIFY_ACTOR_INSTAGRAM  padrão apify/instagram-scraper
 *   APIFY_ACTOR_YOUTUBE    padrão maximedupre/youtube-shorts-downloader (só Shorts)
 */
export type Plataforma = "tiktok" | "instagram" | "youtube" | "direto";

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
  if (/\.(mp4|mov|webm)$/i.test(u.pathname)) return "direto";
  return null;
}

function ator(p: Exclude<Plataforma, "direto">): string {
  const padrao = {
    tiktok: "clockworks/tiktok-scraper",
    instagram: "apify/instagram-scraper",
    youtube: "maximedupre/youtube-shorts-downloader",
  }[p];
  const env = {
    tiktok: "APIFY_ACTOR_TIKTOK",
    instagram: "APIFY_ACTOR_INSTAGRAM",
    youtube: "APIFY_ACTOR_YOUTUBE",
  }[p];
  return (process.env[env]?.trim() || padrao).replace("/", "~");
}

function entradaAtor(
  p: Exclude<Plataforma, "direto">,
  url: string,
): Record<string, unknown> {
  if (p === "tiktok")
    return { postURLs: [url], shouldDownloadVideos: true, resultsPerPage: 1 };
  if (p === "instagram")
    return { directUrls: [url], resultsType: "posts", resultsLimit: 1 };
  return { shortUrls: [url], preferredResolution: "1080p" };
}

export interface VideoDoLink {
  plataforma: Plataforma;
  videoUrl: string;
  /** Áudio separado (YouTube em 1080p vem sem som; o servidor junta). */
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
    duracao = num(item.videoDuration);
    titulo = txt(item.caption);
    autor = txt(item.ownerUsername);
    thumb = txt(item.displayUrl);
  } else if (p === "youtube") {
    videoUrl = txt(item.bestDownloadUrl);
    if (
      !txt(obj(item.bestFormat).audioCodec) ||
      obj(item.bestFormat).audioCodec === "none"
    )
      audioUrl = txt(item.audioDownloadUrl);
    duracao = num(item.durationSeconds);
    titulo = txt(item.title);
    autor = txt(item.channelName);
    thumb = txt(item.thumbnailUrl);
  }
  if (!videoUrl) {
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

/** Acha o arquivo de vídeo do link (Apify para redes sociais; direto para .mp4/.mov/.webm). */
export async function resolverLink(url: string): Promise<VideoDoLink> {
  const p = detectarPlataforma(url);
  if (!p)
    throw new LinkError(
      "Link não suportado. Use TikTok, Instagram (reel/post), YouTube Shorts ou um link direto de .mp4.",
    );
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
    `https://api.apify.com/v2/acts/${ator(p)}/run-sync-get-dataset-items?timeout=120&clean=true`,
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
    throw new LinkError(
      motivo
        ? `Não consegui pegar o vídeo: ${motivo}`
        : p === "youtube"
          ? "Não achei o vídeo. Para YouTube, só Shorts públicos são aceitos."
          : "Não achei o vídeo nesse link (é público? é um vídeo?).",
    );
  }
  return video;
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
