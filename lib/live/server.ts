import type RunwayML from "@runwayml/sdk";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "@neondatabase/serverless";
import { estornarParcial, type Cobranca } from "@/lib/creditos";
import { getObjectBuffer, newKey, presignGet, putObject } from "@/lib/storage/s3";
import {
  criarAvatar,
  estadoAvatar,
  MODELO_FALADO,
  recorteParaAvatar,
} from "@/lib/video/falado";
import { retratoNaCena } from "./cena";
import { desligarChats, type ChatConfig } from "./chat";
import { configLiveKit, tokenLiveKit, type ConfigLiveKit } from "./livekit";
import { pararTransmissao, type Transmissao } from "./transmissao";
import {
  creditosDoTempo,
  IDENTIDADE_AVATAR,
  identidadeOperador,
  segundosNoAr,
  type CenaLive,
  type LiveResumo,
  type PersonaAvulsa,
  type SessaoLive,
  type TipoLive,
  CREDITOS_POR_MINUTO,
  ehSessaoSombra,
  type StatusLive,
} from "./tipos";

/**
 * Live do personagem no servidor: o avatar do Runway (o mesmo do vídeo
 * falado), as sessões em tempo real dele na sala do LiveKit e o acerto dos
 * créditos ao encerrar. A conversa (resposta da IA e voz) fica na rota
 * /api/live/[id]/fala; quem conduz a live é o navegador do operador.
 */
export interface LiveRow {
  id: string;
  user_id: string;
  /** Vazio na live sem personagem (ver `persona`). */
  character_id: string | null;
  tipo: TipoLive;
  persona: PersonaAvulsa | null;
  cena: CenaLive | null;
  status: StatusLive;
  image_key: string;
  voice_id: string | null;
  avatar_id: string | null;
  duracao_min: number;
  sala: string;
  sessoes: SessaoLive[];
  cobranca: Cobranca | null;
  segundos: number | null;
  creditos: number | null;
  erro: string | null;
  chat: ChatConfig;
  transmissao: Transmissao | null;
  created_at: Date;
  iniciada_em: Date | null;
  encerrada_em: Date | null;
}

