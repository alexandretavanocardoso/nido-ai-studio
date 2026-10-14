import { createVerify } from "node:crypto";
import type { Pool } from "@neondatabase/serverless";
import type { LiveRow } from "./server";

/**
 * Chat da live lido pelo servidor, pelas APIs oficiais:
 *  - YouTube (YOUTUBE_API_KEY): a página do operador pergunta de tempos em
 *    tempos e, quando dá a hora, o servidor busca as mensagens novas
 *    (liveChatMessages.list, 5 unidades da cota por busca).
 *  - Kick (KICK_CLIENT_ID e KICK_CLIENT_SECRET): o app se inscreve no evento
 *    chat.message.sent do canal e o Kick manda cada mensagem para o webhook
 *    /api/live/kick/webhook.
 *  - Discord (DISCORD_BOT_TOKEN): o bot do NIDO (worker/discord, processo
 *    sempre ligado) entra no canal de voz ou palco, fala com a voz do avatar
 *    e grava aqui as mensagens do chat do canal.
 * As mensagens vão para a tabela live_chat; a página lê as novas por id.
 * (O chat da Twitch é lido direto no navegador — components/live/chat-twitch.ts.)
 */
export interface ChatYoutube {
  videoId: string;
  liveChatId: string;
  pageToken?: string;
  /** Quando pode buscar de novo (ms). */
  proxima: number;
}

export interface ChatKick {
  slug: string;
  broadcasterId: number;
  subscriptionId?: string;
}

/** Estado do bot do Discord no canal (quem escreve é o bot: worker/discord). */
export type EstadoDiscord =
  | "aguardando"
  | "conectando"
  | "no_canal"
  | "pedindo_para_falar"
  | "erro";

export interface ChatDiscord {
  guildId: string;
  channelId: string;
  /** Nome do canal (para mostrar). */
  nome?: string;
  palco?: boolean;
  estado?: EstadoDiscord;
  erro?: string;
}

export interface ChatConfig {
  youtube?: ChatYoutube;
  kick?: ChatKick;
  discord?: ChatDiscord;
}

export type OrigemChat = "youtube" | "kick" | "discord";

export interface MensagemServidor {
  id: number;
  origem: OrigemChat;
  autor: string;
  texto: string;
}

/** Erro com mensagem pronta para a pessoa. */
export class RecusaChat extends Error {}

/* ------------------------------------------------------------------ */
/* Leitura das mensagens novas                                          */
/* ------------------------------------------------------------------ */

/**
 * Mensagens depois de `cursor` (o maior id que a página já viu). Sem cursor,
 * só devolve onde o chat está agora: a página começa do zero, sem o que veio
 * antes de ela abrir.
 */
export async function mensagensNovas(
  pool: Pool,
  liveId: string,
  cursor: number | null,
): Promise<{ mensagens: MensagemServidor[]; cursor: number }> {
  if (cursor === null) {
    const { rows } = await pool.query<{ max: string | null }>(
      "select max(id) as max from live_chat where live_id = $1",
      [liveId],
    );
    return { mensagens: [], cursor: Number(rows[0]?.max ?? 0) };
  }
  const { rows } = await pool.query<MensagemServidor & { id: string }>(
    `select id, origem, autor, texto from live_chat
      where live_id = $1 and id > $2 order by id limit 100`,
    [liveId, cursor],
  );
  const mensagens = rows.map((r) => ({ ...r, id: Number(r.id) }));
  return { mensagens, cursor: mensagens.at(-1)?.id ?? cursor };
}

async function guardar(
  pool: Pool,
  liveId: string,
  origem: OrigemChat,
  itens: Array<{ extId: string; autor: string; texto: string }>,
) {
  const validos = itens.filter((i) => i.texto.trim());
  if (!validos.length) return;
  await pool.query(
    `insert into live_chat (live_id, origem, ext_id, autor, texto)
     select $1, $2, e, a, t from unnest($3::text[], $4::text[], $5::text[]) as x(e, a, t)
     on conflict do nothing`,
    [
      liveId,
      origem,
      validos.map((i) => i.extId),
      validos.map((i) => i.autor.slice(0, 60)),
      validos.map((i) => i.texto.slice(0, 600)),
    ],
  );
}

