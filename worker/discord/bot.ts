/**
 * Bot do Discord da Live do NIDO (processo sempre ligado, fora da Vercel).
 *
 * A cada poucos segundos olha o banco: toda live no ar com o Discord ligado
 * (`lives.chat.discord`, gravado pela tela da live) ganha o bot no canal de
 * voz ou palco escolhido. O bot entra na sala do LiveKit da live só para
 * ouvir, e toca no Discord o áudio do avatar (o mesmo que sai sincronizado
 * com a boca). O que as pessoas escrevem no chat do canal vai para a fila da
 * live (tabela live_chat). Quando a live acaba ou o Discord é desligado, sai.
 *
 * O Discord não deixa bots mandarem vídeo: aqui é só voz. Com vídeo, pela
 * conta da pessoa, há o guia na tela (OBS + câmera virtual).
 *
 * Variáveis: DATABASE_URL, DISCORD_BOT_TOKEN, LIVEKIT_URL, LIVEKIT_API_KEY,
 * LIVEKIT_API_SECRET.
 */
import { createHmac } from "node:crypto";
import { PassThrough } from "node:stream";
import {
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import { AudioStream, Room, RoomEvent, TrackKind, type RemoteTrack } from "@livekit/rtc-node";
import { Pool } from "@neondatabase/serverless";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  type StageChannel,
  type VoiceChannel,
} from "discord.js";

const exigir = (nome: string): string => {
  const v = process.env[nome]?.trim();
  if (!v) throw new Error(`Falta a variável ${nome}.`);
  return v;
};

const DATABASE_URL = exigir("DATABASE_URL");
const DISCORD_BOT_TOKEN = exigir("DISCORD_BOT_TOKEN");
const LIVEKIT_URL = exigir("LIVEKIT_URL");
const LIVEKIT_API_KEY = exigir("LIVEKIT_API_KEY");
const LIVEKIT_API_SECRET = exigir("LIVEKIT_API_SECRET");

/** De quanto em quanto tempo olha o banco. */
const INTERVALO_MS = 5000;
/** Áudio que o Discord recebe: PCM 16 bits, 48 kHz, estéreo. */
const TAXA = 48_000;
const CANAIS = 2;

const pool = new Pool({ connectionString: DATABASE_URL });

type EstadoDiscord = "aguardando" | "conectando" | "no_canal" | "pedindo_para_falar" | "erro";

interface LiveComDiscord {
  id: string;
  sala: string;
  discord: { guildId: string; channelId: string; estado?: EstadoDiscord; erro?: string };
}

interface Sessao {
  liveId: string;
  guildId: string;
  channelId: string;
  /** Canal de palco (o bot pode estar na plateia, esperando virar orador). */
  palco: boolean;
  conexao: VoiceConnection;
  player: AudioPlayer;
  sala: Room;
  /** Para o áudio que está tocando (troca de faixa ou saída). */
  pararAudio?: () => void;
}

/** Lives com o bot no canal agora, por id da live. */
const sessoes = new Map<string, Sessao>();
/** Lives em que o bot está entrando (evita entrar duas vezes). */
const entrando = new Set<string>();

/* ------------------------------------------------------------------ */
/* Banco                                                                */
/* ------------------------------------------------------------------ */

async function livesComDiscord(): Promise<LiveComDiscord[]> {
  const { rows } = await pool.query<LiveComDiscord>(
    `select id, sala, chat->'discord' as discord from lives
      where status = 'no_ar' and chat ? 'discord'`,
  );
  return rows;
}

/** Grava o estado do bot na live (a tela mostra). Só escreve se mudou. */
async function marcar(live: LiveComDiscord, estado: EstadoDiscord, erro?: string) {
  if (live.discord.estado === estado && (live.discord.erro ?? null) === (erro ?? null)) return;
  live.discord.estado = estado;
  live.discord.erro = erro;
  await pool
    .query(
      `update lives set chat = jsonb_set(chat, '{discord}', (chat->'discord') || $2::jsonb)
        where id = $1 and chat ? 'discord'`,
      [live.id, JSON.stringify({ estado, erro: erro ?? null })],
    )
    .catch((e) => console.warn("[discord] estado", live.id, (e as Error).message));
}

