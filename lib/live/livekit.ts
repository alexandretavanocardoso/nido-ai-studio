import { createHmac } from "node:crypto";

/**
 * Sala do LiveKit (LiveKit Cloud ou servidor próprio) onde a live acontece:
 * o navegador de quem opera entra como "agente" e manda o áudio das falas; o
 * avatar do Runway entra como outro participante e publica o vídeo (e o áudio)
 * com os lábios sincronizados; a página do palco (OBS) só assiste.
 * Chaves em LIVEKIT_URL (wss://…), LIVEKIT_API_KEY e LIVEKIT_API_SECRET.
 */
export interface ConfigLiveKit {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function configLiveKit(): ConfigLiveKit | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export interface PedidoToken {
  identidade: string;
  nome?: string;
  sala: string;
  /** Pode publicar áudio, vídeo e dados (false: só assiste). */
  publicar: boolean;
  /** Não aparece para os outros participantes (o palco do OBS). */
  oculto?: boolean;
  /** "agent": participante automático (o avatar e quem conduz a live). */
  tipo?: "agent";
  atributos?: Record<string, string>;
  validadeSegundos: number;
}

/**
 * Token de acesso à sala: um JWT HS256 assinado com o segredo da API, no
 * formato do livekit-server-sdk (a identidade vai em `sub`, as permissões em
 * `video`).
 */
export function tokenLiveKit(cfg: ConfigLiveKit, p: PedidoToken): string {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = {
    iss: cfg.apiKey,
    sub: p.identidade,
    jti: p.identidade,
    nbf: 0,
    exp: agora + p.validadeSegundos,
    name: p.nome ?? p.identidade,
    ...(p.tipo ? { kind: p.tipo } : {}),
    ...(p.atributos ? { attributes: p.atributos } : {}),
    video: {
      room: p.sala,
      roomJoin: true,
      canSubscribe: true,
      canPublish: p.publicar,
      canPublishData: p.publicar,
      ...(p.oculto ? { hidden: true } : {}),
    },
  };
  return assinar(cfg, corpo);
}

/** JWT HS256 assinado com o segredo da API. */
function assinar(cfg: ConfigLiveKit, corpo: object): string {
  const parte = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const conteudo = `${parte({ alg: "HS256", typ: "JWT" })}.${parte(corpo)}`;
  const assinatura = createHmac("sha256", cfg.apiSecret)
    .update(conteudo)
    .digest("base64url");
  return `${conteudo}.${assinatura}`;
}

/**
 * Chama a API do servidor do LiveKit (Twirp, JSON) com um token de serviço —
 * por exemplo `chamarLiveKit(cfg, "Egress", "StartEgress", {...})`. O token
 * só vale para o que a chamada precisa (`permissoes` no campo `video`).
 */
export async function chamarLiveKit<T>(
  cfg: ConfigLiveKit,
  servico: "Egress" | "RoomService",
  metodo: string,
  corpo: object,
  permissoes: Record<string, unknown>,
): Promise<T> {
  const token = assinar(cfg, {
    iss: cfg.apiKey,
    nbf: 0,
    exp: Math.floor(Date.now() / 1000) + 120,
    video: permissoes,
  });
  const base = cfg.url.replace(/^ws/, "http").replace(/\/+$/, "");
  const res = await fetch(`${base}/twirp/livekit.${servico}/${metodo}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    cache: "no-store",
  });
  const b = (await res.json().catch(() => ({}))) as T & { msg?: string; code?: string };
  if (!res.ok)
    throw new Error(`LiveKit ${metodo}: HTTP ${res.status}${b.msg ? ` — ${b.msg}` : ""}`);
  return b;
}
