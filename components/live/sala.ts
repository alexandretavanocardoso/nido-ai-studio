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

  /* ---------------------------------------------------------------- */
  /* Jogo na tela: vai para a sala como "tela" (o palco monta o layout) */
  /* ---------------------------------------------------------------- */

  private jogo: "tela" | "video" | null = null;
  private trilhasDoVideo: MediaStreamTrack[] = [];
  private audioDoVideo: {
    ctx: AudioContext;
    /** Volume aqui na página. */
    monitor: GainNode;
    /** O som que vai para a sala. */
    saida: MediaStreamAudioDestinationNode;
  } | null = null;

  /**
   * Compartilha uma tela ou janela (com o som, quando o navegador deixa).
   * Devolve a trilha de vídeo, para a prévia e para a IA ver o jogo; `aoParar`
   * é chamado se a pessoa parar pelo próprio navegador.
   */
  async compartilharTela(aoParar: () => void): Promise<MediaStreamTrack | null> {
    await this.pararJogo();
    const pub = await this.room.localParticipant.setScreenShareEnabled(
      true,
      { audio: true, resolution: { width: 1920, height: 1080, frameRate: 30 } },
      { name: "jogo" },
    );
    const trilha = pub?.videoTrack?.mediaStreamTrack ?? null;
    if (!trilha) return null;
    this.jogo = "tela";
    trilha.addEventListener("ended", () => {
      this.jogo = null;
      aoParar();
    });
    return trilha;
  }

  /**
   * Publica um vídeo gravado que está tocando em `el` (em repetição). O som
   * passa por um mixer: vai para a sala e, aqui, só no volume de `ouvir`.
   */
  async publicarVideo(el: HTMLVideoElement, ouvir: boolean): Promise<void> {
    await this.pararJogo();
    const imagem = (el as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
    const [video] = imagem.getVideoTracks();
    if (!video) throw new Error("Não consegui ler a imagem do vídeo.");
    // O mixer só pode ser criado uma vez por elemento: reaproveita.
    if (!this.audioDoVideo || this.audioDoVideo.ctx.state === "closed") {
      const ctx = new AudioContext();
      const origem = ctx.createMediaElementSource(el);
      const monitor = ctx.createGain();
      origem.connect(monitor).connect(ctx.destination);
      const saida = ctx.createMediaStreamDestination();
      origem.connect(saida);
      this.audioDoVideo = { ctx, monitor, saida };
    }
    await this.audioDoVideo.ctx.resume();
    this.ouvirJogo(ouvir);
    const audio = this.audioDoVideo.saida.stream.getAudioTracks()[0];
    const lp = this.room.localParticipant;
    await lp.publishTrack(video, { source: Track.Source.ScreenShare, name: "jogo" });
    this.trilhasDoVideo = [video];
    if (audio) {
      await lp.publishTrack(audio, { source: Track.Source.ScreenShareAudio, name: "jogo-audio" });
      this.trilhasDoVideo.push(audio);
    }
    this.jogo = "video";
  }

  /** Volume do jogo aqui na página (na sala, o som vai sempre). */
  ouvirJogo(ouvir: boolean) {
    if (this.audioDoVideo) this.audioDoVideo.monitor.gain.value = ouvir ? 0.6 : 0;
  }

  async pararJogo() {
    const lp = this.room.localParticipant;
    if (this.jogo === "tela") await lp.setScreenShareEnabled(false).catch(() => {});
    if (this.jogo === "video")
      for (const t of this.trilhasDoVideo) await lp.unpublishTrack(t, false).catch(() => {});
    this.trilhasDoVideo = [];
    this.jogo = null;
  }

  /** Avisa o avatar que a conversa acabou (ele sai da sala) e sai também. */
  async sair() {
    this.cancelada = true;
    await this.pararJogo();
    void this.audioDoVideo?.ctx.close().catch(() => {});
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