export async function carregarLive(
  pool: Pool,
  userId: string,
  id: string,
): Promise<LiveRow | null> {
  const { rows } = await pool.query<LiveRow>(
    "select * from lives where id = $1 and user_id = $2",
    [id, userId],
  );
  return rows[0] ?? null;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export function resumoDaLive(r: LiveRow): LiveResumo {
  return {
    id: r.id,
    characterId: r.character_id,
    tipo: r.tipo ?? "avatar",
    persona: r.persona,
    transmitindo: (r.transmissao?.envios ?? []).flatMap((e) => e.redes),
    status: r.status,
    duracaoMin: r.duracao_min,
    imageKey: r.image_key,
    voiceId: r.voice_id,
    createdAt: iso(r.created_at)!,
    iniciadaEm: iso(r.iniciada_em),
    encerradaEm: iso(r.encerrada_em),
    segundos: r.segundos,
    creditos: r.creditos,
    erro: r.erro,
  };
}

/**
 * Avatar já pronto feito desta mesma imagem — numa live anterior ou num vídeo
 * falado (o recorte é o mesmo) — para não montar outro. Com cenário, só o de
 * uma live com a mesma imagem e o mesmo cenário.
 */
export async function avatarReaproveitavel(
  pool: Pool,
  rw: RunwayML,
  userId: string,
  imageKey: string,
  cena: CenaLive | null,
): Promise<string | null> {
  const { rows } = cena
    ? await pool.query<{ avatar: string }>(
        `select avatar_id as avatar from lives
          where user_id = $1 and image_key = $2 and cena = $3::jsonb
            and avatar_id is not null and status <> 'erro'
          order by created_at desc limit 3`,
        [userId, imageKey, JSON.stringify(cena)],
      )
    : await pool.query<{ avatar: string }>(
        `(select avatar_id as avatar, created_at from lives
           where user_id = $1 and image_key = $2 and cena is null
             and avatar_id is not null and status <> 'erro')
         union all
         (select input->>'avatarId' as avatar, created_at from video_jobs
           where user_id = $1 and modelo = $3 and input->>'imageKey' = $2
             and input->>'avatarId' is not null and status <> 'erro')
         order by created_at desc limit 3`,
        [userId, imageKey, MODELO_FALADO],
      );
  for (const { avatar } of rows)
    if ((await estadoAvatar(rw, avatar)).estado === "pronto") return avatar;
  return null;
}

/**
 * Monta o avatar do Runway a partir da imagem do personagem (recortada no
 * rosto) — com cenário, a pessoa já posta no lugar escolhido.
 */
export async function criarAvatarDaImagem(
  rw: RunwayML,
  s3: S3Client,
  o: { userId: string; nome: string; imageKey: string; cena: CenaLive | null },
): Promise<string> {
  const recorte = await recorteParaAvatar(await getObjectBuffer(s3, o.imageKey));
  const retrato = o.cena ? await retratoNaCena(s3, recorte, o.cena) : recorte;
  const key = newKey(o.userId, "refs", "image/jpeg");
  await putObject(s3, key, retrato, "image/jpeg");
  return criarAvatar(rw, {
    nome: o.nome,
    imageUrl: await presignGet(s3, key, 86_400),
  });
}

/**
 * Prévia do avatar: a imagem que o Runway preparou (a pessoa já no cenário),
 * para conferir antes de entrar no ar. O endereço é temporário.
 */
export async function previaDoAvatar(rw: RunwayML, avatarId: string): Promise<string | null> {
  try {
    const a = await rw.avatars.retrieve(avatarId);
    return a.processedImageUri ?? a.referenceImageUri ?? null;
  } catch (e) {
    console.warn("[live] prévia do avatar", avatarId, (e as Error).message);
    return null;
  }
}

/** Folga dos tokens da sala além da duração da live. */
const FOLGA_TOKEN = 3600;

/**
 * Põe o avatar na sala: uma sessão em tempo real do Runway ligada ao LiveKit.
 * O Runway entra como IDENTIDADE_AVATAR, recebe o áudio do operador e publica
 * o vídeo em nome dele. `maxSegundos` é o tempo que ainda resta na live: o
 * Runway encerra sozinho ali, mesmo que a página do operador feche.
 */
export async function abrirSessao(
  rw: RunwayML,
  cfg: ConfigLiveKit,
  live: Pick<LiveRow, "id" | "avatar_id" | "sala">,
  maxSegundos: number,
): Promise<SessaoLive> {
  const operador = identidadeOperador(live.id);
  const token = tokenLiveKit(cfg, {
    identidade: IDENTIDADE_AVATAR,
    sala: live.sala,
    publicar: true,
    tipo: "agent",
    atributos: { "lk.publish_on_behalf": operador },
    validadeSegundos: maxSegundos + FOLGA_TOKEN,
  });
  const s = await rw.realtimeSessions.create({
    model: "gwm1_avatars",
    avatar: { type: "custom", avatarId: live.avatar_id! },
    integration: {
      type: "livekit",
      url: cfg.url,
      token,
      roomName: live.sala,
      agentIdentity: operador,
    },
    maxDuration: Math.max(60, Math.floor(maxSegundos)),
  });
  return { id: s.id, inicio: Date.now() };
}

/** Token do operador: entra como agente e manda o áudio das falas. */
export function tokenDoOperador(
  cfg: ConfigLiveKit,
  live: Pick<LiveRow, "id" | "sala">,
  segundos: number,
): string {
  return tokenLiveKit(cfg, {
    identidade: identidadeOperador(live.id),
    nome: "NIDO",
    sala: live.sala,
    publicar: true,
    tipo: "agent",
    validadeSegundos: segundos + FOLGA_TOKEN,
  });
}

/** Token do palco (fonte de navegador do OBS): só assiste, invisível na sala. */
export function tokenDoPalco(
  cfg: ConfigLiveKit,
  live: Pick<LiveRow, "id" | "sala">,
  segundos: number,
  sufixo: string,
): string {
  return tokenLiveKit(cfg, {
    identidade: `palco-${live.id}-${sufixo}`,
    sala: live.sala,
    publicar: false,
    oculto: true,
    validadeSegundos: segundos + FOLGA_TOKEN,
  });
}

export type EstadoSessao = "ativa" | "terminou" | "falhou";

/** Como está a sessão do Runway agora. */
export async function estadoSessao(
  rw: RunwayML,
  id: string,
): Promise<{ estado: EstadoSessao; segundos?: number; falha?: string }> {
  const s = await rw.realtimeSessions.retrieve(id);
  if (s.status === "NOT_READY" || s.status === "READY" || s.status === "RUNNING")
    return { estado: "ativa" };
  if (s.status === "FAILED") return { estado: "falhou", falha: s.failure };
  return {
    estado: "terminou",
    segundos: s.status === "COMPLETED" ? s.duration : undefined,
  };
}

/**
 * Fecha as sessões que ainda não foram fechadas: cancela as ativas no Runway
 * e anota o fim. Sessão que falhou não conta tempo (o avatar não chegou a
 * ficar no ar por culpa do serviço). Devolve a lista atualizada.
 */
export async function fecharSessoes(
  rw: RunwayML,
  sessoes: SessaoLive[],
): Promise<SessaoLive[]> {
  const agora = Date.now();
  return Promise.all(
    sessoes.map(async (s) => {
      if (s.fim !== undefined) return s;
      // Sombra: não há sessão no Runway, só o tempo no ar.
      if (ehSessaoSombra(s.id)) return { ...s, fim: agora };
      try {
        const e = await estadoSessao(rw, s.id);
        if (e.estado === "ativa") {
          await rw.realtimeSessions.delete(s.id).catch(() => {});
          return { ...s, fim: agora };
        }
        if (e.estado === "falhou") return { ...s, fim: agora, segundos: 0 };
        return { ...s, fim: agora, ...(e.segundos !== undefined ? { segundos: e.segundos } : {}) };
      } catch (err) {
        // Sem resposta do Runway: tenta cancelar e conta até agora.
        console.warn("[live] sessão", s.id, (err as Error).message);
        await rw.realtimeSessions.delete(s.id).catch(() => {});
        return { ...s, fim: agora };
      }
    }),
  );
}

/**
 * Encerra a live: fecha as sessões do Runway, soma o tempo no ar e devolve os
 * créditos dos minutos não usados. Só uma chamada acerta os créditos (a que
 * muda o status de no_ar para encerrada), então repetir não devolve duas vezes.
 */
export async function encerrarLive(
  pool: Pool,
  rw: RunwayML,
  live: LiveRow,
): Promise<LiveRow> {
  if (live.status !== "no_ar") {
    if (live.status !== "pronta" && live.status !== "preparando") return live;
    // Nunca entrou no ar: nada foi cobrado.
    const { rows } = await pool.query<LiveRow>(
      `update lives set status = 'encerrada', encerrada_em = now(), segundos = 0, creditos = 0
        where id = $1 and status in ('pronta', 'preparando') returning *`,
      [live.id],
    );
    return rows[0] ?? live;
  }
  const sessoes = await fecharSessoes(rw, live.sessoes);
  const teto = live.duracao_min * 60;
  const segundos = segundosNoAr(sessoes, Date.now(), teto);
  const cobrado = live.cobranca?.total ?? 0;
  const creditos = Math.min(
    cobrado,
    creditosDoTempo(segundos, CREDITOS_POR_MINUTO[live.tipo ?? "avatar"]),
  );
  const { rows } = await pool.query<LiveRow>(
    `update lives set status = 'encerrada', encerrada_em = now(), sessoes = $2,
            segundos = $3, creditos = $4, transmissao = null
      where id = $1 and status = 'no_ar' returning *`,
    [live.id, JSON.stringify(sessoes), segundos, live.cobranca ? creditos : 0],
  );
  if (!rows[0]) return (await carregarLive(pool, live.user_id, live.id)) ?? live;
  const lk = configLiveKit();
  if (lk && live.transmissao) await pararTransmissao(lk, live.transmissao.envios);
  await desligarChats(pool, live).catch((e) =>
    console.warn("[live] chat ao encerrar", (e as Error).message),
  );
  if (live.cobranca && cobrado > creditos)
    await estornarParcial(live.cobranca, cobrado - creditos, "estorno_live");
  return rows[0];
}

/**
 * Lives que ficaram no ar sem ninguém encerrar (a página fechou): o Runway já
 * parou sozinho no fim da duração; aqui o tempo é acertado e o que sobrou
 * volta. Com `userId`, só as dessa conta.
 */
export async function acertarLivesAbertas(
  pool: Pool,
  rw: RunwayML,
  userId?: string,
): Promise<number> {
  const { rows } = await pool.query<LiveRow>(
    `select * from lives
      where status = 'no_ar'
        and iniciada_em < now() - make_interval(mins => duracao_min + 10)
        ${userId ? "and user_id = $1" : ""}
      limit 20`,
    userId ? [userId] : [],
  );
  for (const live of rows)
    await encerrarLive(pool, rw, live).catch((e) =>
      console.error("[live] acerto", live.id, e),
    );
  return rows.length;
}