async function salvarChat(pool: Pool, liveId: string, chat: ChatConfig) {
  await pool.query("update lives set chat = $2 where id = $1", [
    liveId,
    JSON.stringify(chat),
  ]);
}

/* ------------------------------------------------------------------ */
/* YouTube                                                              */
/* ------------------------------------------------------------------ */

const YT = "https://www.googleapis.com/youtube/v3";
/** Intervalo mínimo entre buscas: a cota padrão (10 mil/dia) dá ~4h de live por dia. */
const YT_INTERVALO_MIN = 8000;

/** Id do vídeo a partir do link (watch, youtu.be, /live/, /shorts/) ou do próprio id. */
export function idDoVideoYoutube(texto: string): string | null {
  const t = texto.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname)) return null;
    const v =
      u.searchParams.get("v") ??
      (u.hostname.endsWith("youtu.be")
        ? u.pathname.slice(1)
        : u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})/)?.[1]);
    return v && /^[\w-]{11}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function chaveYoutube(): string {
  const k = process.env.YOUTUBE_API_KEY?.trim();
  if (!k)
    throw new RecusaChat(
      "Chat do YouTube não configurado no servidor (YOUTUBE_API_KEY).",
    );
  return k;
}

async function chamarYoutube<T>(caminho: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ ...params, key: chaveYoutube() });
  const res = await fetch(`${YT}/${caminho}?${q}`, { cache: "no-store" });
  const b = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  };
  if (!res.ok) {
    const motivo = b.error?.errors?.[0]?.reason ?? "";
    if (/quota/i.test(motivo))
      throw new RecusaChat("A cota diária da API do YouTube acabou. Volta amanhã.");
    if (motivo === "liveChatEnded" || motivo === "liveChatNotFound")
      throw new RecusaChat("O chat dessa live do YouTube terminou ou não foi encontrado.");
    if (motivo === "liveChatDisabled")
      throw new RecusaChat("O chat dessa live do YouTube está desligado.");
    throw new RecusaChat(
      `O YouTube recusou o pedido (HTTP ${res.status}${b.error?.message ? `: ${b.error.message}` : ""}).`,
    );
  }
  return b;
}

interface PaginaYoutube {
  items?: Array<{
    id: string;
    snippet?: { type?: string; displayMessage?: string };
    authorDetails?: { displayName?: string };
  }>;
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  offlineAt?: string;
}

/** Liga o chat do YouTube na live: acha o chat do vídeo e começa a partir de agora. */
export async function ligarYoutube(pool: Pool, live: LiveRow, link: string): Promise<ChatConfig> {
  const videoId = idDoVideoYoutube(link);
  if (!videoId) throw new RecusaChat("Cole o link da live do YouTube (ou o id do vídeo).");
  const v = await chamarYoutube<{
    items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }>;
  }>("videos", { part: "liveStreamingDetails", id: videoId });
  const liveChatId = v.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
  if (!liveChatId)
    throw new RecusaChat(
      "Esse vídeo não está ao vivo agora (ou o chat dele está desligado).",
    );
  // A primeira busca traz as mensagens recentes: ficam de fora, a fila começa agora.
  const p = await chamarYoutube<PaginaYoutube>("liveChat/messages", {
    liveChatId,
    part: "id",
  });
  const chat: ChatConfig = {
    ...live.chat,
    youtube: {
      videoId,
      liveChatId,
      pageToken: p.nextPageToken,
      proxima: Date.now() + Math.max(YT_INTERVALO_MIN, p.pollingIntervalMillis ?? 0),
    },
  };
  await salvarChat(pool, live.id, chat);
  return chat;
}

/**
 * Busca as mensagens novas do YouTube, se já deu a hora. Só uma chamada busca
 * por vez (a que consegue marcar a próxima hora), mesmo com duas abas abertas.
 */