/* ------------------------------------------------------------------ */
/* LiveKit: token de quem só ouve                                       */
/* ------------------------------------------------------------------ */

/** Token da sala só para ouvir, invisível (mesmo formato de lib/live/livekit.ts). */
function tokenOuvinte(sala: string, identidade: string): string {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const corpo = {
    iss: LIVEKIT_API_KEY,
    sub: identidade,
    jti: identidade,
    nbf: 0,
    exp: Math.floor(Date.now() / 1000) + 6 * 3600,
    name: "Discord",
    video: { room: sala, roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: false, hidden: true },
  };
  const conteudo = `${parte({ alg: "HS256", typ: "JWT" })}.${parte(corpo)}`;
  return `${conteudo}.${createHmac("sha256", LIVEKIT_API_SECRET).update(conteudo).digest("base64url")}`;
}

/* ------------------------------------------------------------------ */
/* Áudio: da sala da live para o canal do Discord                       */
/* ------------------------------------------------------------------ */

/** Toca no Discord uma faixa de áudio da sala, enquanto ela existir. */
function tocar(s: Sessao, track: RemoteTrack) {
  s.pararAudio?.();
  const pcm = new PassThrough({ highWaterMark: TAXA * CANAIS * 2 });
  const quadros = new AudioStream(track, { sampleRate: TAXA, numChannels: CANAIS });
  const leitor = quadros.getReader();
  let ativo = true;
  s.pararAudio = () => {
    ativo = false;
    void leitor.cancel().catch(() => {});
    pcm.end();
  };
  s.player.play(createAudioResource(pcm, { inputType: StreamType.Raw }));
  void (async () => {
    try {
      while (ativo) {
        const { done, value } = await leitor.read();
        if (done) break;
        const d = value.data;
        // Se o Discord não está consumindo, descarta em vez de acumular atraso.
        if (pcm.writableLength < pcm.writableHighWaterMark)
          pcm.write(Buffer.from(d.buffer, d.byteOffset, d.byteLength));
      }
    } catch (e) {
      console.warn("[discord] áudio", s.liveId, (e as Error).message);
    } finally {
      pcm.end();
    }
  })();
}

/* ------------------------------------------------------------------ */
/* Entrar e sair                                                        */
/* ------------------------------------------------------------------ */

