"use client";

import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
} from "livekit-client";
import {
  IDENTIDADE_AVATAR,
  RPC_FALA_TERMINOU,
  RPC_LIMPAR,
  TAXA_AUDIO,
  TOPICO_AUDIO,
} from "@/lib/live/tipos";

export type EstadoSala = "conectando" | "esperando_avatar" | "no_ar" | "avatar_saiu" | "desconectada";

/**
 * A sala da live no navegador do operador (LiveKit). O operador entra como o
 * "agente" da conversa: manda o áudio de cada fala para o avatar do Runway por
 * byte stream (protocolo de avatar do LiveKit Agents) e o avatar publica o
 * vídeo e o áudio sincronizados, que aparecem aqui e no palco do OBS.
 */
export class SalaLive {
  readonly room = new Room({ adaptiveStream: false, dynacast: false });
  private terminouFala: (() => void) | null = null;
  private cancelada = false;

  constructor(
    private ao: {
      estado: (e: EstadoSala) => void;
      video: (t: RemoteTrack | null) => void;
      audio: (t: RemoteTrack | null) => void;
    },
  ) {
    const r = this.room;
    r.on(RoomEvent.TrackSubscribed, (track) => this.mostrar(track));
    r.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) this.ao.video(null);
      if (track.kind === Track.Kind.Audio) this.ao.audio(null);
    });
    r.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      if (p.identity !== IDENTIDADE_AVATAR) return;
      this.terminouFala?.();
      this.ao.video(null);
      this.ao.estado("avatar_saiu");
    });
    r.on(RoomEvent.Disconnected, () => this.ao.estado("desconectada"));
  }

  private mostrar(track: RemoteTrack) {
    if (track.kind === Track.Kind.Video) {
      this.ao.video(track);
      this.ao.estado("no_ar");
    } else if (track.kind === Track.Kind.Audio) this.ao.audio(track);
  }

  async conectar(url: string, token: string) {
    this.ao.estado("conectando");
    this.room.registerRpcMethod(RPC_FALA_TERMINOU, async (d) => {
      if (d.callerIdentity === IDENTIDADE_AVATAR) this.terminouFala?.();
      return "";
    });
    await this.room.connect(url, token, { autoSubscribe: true });
    await this.room.startAudio().catch(() => {});
    this.ao.estado("esperando_avatar");
    // O avatar pode já estar na sala (página recarregada).
    for (const p of this.room.remoteParticipants.values())
      for (const pub of p.trackPublications.values())
        if (pub.track) this.mostrar(pub.track);
  }

  /** O avatar já está na sala, com vídeo. */
  get avatarNoAr(): boolean {
    const p = this.room.remoteParticipants.get(IDENTIDADE_AVATAR);
    return !!p && [...p.trackPublications.values()].some((t) => t.kind === Track.Kind.Video);
  }

  /**
   * Fala um áudio PCM 16 bits mono 16 kHz que chega em streaming. Repassa ao
   * avatar enquanto chega e termina quando o avatar avisa que acabou de falar
   * (ou pelo tempo do áudio, se o aviso não vier).
   */
  async falar(audio: ReadableStream<Uint8Array>): Promise<void> {
    this.cancelada = false;
    const escritor = await this.room.localParticipant.streamBytes({
      name: `AUDIO_${Date.now().toString(36)}`,
      topic: TOPICO_AUDIO,
      destinationIdentities: [IDENTIDADE_AVATAR],
      attributes: { sample_rate: String(TAXA_AUDIO), num_channels: "1" },
    });
    const acabou = new Promise<void>((ok) => (this.terminouFala = ok));
    const leitor = audio.getReader();
    let sobra: Uint8Array | null = null;
    let bytes = 0;
    try {
      while (!this.cancelada) {
        const { done, value } = await leitor.read();
        if (done) break;
        let dados = value;
        if (sobra) {
          dados = new Uint8Array(sobra.length + value.length);
          dados.set(sobra);
          dados.set(value, sobra.length);
        }
        // Amostras de 2 bytes: um byte que sobra vai junto no próximo pedaço.
        const par = dados.length - (dados.length % 2);
        sobra = par < dados.length ? dados.slice(par) : null;
        if (par) {
          await escritor.write(dados.slice(0, par));
          bytes += par;
        }
      }
    } finally {
      leitor.cancel().catch(() => {});
      await escritor.close().catch(() => {});
    }
    if (this.cancelada || !bytes) return;
    const segundos = bytes / 2 / TAXA_AUDIO;
    await Promise.race([
      acabou,
      new Promise((ok) => setTimeout(ok, segundos * 1000 + 5000)),
    ]);
    this.terminouFala = null;
  }

  /** Corta a fala atual na hora. */
  async interromper() {
    this.cancelada = true;
    this.terminouFala?.();
    this.terminouFala = null;
    await this.room.localParticipant
      .performRpc({ destinationIdentity: IDENTIDADE_AVATAR, method: RPC_LIMPAR, payload: "" })
      .catch(() => {});
  }

  /** Avisa o avatar que a conversa acabou (ele sai da sala) e sai também. */
  async sair() {
    this.cancelada = true;
    if (this.room.remoteParticipants.has(IDENTIDADE_AVATAR))
      await this.room.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify({ type: "END_CALL" })), {
          reliable: true,
          destinationIdentities: [IDENTIDADE_AVATAR],
        })
        .catch(() => {});
    await this.room.disconnect().catch(() => {});
  }
}
