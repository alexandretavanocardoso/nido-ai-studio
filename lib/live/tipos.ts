import { CREDITOS_LIVE_POR_MINUTO, CREDITOS_SOMBRA_POR_MINUTO } from "@/lib/planos";

/**
 * Live do personagem — o que o servidor e a tela compartilham.
 *
 * Fluxo: a live é criada "preparando" (o Runway monta o avatar a partir da
 * imagem), fica "pronta", vai "no_ar" quando quem opera entra (a duração
 * escolhida é cobrada) e termina "encerrada" (os minutos não usados voltam).
 */
export type StatusLive = "preparando" | "pronta" | "no_ar" | "encerrada" | "erro";

/** Uma entrada do avatar na sala (uma sessão em tempo real do Runway). Tempos em ms. */
export interface SessaoLive {
  id: string;
  inicio: number;
  fim?: number;
  /** Duração informada pelo Runway (sessão que terminou sozinha). */
  segundos?: number;
}

/** Live sem personagem: quem aparece (foto enviada) e como fala. */
export interface PersonaAvulsa {
  nome: string;
  descricao: string;
  /** Nome da voz escolhida (para mostrar ao reaproveitar a persona). */
  vozNome?: string;
}

/**
 * Cenário da live: descrito em texto ou por uma imagem do lugar (key no S3).
 * Sem cenário, o avatar fica com o fundo da própria foto.
 */
export type CenaLive = { prompt: string } | { imageKey: string };

/**
 * Persona avulsa salva: a de uma live anterior (foto, quem é, voz e cenário),
 * para fazer outra live com ela. Sai das próprias lives (lib/live/personas.ts).
 */
export interface PersonaSalva extends PersonaAvulsa {
  imageKey: string;
  voiceId: string;
  cena: CenaLive | null;
}

/** Redes para onde o NIDO transmite direto (RTMP pelo LiveKit). */
export type RedeTransmissao = "youtube" | "twitch" | "kick" | "tiktok";

export const REDES_TRANSMISSAO: Record<
  RedeTransmissao,
  {
    nome: string;
    /** Servidor padrão (a pessoa pode trocar); vazio = cada conta tem o seu. */
    servidor: string;
    /** Onde a pessoa acha o servidor e a chave. */
    onde: string;
    /** Vídeo em pé (9:16). */
    vertical: boolean;
  }
> = {
  youtube: {
    nome: "YouTube",
    servidor: "rtmp://a.rtmp.youtube.com/live2",
    onde: "YouTube Studio → Criar → Transmitir ao vivo → Chave de transmissão",
    vertical: false,
  },
  twitch: {
    nome: "Twitch",
    servidor: "rtmp://live.twitch.tv/app",
    onde: "Painel do criador → Configurações → Transmissão → Chave de transmissão primária",
    vertical: false,
  },
  kick: {
    nome: "Kick",
    servidor: "",
    onde: "Painel do criador → Configurações → Stream URL & Key (copie a URL e a chave)",
    vertical: false,
  },
  tiktok: {
    nome: "TikTok",
    servidor: "",
    onde: "LIVE Center (ou Ao vivo → Transmitir pelo PC) → URL do servidor e chave de transmissão",
    vertical: true,
  },
};

export interface DestinoTransmissao {
  rede: RedeTransmissao;
  /** Servidor RTMP/RTMPS (sem a chave). */
  servidor: string;
  chave: string;
}

/** Endereço final que o LiveKit recebe: servidor + "/" + chave. */
export const urlDoDestino = (d: Pick<DestinoTransmissao, "servidor" | "chave">) =>
  `${d.servidor.trim().replace(/\/+$/, "")}/${d.chave.trim()}`;

export type EstadoEnvio = "iniciando" | "ativa" | "terminou" | "falhou";

/** Como está a transmissão para cada rede. */
export interface EstadoTransmissao {
  rede: RedeTransmissao;
  estado: EstadoEnvio;
  erro?: string;
}

/** avatar: o avatar do Runway fala com a IA · sombra: a webcam vira o influencer (Decart). */
export type TipoLive = "avatar" | "sombra";

/** Créditos por minuto no ar de cada tipo de live. */
export const CREDITOS_POR_MINUTO: Record<TipoLive, number> = {
  avatar: CREDITOS_LIVE_POR_MINUTO,
  sombra: CREDITOS_SOMBRA_POR_MINUTO,
};

/** Sessão da sombra: não é do Runway (a webcam fica no navegador). */
export const ehSessaoSombra = (id: string) => id.startsWith("sombra-");

export interface LiveResumo {
  id: string;
  tipo: TipoLive;
  /** Vazio na live sem personagem (ver `persona`). */
  characterId: string | null;
  persona: PersonaAvulsa | null;
  /** Redes para onde está transmitindo agora (vazio: nenhuma). */
  transmitindo: RedeTransmissao[];
  status: StatusLive;
  duracaoMin: number;
  imageKey: string;
  /** Vazio na sombra com a voz da própria pessoa. */
  voiceId: string | null;
  createdAt: string;
  iniciadaEm: string | null;
  encerradaEm: string | null;
  segundos: number | null;
  creditos: number | null;
  erro: string | null;
}

/** Identidade do avatar do Runway na sala (a mesma do plugin oficial do LiveKit). */
export const IDENTIDADE_AVATAR = "runway-avatar-agent";
/** Quem conduz a live (o navegador do operador): manda o áudio para o avatar. */
export const identidadeOperador = (liveId: string) => `nido-${liveId}`;

/** Protocolo de avatar do LiveKit Agents (DataStreamAudioOutput). */
export const TOPICO_AUDIO = "lk.audio_stream";
export const RPC_FALA_TERMINOU = "lk.playback_finished";
export const RPC_LIMPAR = "lk.clear_buffer";
/** Formato do áudio enviado: PCM 16 bits, mono, 16 kHz (pcm_16000 da ElevenLabs). */
export const TAXA_AUDIO = 16_000;

/**
 * Segundos no ar somando as sessões: a duração do Runway quando ele informa;
 * senão, do início ao fim (ou até agora, se ainda está aberta). Nunca passa
 * do teto (a duração cobrada).
 */
export function segundosNoAr(
  sessoes: SessaoLive[],
  agora: number,
  tetoSegundos: number,
): number {
  const total = sessoes.reduce(
    (t, s) =>
      t +
      (s.segundos ?? Math.max(0, ((s.fim ?? agora) - s.inicio) / 1000)),
    0,
  );
  return Math.min(tetoSegundos, Math.round(total));
}

/** Créditos dos segundos no ar: minuto começado conta inteiro. */
export const creditosDoTempo = (segundos: number, porMinuto = CREDITOS_LIVE_POR_MINUTO): number =>
  Math.ceil(segundos / 60) * porMinuto;
