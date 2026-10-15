/**
 * Lives gravadas da Twitch e do Kick (VOD ou clipe): do link colado ao vídeo.
 * Usado pelo app (conferir o link e medir a duração, para cobrar) e pelo
 * processo da Sombra (worker/sombra), que baixa o vídeo em pedaços.
 * Só `fetch`, sem dependências: as duas pontas importam este arquivo.
 *
 * - Twitch: a API GraphQL do site (o mesmo Client-Id público do player) dá a
 *   duração e o token de reprodução; o VOD vem em HLS (usher.ttvnw.net), em
 *   pedaços de 10 s. Clipe: MP4 direto, com o token.
 * - Kick: a API do site dá a duração e o HLS (IVS, pedaços de ~10 s); o clipe
 *   também é HLS.
 * VOD só para inscritos (ou apagado) não abre: a pessoa baixa e envia o arquivo.
 */

export type PlataformaVod = "twitch" | "kick";

export interface InfoVod {
  plataforma: PlataformaVod;
  tipo: "vod" | "clipe";
  titulo: string | null;
  canal: string | null;
  thumb: string | null;
  /** Segundos. */
  duracao: number;
}

/** De onde o vídeo é lido: HLS (playlist mestre) ou um MP4 direto. */
export type FonteVod = { hls: string } | { mp4: string };

export class ErroVod extends Error {}

const CLIENT_TWITCH = "kimne78kx3ncx6brgo4mv6wki5h1ko";

type Link =
  | { plataforma: "twitch"; tipo: "vod"; id: string }
  | { plataforma: "twitch"; tipo: "clipe"; id: string }
  | { plataforma: "kick"; tipo: "vod"; id: string }
  | { plataforma: "kick"; tipo: "clipe"; id: string };

/** Reconhece o link (null: não é da Twitch nem do Kick). */
export function lerLinkVod(url: string): Link | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");
  const partes = u.pathname.split("/").filter(Boolean);
  if (host === "clips.twitch.tv" && partes[0]) return { plataforma: "twitch", tipo: "clipe", id: partes[0] };
  if (host === "twitch.tv") {
    if (partes[0] === "videos" && /^\d+$/.test(partes[1] ?? "")) return { plataforma: "twitch", tipo: "vod", id: partes[1] };
    if (partes[1] === "v" && /^\d+$/.test(partes[2] ?? "")) return { plataforma: "twitch", tipo: "vod", id: partes[2] };
    if (partes[1] === "clip" && partes[2]) return { plataforma: "twitch", tipo: "clipe", id: partes[2] };
    return null;
  }
  if (host === "kick.com") {
    const clipe = u.searchParams.get("clip");
    if (clipe) return { plataforma: "kick", tipo: "clipe", id: clipe };
    const iVideos = partes.findIndex((p) => p === "videos" || p === "video");
    if (iVideos >= 0 && partes[iVideos + 1]) return { plataforma: "kick", tipo: "vod", id: partes[iVideos + 1] };
    const iClips = partes.indexOf("clips");
    if (iClips >= 0 && partes[iClips + 1]) return { plataforma: "kick", tipo: "clipe", id: partes[iClips + 1] };
  }
  return null;
}

/** É um link de live gravada da Twitch ou do Kick? */
export const ehLinkVod = (url: string) => lerLinkVod(url) !== null;