export async function lerYoutube(pool: Pool, live: LiveRow): Promise<void> {
  const yt = live.chat.youtube;
  if (!yt || Date.now() < yt.proxima) return;
  const { rowCount } = await pool.query(
    `update lives set chat = jsonb_set(chat, '{youtube,proxima}', to_jsonb($2::bigint))
      where id = $1 and (chat->'youtube'->>'proxima')::bigint = $3`,
    [live.id, Date.now() + YT_INTERVALO_MIN, yt.proxima],
  );
  if (!rowCount) return;
  let p: PaginaYoutube;
  try {
    p = await chamarYoutube<PaginaYoutube>("liveChat/messages", {
      liveChatId: yt.liveChatId,
      part: "snippet,authorDetails",
      ...(yt.pageToken ? { pageToken: yt.pageToken } : {}),
    });
  } catch (e) {
    // Chat que acabou: para de buscar. Outros erros: tenta de novo na próxima hora.
    if (e instanceof RecusaChat && /terminou|desligado/.test(e.message)) {
      const { youtube: _, ...resto } = live.chat;
      await salvarChat(pool, live.id, resto);
    }
    throw e;
  }
  await guardar(
    pool,
    live.id,
    "youtube",
    (p.items ?? [])
      .filter((i) => !i.snippet?.type || i.snippet.type === "textMessageEvent" || i.snippet.type === "superChatEvent")
      .map((i) => ({
        extId: i.id,
        autor: i.authorDetails?.displayName ?? "",
        texto: i.snippet?.displayMessage ?? "",
      })),
  );
  const proximo: ChatYoutube = {
    ...yt,
    pageToken: p.nextPageToken ?? yt.pageToken,
    proxima: Date.now() + Math.max(YT_INTERVALO_MIN, p.pollingIntervalMillis ?? 0),
  };
  await pool.query(
    "update lives set chat = jsonb_set(chat, '{youtube}', $2::jsonb) where id = $1",
    [live.id, JSON.stringify(proximo)],
  );
}

/* ------------------------------------------------------------------ */
/* Kick                                                                 */
/* ------------------------------------------------------------------ */

const KICK_API = "https://api.kick.com/public/v1";

/** Nome do canal a partir do link (kick.com/canal) ou do próprio nome. */
export function slugDoKick(texto: string): string | null {
  const t = texto.trim().replace(/^@/, "");
  const s = (t.match(/kick\.com\/([\w-]+)/i)?.[1] ?? t).toLowerCase();
  return /^[\w-]{1,25}$/.test(s) ? s : null;
}

let tokenKick: { valor: string; ate: number } | null = null;

/** Token do app (client credentials), guardado até perto de vencer. */
async function tokenDoApp(): Promise<string> {
  if (tokenKick && tokenKick.ate > Date.now()) return tokenKick.valor;
  const id = process.env.KICK_CLIENT_ID?.trim();
  const segredo = process.env.KICK_CLIENT_SECRET?.trim();
  if (!id || !segredo)
    throw new RecusaChat(
      "Chat do Kick não configurado no servidor (KICK_CLIENT_ID e KICK_CLIENT_SECRET).",
    );
  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: segredo,
    }),
  });
  const b = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !b.access_token)
    throw new RecusaChat(`O Kick recusou as credenciais do app (HTTP ${res.status}).`);
  tokenKick = {
    valor: b.access_token,
    ate: Date.now() + Math.max(60, (b.expires_in ?? 3600) - 120) * 1000,
  };
  return tokenKick.valor;
}

async function chamarKick<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${KICK_API}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await tokenDoApp()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (res.status === 401) tokenKick = null;
  if (res.status === 204) return {} as T;
  const b = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok)
    throw new RecusaChat(
      `O Kick recusou o pedido (HTTP ${res.status}${b.message ? `: ${b.message}` : ""}).`,
    );
  return b;
}