const cliente = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function entrar(live: LiveComDiscord) {
  entrando.add(live.id);
  await marcar(live, "conectando");
  let conexao: VoiceConnection | null = null;
  let sala: Room | null = null;
  try {
    const canal = await cliente.channels.fetch(live.discord.channelId).catch(() => null);
    if (!canal || (canal.type !== ChannelType.GuildVoice && canal.type !== ChannelType.GuildStageVoice))
      return await marcar(live, "erro", "O bot não vê esse canal de voz ou palco. Convide o bot de novo.");
    const vozOuPalco = canal as VoiceChannel | StageChannel;

    conexao = joinVoiceChannel({
      guildId: vozOuPalco.guild.id,
      channelId: vozOuPalco.id,
      adapterCreator: vozOuPalco.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    await entersState(conexao, VoiceConnectionStatus.Ready, 30_000);

    // No palco o bot entra na plateia: tenta virar orador; sem permissão, pede para falar.
    let estado: EstadoDiscord = "no_canal";
    if (vozOuPalco.type === ChannelType.GuildStageVoice) {
      const eu = vozOuPalco.guild.members.me;
      const virouOrador = await eu?.voice.setSuppressed(false).then(() => true).catch(() => false);
      if (!virouOrador) {
        await eu?.voice.setRequestToSpeak(true).catch(() => {});
        estado = "pedindo_para_falar";
      }
    }

    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    player.on("error", (e) => console.warn("[discord] player", live.id, e.message));
    conexao.subscribe(player);

    sala = new Room();
    const s: Sessao = {
      liveId: live.id,
      guildId: vozOuPalco.guild.id,
      channelId: vozOuPalco.id,
      palco: vozOuPalco.type === ChannelType.GuildStageVoice,
      conexao,
      player,
      sala,
    };
    sala.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === TrackKind.KIND_AUDIO) tocar(s, track);
    });
    sala.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === TrackKind.KIND_AUDIO) s.pararAudio?.();
    });
    await sala.connect(LIVEKIT_URL, tokenOuvinte(live.sala, `discord-${live.id}`), {
      autoSubscribe: true,
      dynacast: false,
    });
    // O avatar pode já estar falando na sala.
    for (const p of sala.remoteParticipants.values())
      for (const pub of p.trackPublications.values())
        if (pub.track && pub.track.kind === TrackKind.KIND_AUDIO) tocar(s, pub.track as RemoteTrack);

    const voz = conexao;
    voz.on(VoiceConnectionStatus.Disconnected, async () => {
      // Pode ser só uma troca de servidor de voz do Discord: espera voltar.
      // Se não voltar (expulso, canal apagado), sai; a próxima volta do laço entra de novo.
      try {
        await Promise.race([
          entersState(voz, VoiceConnectionStatus.Signalling, 5000),
          entersState(voz, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        void sair(live.id);
      }
    });
    sessoes.set(live.id, s);
    await marcar(live, estado);
    console.log(`[discord] live ${live.id}: no canal ${vozOuPalco.name} (${vozOuPalco.guild.name})`);
  } catch (e) {
    console.error("[discord] entrar", live.id, e);
    conexao?.destroy();
    await sala?.disconnect().catch(() => {});
    await marcar(live, "erro", "O bot não conseguiu entrar no canal. Confira as permissões (conectar e falar).");
  } finally {
    entrando.delete(live.id);
  }
}

async function sair(liveId: string) {
  const s = sessoes.get(liveId);
  if (!s) return;
  sessoes.delete(liveId);
  s.pararAudio?.();
  s.player.stop(true);
  if (s.conexao.state.status !== VoiceConnectionStatus.Destroyed) s.conexao.destroy();
  await s.sala.disconnect().catch(() => {});
  console.log(`[discord] live ${liveId}: saiu do canal`);
}

/* ------------------------------------------------------------------ */
/* Chat do canal → fila da live                                         */
/* ------------------------------------------------------------------ */

cliente.on(Events.MessageCreate, async (msg: Message) => {
  if (msg.author.bot || !msg.content.trim()) return;
  for (const s of sessoes.values()) {
    if (s.channelId !== msg.channelId) continue;
    await pool
      .query(
        `insert into live_chat (live_id, origem, ext_id, autor, texto)
         values ($1, 'discord', $2, $3, $4) on conflict do nothing`,
        [s.liveId, msg.id, (msg.member?.displayName ?? msg.author.username).slice(0, 60), msg.content.slice(0, 600)],
      )
      .catch((e) => console.warn("[discord] chat", s.liveId, (e as Error).message));
  }
});

/* ------------------------------------------------------------------ */
/* Laço principal                                                       */
/* ------------------------------------------------------------------ */

async function acompanhar() {
  const lives = await livesComDiscord();
  const ativas = new Map(lives.map((l) => [l.id, l]));
  // Live que acabou, Discord desligado ou canal trocado: sai.
  for (const [id, s] of sessoes) {
    const l = ativas.get(id);
    if (!l || l.discord.channelId !== s.channelId) await sair(id);
  }
  for (const l of lives) {
    const s = sessoes.get(l.id);
    if (s) {
      // Reafirma o estado (a tela pode ter regravado o chat da live por cima).
      // No palco, continua "pedindo" até alguém aceitar o bot como orador.
      const naPlateia = s.palco && !!cliente.guilds.cache.get(s.guildId)?.members.me?.voice.suppress;
      await marcar(l, naPlateia ? "pedindo_para_falar" : "no_canal");
      continue;
    }
    // Erro: só tenta de novo se a pessoa ligar outra vez (o estado volta a "aguardando").
    if (!entrando.has(l.id) && l.discord.estado !== "erro") void entrar(l);
  }
}

cliente.once(Events.ClientReady, (c) => {
  console.log(`[discord] conectado como ${c.user.tag}`);
  const laco = async () => {
    await acompanhar().catch((e) => console.error("[discord] laço", e));
    setTimeout(laco, INTERVALO_MS);
  };
  void laco();
});

async function desligar() {
  console.log("[discord] desligando…");
  for (const id of [...sessoes.keys()]) await sair(id);
  await cliente.destroy();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void desligar());
process.on("SIGINT", () => void desligar());

await cliente.login(DISCORD_BOT_TOKEN);
