import { chamarLiveKit, type ConfigLiveKit } from "./livekit";
import {
  IDENTIDADE_AVATAR,
  REDES_TRANSMISSAO,
  urlDoDestino,
  type DestinoTransmissao,
  type EstadoEnvio,
  type EstadoTransmissao,
  type RedeTransmissao,
} from "./tipos";

/**
 * Transmissão direta para as redes: o LiveKit grava o avatar da sala (vídeo
 * da participante IDENTIDADE_AVATAR + o áudio da sala) e manda por RTMP para
 * cada rede (egress). Um envio para as redes deitadas (16:9) e outro para as
 * em pé (TikTok, 9:16). As chaves de transmissão só vão para o LiveKit.
 */
export interface EnvioTransmissao {
  id: string;
  redes: RedeTransmissao[];
  vertical: boolean;
}

export interface Transmissao {
  envios: EnvioTransmissao[];
  inicio: number;
}

/** Para o LiveKit: só o que gravar e transmitir precisa. */
const GRAVAR = { roomRecord: true };

interface EgressInfo {
  egress_id?: string;
  egressId?: string;
  status?: string;
  error?: string;
  stream_results?: Array<{ url?: string; status?: string; error?: string }>;
  streamResults?: Array<{ url?: string; status?: string; error?: string }>;
}

const idDoEnvio = (e: EgressInfo) => e.egress_id ?? e.egressId ?? "";

/** Valida os destinos: rede conhecida, servidor rtmp(s):// e chave preenchida. */
export function destinosValidos(destinos: DestinoTransmissao[]): string | null {
  if (!destinos.length) return "Escolha pelo menos uma rede.";
  const vistas = new Set<RedeTransmissao>();
  for (const d of destinos) {
    const nome = REDES_TRANSMISSAO[d.rede]?.nome;
    if (!nome) return "Rede de transmissão inválida.";
    if (vistas.has(d.rede)) return `${nome} aparece duas vezes.`;
    vistas.add(d.rede);
    if (!/^rtmps?:\/\/[^\s/]+/i.test(d.servidor.trim()))
      return `Servidor do ${nome} inválido: cole a URL que começa com rtmp:// ou rtmps://.`;
    if (!d.chave.trim() || /\s/.test(d.chave.trim()))
      return `Cole a chave de transmissão do ${nome}.`;
  }
  return null;
}

/**
 * Começa a transmitir para as redes. Devolve os envios abertos no LiveKit.
 * Com `paginaDoPalco`, o LiveKit grava a própria página do palco (o layout
 * troca sozinho: só o avatar, ou jogo em tela cheia com o avatar no canto);
 * sem ela (app fora de um endereço público), grava só o avatar da sala.
 */
export async function iniciarTransmissao(
  cfg: ConfigLiveKit,
  sala: string,
  destinos: DestinoTransmissao[],
  paginaDoPalco?: (vertical: boolean) => string,
  /** Quem publica o vídeo na sala (o avatar; na sombra, quem opera). */
  identidadeVideo: string = IDENTIDADE_AVATAR,
): Promise<Transmissao> {
  const grupos = [false, true]
    .map((vertical) => ({
      vertical,
      destinos: destinos.filter((d) => REDES_TRANSMISSAO[d.rede].vertical === vertical),
    }))
    .filter((g) => g.destinos.length);
  const envios: EnvioTransmissao[] = [];
  try {
    for (const g of grupos) {
      const e = await chamarLiveKit<EgressInfo>(
        cfg,
        "Egress",
        "StartEgress",
        {
          ...(paginaDoPalco
            ? { web: { url: paginaDoPalco(g.vertical) } }
            : {
                room_name: sala,
                media: {
                  participant_video: { identity: identidadeVideo },
                  audio: { capture_all: true },
                },
              }),
          preset: g.vertical ? "PORTRAIT_H264_720P_30" : "H264_720P_30",
          outputs: [{ stream: { protocol: "RTMP", urls: g.destinos.map(urlDoDestino) } }],
        },
        GRAVAR,
      );
      envios.push({ id: idDoEnvio(e), redes: g.destinos.map((d) => d.rede), vertical: g.vertical });
    }
  } catch (e) {
    // Um grupo falhou: não deixa o outro transmitindo pela metade.
    await pararTransmissao(cfg, envios);
    throw e;
  }
  return { envios, inicio: Date.now() };
}

export async function pararTransmissao(
  cfg: ConfigLiveKit,
  envios: EnvioTransmissao[],
): Promise<void> {
  await Promise.all(
    envios.map((e) =>
      chamarLiveKit(cfg, "Egress", "StopEgress", { egress_id: e.id }, GRAVAR).catch((err) =>
        console.warn("[live] parar envio", e.id, (err as Error).message),
      ),
    ),
  );
}

const ESTADO: Record<string, EstadoEnvio> = {
  EGRESS_STARTING: "iniciando",
  EGRESS_ACTIVE: "ativa",
  EGRESS_ENDING: "terminou",
  EGRESS_COMPLETE: "terminou",
  EGRESS_FAILED: "falhou",
  EGRESS_ABORTED: "falhou",
  EGRESS_LIMIT_REACHED: "falhou",
};

/**
 * Como está cada rede agora. O LiveKit só lista os envios ainda abertos: o
 * que sumiu da lista terminou. O erro de cada rede vem do resultado do envio
 * (a URL vem com a chave escondida, então casa pela ordem das redes).
 */
export async function estadoDaTransmissao(
  cfg: ConfigLiveKit,
  t: Transmissao,
): Promise<EstadoTransmissao[]> {
  // Por id de cada envio: o envio da página do palco não fica ligado a uma sala.
  const items = (
    await Promise.all(
      t.envios.map((e) =>
        chamarLiveKit<{ items?: EgressInfo[] }>(cfg, "Egress", "ListEgress", { egress_id: e.id }, GRAVAR),
      ),
    )
  ).flatMap((r) => r.items ?? []);
  return t.envios.flatMap((envio) => {
    const info = items.find((i) => idDoEnvio(i) === envio.id);
    const geral: EstadoEnvio = info ? (ESTADO[info.status ?? ""] ?? "iniciando") : "terminou";
    const resultados = info?.stream_results ?? info?.streamResults ?? [];
    return envio.redes.map((rede, i) => {
      const r = resultados[i];
      const falhou = geral === "falhou" || r?.status === "FAILED";
      return {
        rede,
        estado: falhou ? "falhou" : r?.status === "FINISHED" ? "terminou" : geral,
        ...(falhou && (r?.error || info?.error) ? { erro: r?.error || info?.error } : {}),
      };
    });
  });
}