/** Liga o chat do Kick: acha o canal e inscreve o app no chat dele. */
export async function ligarKick(pool: Pool, live: LiveRow, canal: string): Promise<ChatConfig> {
  const slug = slugDoKick(canal);
  if (!slug) throw new RecusaChat("Escreva o nome do canal do Kick (ou cole o link).");
  const c = await chamarKick<{ data?: Array<{ broadcaster_user_id: number; slug: string }> }>(
    `/channels?${new URLSearchParams({ slug })}`,
  );
  const broadcasterId = c.data?.[0]?.broadcaster_user_id;
  if (!broadcasterId) throw new RecusaChat("Canal do Kick não encontrado.");
  const s = await chamarKick<{
    data?: Array<{ name: string; subscription_id?: string; error?: string }>;
  }>("/events/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      events: [{ name: "chat.message.sent", version: 1 }],
      method: "webhook",
      broadcaster_user_id: broadcasterId,
    }),
  });
  let subscriptionId = s.data?.find((d) => d.subscription_id)?.subscription_id;
  if (!subscriptionId) {
    // Já inscrito (outra live no mesmo canal): reaproveita a inscrição.
    const existentes = await chamarKick<{ data?: Array<{ id: string; event: string }> }>(
      `/events/subscriptions?${new URLSearchParams({ broadcaster_user_id: String(broadcasterId) })}`,
    );
    subscriptionId = existentes.data?.find((d) => d.event === "chat.message.sent")?.id;
    if (!subscriptionId)
      throw new RecusaChat(
        `O Kick não aceitou a inscrição no chat${s.data?.[0]?.error ? `: ${s.data[0].error}` : "."}`,
      );
  }
  const chat: ChatConfig = {
    ...live.chat,
    kick: { slug, broadcasterId, subscriptionId },
  };
  await salvarChat(pool, live.id, chat);
  return chat;
}

/** Tira a inscrição do Kick, se nenhuma outra live no ar usa o mesmo canal. */
async function soltarKick(pool: Pool, live: LiveRow, kick: ChatKick) {
  if (!kick.subscriptionId) return;
  const { rows } = await pool.query(
    `select 1 from lives where id <> $1 and status = 'no_ar'
       and chat->'kick'->>'broadcasterId' = $2 limit 1`,
    [live.id, String(kick.broadcasterId)],
  );
  if (rows.length) return;
  await chamarKick(
    `/events/subscriptions?${new URLSearchParams({ id: kick.subscriptionId })}`,
    { method: "DELETE" },
  ).catch((e) => console.warn("[live] kick: soltar inscrição", (e as Error).message));
}

/* ------------------------------------------------------------------ */
/* Discord (bot de voz)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Permissões que o bot pede ao entrar num servidor: ver o canal, ler o
 * histórico, conectar e falar, e no palco virar orador (silenciar membros =
 * tirar a si mesmo da plateia; pedir para falar, se não puder).
 */
const PERMISSOES_BOT =
  (1n << 10n) | (1n << 16n) | (1n << 20n) | (1n << 21n) | (1n << 22n) | (1n << 32n);

/** Link para convidar o bot do NIDO para um servidor (null sem o app configurado). */
export function conviteDoBotDiscord(): string | null {
  const id = (process.env.DISCORD_BOT_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID)?.trim();
  if (!id || !process.env.DISCORD_BOT_TOKEN?.trim()) return null;
  return `https://discord.com/oauth2/authorize?${new URLSearchParams({
    client_id: id,
    scope: "bot",
    permissions: String(PERMISSOES_BOT),
  })}`;
}