async function gqlTwitch<T>(query: string): Promise<T> {
  const r = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: { "Client-Id": CLIENT_TWITCH, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const b = (await r.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
  if (!r.ok || !b?.data) throw new ErroVod(`A Twitch não respondeu (${b?.errors?.[0]?.message ?? `HTTP ${r.status}`}).`);
  return b.data;
}

async function jsonKick<T>(caminho: string): Promise<T> {
  // Sem User-Agent de navegador: o Cloudflare do Kick barra quando ele não bate
  // com a conexão (que não é de um Chrome).
  const r = await fetch(`https://kick.com${caminho}`, { headers: { Accept: "application/json" } });
  if (r.status === 404) throw new ErroVod("Vídeo do Kick não encontrado (apagado ou privado).");
  if (!r.ok) throw new ErroVod(`O Kick recusou a busca do vídeo (HTTP ${r.status}). Baixe e envie o arquivo.`);
  return (await r.json()) as T;
}

const escapar = (s: string) => s.replace(/["\\]/g, "");
const PARAMS_TWITCH = `params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" }`;

/** Confere o link e devolve o que mostrar e cobrar (título, duração…). */
export async function infoDoVod(url: string): Promise<InfoVod> {
  const l = lerLinkVod(url);
  if (!l) throw new ErroVod("Cole o link de um vídeo (VOD) ou clipe da Twitch ou do Kick.");
  if (l.plataforma === "twitch" && l.tipo === "vod") {
    const d = await gqlTwitch<{
      video: { title: string; lengthSeconds: number; previewThumbnailURL: string; owner: { login: string } | null } | null;
    }>(`query { video(id: "${escapar(l.id)}") { title lengthSeconds previewThumbnailURL(width: 640, height: 360) owner { login } } }`);
    if (!d.video) throw new ErroVod("VOD da Twitch não encontrado (apagado ou privado).");
    return {
      plataforma: "twitch",
      tipo: "vod",
      titulo: d.video.title,
      canal: d.video.owner?.login ?? null,
      thumb: d.video.previewThumbnailURL,
      duracao: d.video.lengthSeconds,
    };
  }
  if (l.plataforma === "twitch") {
    const d = await gqlTwitch<{
      clip: { title: string; durationSeconds: number; thumbnailURL: string; broadcaster: { login: string } | null } | null;
    }>(`query { clip(slug: "${escapar(l.id)}") { title durationSeconds thumbnailURL broadcaster { login } } }`);
    if (!d.clip) throw new ErroVod("Clipe da Twitch não encontrado.");
    return {
      plataforma: "twitch",
      tipo: "clipe",
      titulo: d.clip.title,
      canal: d.clip.broadcaster?.login ?? null,
      thumb: d.clip.thumbnailURL,
      duracao: d.clip.durationSeconds,
    };
  }
  if (l.tipo === "vod") {
    const v = await jsonKick<{
      source?: string;
      livestream?: { session_title?: string; duration?: number; thumbnail?: string; channel?: { slug?: string } };
    }>(`/api/v1/video/${encodeURIComponent(l.id)}`);
    if (!v.source || !v.livestream?.duration) throw new ErroVod("Esse vídeo do Kick ainda não está disponível.");
    return {
      plataforma: "kick",
      tipo: "vod",
      titulo: v.livestream.session_title ?? null,
      canal: v.livestream.channel?.slug ?? null,
      thumb: v.livestream.thumbnail ?? null,
      duracao: v.livestream.duration / 1000,
    };
  }
  const c = await jsonKick<{ clip?: { title?: string; duration?: number; thumbnail_url?: string; video_url?: string; channel?: { slug?: string } } }>(
    `/api/v2/clips/${encodeURIComponent(l.id)}`,
  );
  if (!c.clip?.video_url) throw new ErroVod("Clipe do Kick não encontrado.");
  return {
    plataforma: "kick",
    tipo: "clipe",
    titulo: c.clip.title ?? null,
    canal: c.clip.channel?.slug ?? null,
    thumb: c.clip.thumbnail_url ?? null,
    duracao: c.clip.duration ?? 0,
  };
}

/** Onde ler o vídeo agora (os tokens vencem: pedir de novo a cada uso). */
export async function fonteDoVod(url: string): Promise<FonteVod> {
  const l = lerLinkVod(url);
  if (!l) throw new ErroVod("Link inválido.");
  if (l.plataforma === "twitch" && l.tipo === "vod") {
    const d = await gqlTwitch<{ videoPlaybackAccessToken: { value: string; signature: string } | null }>(
      `query { videoPlaybackAccessToken(id: "${escapar(l.id)}", ${PARAMS_TWITCH}) { value signature } }`,
    );
    const t = d.videoPlaybackAccessToken;
    if (!t) throw new ErroVod("A Twitch não liberou esse VOD.");
    const q = new URLSearchParams({ sig: t.signature, token: t.value, allow_source: "true", allow_audio_only: "true", player: "twitchweb" });
    return { hls: `https://usher.ttvnw.net/vod/${l.id}.m3u8?${q}` };
  }
  if (l.plataforma === "twitch") {
    const d = await gqlTwitch<{
      clip: { videoQualities: { quality: string; sourceURL: string }[]; playbackAccessToken: { value: string; signature: string } } | null;
    }>(`query { clip(slug: "${escapar(l.id)}") { videoQualities { quality sourceURL } playbackAccessToken(${PARAMS_TWITCH}) { value signature } } }`);
    const c = d.clip;
    if (!c?.videoQualities?.length) throw new ErroVod("Clipe da Twitch não encontrado.");
    // A melhor qualidade até 720p (o Lucy trabalha em 720p).
    const ordem = [...c.videoQualities].sort((a, b) => Number(b.quality) - Number(a.quality));
    const q = ordem.find((x) => Number(x.quality) <= 720) ?? ordem[ordem.length - 1];
    const sep = q.sourceURL.includes("?") ? "&" : "?";
    return { mp4: `${q.sourceURL}${sep}${new URLSearchParams({ sig: c.playbackAccessToken.signature, token: c.playbackAccessToken.value })}` };
  }
  if (l.tipo === "vod") {
    const v = await jsonKick<{ source?: string }>(`/api/v1/video/${encodeURIComponent(l.id)}`);
    if (!v.source) throw new ErroVod("Esse vídeo do Kick ainda não está disponível.");
    return { hls: v.source };
  }
  const c = await jsonKick<{ clip?: { video_url?: string } }>(`/api/v2/clips/${encodeURIComponent(l.id)}`);
  if (!c.clip?.video_url) throw new ErroVod("Clipe do Kick não encontrado.");
  return /\.m3u8(\?|$)/.test(c.clip.video_url) ? { hls: c.clip.video_url } : { mp4: c.clip.video_url };
}

/* ------------------------------------------------------------------ */
/* HLS: escolher a qualidade e listar os pedaços                         */
/* ------------------------------------------------------------------ */

export interface SegmentoHls {
  url: string;
  /** Segundos. */
  dur: number;
}

/**
 * Da playlist mestre, a variante de vídeo com a maior altura até 720p (o Lucy
 * devolve 720p; mais que isso só pesa no envio). Sem altura informada, a primeira.
 */
export function escolherVariante(mestre: string, base: string): string | null {
  const linhas = mestre.split(/\r?\n/);
  const variantes: { url: string; altura: number; banda: number }[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.startsWith("#EXT-X-STREAM-INF")) continue;
    const prox = linhas.slice(i + 1).find((x) => x && !x.startsWith("#"));
    if (!prox) continue;
    if (/audio_only|audio only/i.test(l) || /audio_only/i.test(prox)) continue;
    const altura = Number(l.match(/RESOLUTION=\d+x(\d+)/)?.[1] ?? 0);
    const banda = Number(l.match(/BANDWIDTH=(\d+)/)?.[1] ?? 0);
    variantes.push({ url: new URL(prox, base).toString(), altura, banda });
  }
  if (!variantes.length) return /#EXTINF/.test(mestre) ? base : null;
  const ate720 = variantes.filter((v) => v.altura && v.altura <= 720);
  const lista = ate720.length ? ate720 : variantes;
  lista.sort((a, b) => b.altura - a.altura || b.banda - a.banda);
  return lista[0].url;
}

/** Os pedaços (.ts) de uma playlist de mídia, com a duração de cada um. */
export function lerSegmentos(playlist: string, base: string): SegmentoHls[] {
  const segs: SegmentoHls[] = [];
  let dur = 0;
  for (const l of playlist.split(/\r?\n/)) {
    if (l.startsWith("#EXTINF:")) dur = Number(l.slice(8).split(",")[0]) || 0;
    else if (l && !l.startsWith("#")) {
      segs.push({ url: new URL(l, base).toString(), dur });
      dur = 0;
    }
  }
  return segs;
}

/** Da playlist mestre (ou de mídia) aos pedaços do vídeo. */
export async function segmentosDoHls(mestreUrl: string): Promise<SegmentoHls[]> {
  const r = await fetch(mestreUrl);
  if (r.status === 403) throw new ErroVod("O vídeo é só para inscritos ou foi bloqueado. Baixe e envie o arquivo.");
  if (!r.ok) throw new ErroVod(`Não consegui abrir o vídeo (HTTP ${r.status}).`);
  const mestre = await r.text();
  const variante = escolherVariante(mestre, mestreUrl);
  if (!variante) throw new ErroVod("O vídeo não tem uma versão que dê para ler.");
  const texto = variante === mestreUrl ? mestre : await (await fetch(variante)).text();
  const segs = lerSegmentos(texto, variante);
  if (!segs.length) throw new ErroVod("O vídeo veio vazio.");
  return segs;
}

/**
 * Agrupa os pedaços do HLS em partes de ~`alvo` segundos, sempre na divisa de
 * um pedaço (começam num quadro-chave: as partes emendam sem buraco).
 */
export function agruparSegmentos(segs: SegmentoHls[], alvo: number): { inicio: number; dur: number; segs: SegmentoHls[] }[] {
  const partes: { inicio: number; dur: number; segs: SegmentoHls[] }[] = [];
  let atual: { inicio: number; dur: number; segs: SegmentoHls[] } | null = null;
  let t = 0;
  for (const s of segs) {
    if (!atual || atual.dur >= alvo) {
      atual = { inicio: t, dur: 0, segs: [] };
      partes.push(atual);
    }
    atual.segs.push(s);
    atual.dur += s.dur;
    t += s.dur;
  }
  // Uma sobra curta no fim vai junto com a parte anterior.
  const ultima = partes[partes.length - 1];
  if (partes.length > 1 && ultima.dur < alvo / 4) {
    const anterior = partes[partes.length - 2];
    anterior.segs.push(...ultima.segs);
    anterior.dur += ultima.dur;
    partes.pop();
  }
  return partes;
}