/** Servidor e canal a partir do link do canal (discord.com/channels/<servidor>/<canal>). */
export function canalDoDiscord(link: string): { guildId: string; channelId: string } | null {
  const m = link
    .trim()
    .match(/^https?:\/\/(?:(?:www|ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{5,25})\/(\d{5,25})\/?$/i);
  return m ? { guildId: m[1], channelId: m[2] } : null;
}

/** Tipos de canal do Discord em que o bot fala: voz e palco. */
const CANAL_VOZ = 2;
const CANAL_PALCO = 13;

/**
 * Liga o bot do Discord na live: confere (com o token do bot) que ele vê o
 * canal e que é de voz ou palco, e deixa marcado para o bot entrar. Quem
 * entra de fato é o processo do bot (worker/discord), que acompanha o banco.
 */
export async function ligarDiscord(pool: Pool, live: LiveRow, link: string): Promise<ChatConfig> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token)
    throw new RecusaChat("Bot do Discord não configurado no servidor (DISCORD_BOT_TOKEN).");
  const canal = canalDoDiscord(link);
  if (!canal)
    throw new RecusaChat(
      "Cole o link do canal de voz ou palco (no Discord: botão direito no canal → Copiar link).",
    );
  const res = await fetch(`https://discord.com/api/v10/channels/${canal.channelId}`, {
    headers: { Authorization: `Bot ${token}` },
    cache: "no-store",
  });
  const b = (await res.json().catch(() => ({}))) as { type?: number; name?: string; guild_id?: string };
  if (res.status === 403 || res.status === 404 || b.guild_id !== canal.guildId)
    throw new RecusaChat(
      "O bot do NIDO não está nesse servidor (ou não vê esse canal). Convide o bot primeiro.",
    );
  if (!res.ok) throw new RecusaChat(`O Discord recusou o pedido (HTTP ${res.status}).`);
  if (b.type !== CANAL_VOZ && b.type !== CANAL_PALCO)
    throw new RecusaChat("Esse canal não é de voz nem palco.");
  const chat: ChatConfig = {
    ...live.chat,
    discord: { ...canal, nome: b.name, palco: b.type === CANAL_PALCO, estado: "aguardando" },
  };
  await salvarChat(pool, live.id, chat);
  return chat;
}

export async function desligarChat(
  pool: Pool,
  live: LiveRow,
  origem: OrigemChat,
): Promise<ChatConfig> {
  const { [origem]: atual, ...resto } = live.chat;
  if (origem === "kick" && atual) await soltarKick(pool, live, atual as ChatKick);
  await salvarChat(pool, live.id, resto);
  return resto;
}

/** Ao encerrar a live: solta a inscrição do Kick (o YouTube só para de ser lido). */
export async function desligarChats(pool: Pool, live: LiveRow): Promise<void> {
  if (live.chat?.kick) await soltarKick(pool, live, live.chat.kick);
}

let chavePublicaKick: string | null = null;

async function chavePublica(renovar = false): Promise<string> {
  if (chavePublicaKick && !renovar) return chavePublicaKick;
  const res = await fetch(`${KICK_API}/public-key`, { cache: "no-store" });
  const b = (await res.json().catch(() => ({}))) as { data?: { public_key?: string } };
  if (!b.data?.public_key) throw new Error(`chave pública do Kick (HTTP ${res.status})`);
  chavePublicaKick = b.data.public_key;
  return chavePublicaKick;
}

/**
 * Confere a assinatura do webhook do Kick: RSA-SHA256 sobre
 * "<message id>.<timestamp>.<corpo>", com a chave pública do Kick (que pode
 * trocar: se falhar, busca de novo uma vez).
 */
export async function assinaturaKickValida(
  idMensagem: string,
  quando: string,
  corpo: string,
  assinatura: string,
): Promise<boolean> {
  const confere = (chave: string) =>
    createVerify("RSA-SHA256")
      .update(`${idMensagem}.${quando}.${corpo}`)
      .verify(chave, assinatura, "base64");
  try {
    if (confere(await chavePublica())) return true;
    return confere(await chavePublica(true));
  } catch (e) {
    console.warn("[live] kick: assinatura", (e as Error).message);
    return false;
  }
}

interface EventoChatKick {
  message_id?: string;
  broadcaster?: { user_id?: number };
  sender?: { username?: string };
  content?: string;
}

/** Tira os emotes ("[emote:123:NOME]") do texto: a IA não precisa deles. */
export const semEmotes = (texto: string) =>
  texto.replace(/\[emote:\d+:[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();

/** Mensagem do chat do Kick: entra em toda live no ar ligada a esse canal. */
export async function receberChatKick(pool: Pool, evento: EventoChatKick): Promise<number> {
  const canal = evento.broadcaster?.user_id;
  const texto = semEmotes(evento.content ?? "");
  if (!canal || !texto || !evento.message_id) return 0;
  const { rows } = await pool.query<{ id: string }>(
    `select id from lives where status = 'no_ar' and chat->'kick'->>'broadcasterId' = $1`,
    [String(canal)],
  );
  for (const { id } of rows)
    await guardar(pool, id, "kick", [
      { extId: evento.message_id, autor: evento.sender?.username ?? "", texto },
    ]);
  return rows.length;
}
