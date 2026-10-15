"use client";

import { createDecartClient, models, type RealTimeClient } from "@decartai/sdk";
import { Track, type LocalTrackPublication, type Room } from "livekit-client";

/**
 * Shadow ao vivo no navegador de quem faz a live: a webcam vai para o Lucy 2.5
 * da Decart (com o token curto de /api/live/[id]/decart) e volta com o
 * influencer no lugar da pessoa; esse vídeo e a voz entram na sala do LiveKit
 * como câmera e microfone — o palco, o OBS e as redes mostram o mesmo.
 *
 * A voz é a da própria pessoa (com um pequeno atraso, o do Lucy, para a boca
 * casar) ou a trocada na ElevenLabs (/api/live/[id]/voz), em pedaços cortados
 * nas pausas. A troca leva uns segundos, então a live inteira (vídeo e voz)
 * vai com um atraso fixo — o público não percebe, as redes já atrasam mais
 * que isso. Atrasar o vídeo precisa do Chrome ou do Edge.
 */

export type EstadoSombra = "camera" | "conectando" | "na_fila" | "no_ar" | "caiu";

/** Atraso fixo da live com a voz trocada (segundos): o pedaço mais longo mais a troca. */
export const ATRASO_VOZ_TROCADA = 4;
/** Quanto o Lucy atrasa o vídeo (a voz espera isso para casar com a boca). Ajustável na tela. */
export const SINCRONIA_PADRAO_MS = 250;
export const SINCRONIA_MAX_MS = 1500;

/** Dá para atrasar o vídeo (e casar com a voz trocada) neste navegador? */
export const podeAtrasarVideo = (): boolean =>
  typeof window !== "undefined" &&
  "MediaStreamTrackProcessor" in window &&
  "MediaStreamTrackGenerator" in window;

interface Ao {
  estado: (e: EstadoSombra, filaPosicao?: number) => void;
  /** Vídeo que está indo para a sala (para o palco desta página). */
  video: (s: MediaStream | null) => void;
  erro: (mensagem: string) => void;
}

export class SombraAoVivo {
  private camera: MediaStream | null = null;
  private decart: RealTimeClient | null = null;
  private ctx: AudioContext | null = null;
  private atrasoProprio: DelayNode | null = null;
  private voz: VozTrocada | null = null;
  private retardo: RetardoDeVideo | null = null;
  private videoPub: LocalTrackPublication | null = null;
  private audioPub: LocalTrackPublication | null = null;
  private sincronia = SINCRONIA_PADRAO_MS / 1000;
  private parada = false;
  /** Reaberturas automáticas seguidas (zeram quando o vídeo volta). */
  private tentativas = 0;
  /** Atraso do vídeo depois do Lucy (só com a voz trocada, onde dá). */
  private readonly atrasoVideo: number;

  constructor(
    private o: {
      room: Room;
      liveId: string;
      /** Foto do influencer (endereço do arquivo no app). */
      imagem: string;
      vozTrocada: boolean;
      ao: Ao;
    },
  ) {
    this.atrasoVideo = o.vozTrocada && podeAtrasarVideo() ? ATRASO_VOZ_TROCADA : 0;
  }

  /** A voz trocada vai sem casar com a boca (navegador sem atraso de vídeo). */
  get vozSemSincronia(): boolean {
    return this.o.vozTrocada && !this.atrasoVideo;
  }

  /** Liga a webcam e o microfone (o navegador pede permissão). Antes de cobrar. */
  async abrirCamera(): Promise<void> {
    if (this.camera) return;
    this.o.ao.estado("camera");
    this.camera = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  }

  /** Abre a sessão no Lucy (ou reabre, pelo botão, se caiu) e põe o vídeo e a voz na sala. */
  async conectar(): Promise<void> {
    this.tentativas = 0;
    await this.abrir();
  }

  private async abrir(): Promise<void> {
    if (!this.camera) await this.abrirCamera();
    this.parada = false;
    const antiga = this.decart;
    this.decart = null;
    antiga?.disconnect();
    this.o.ao.estado("conectando");
    const res = await fetch(`/api/live/${this.o.liveId}/decart`, { method: "POST" });
    const b = (await res.json().catch(() => ({}))) as { apiKey?: string; pedido?: string; error?: string };
    if (!res.ok || !b.apiKey || !b.pedido) throw new Error(b.error ?? `Falha (HTTP ${res.status}).`);
    const foto = await fetch(this.o.imagem);
    if (!foto.ok) throw new Error("Não consegui ler a foto do influencer.");
    const imagem = await foto.blob();

    const cliente = createDecartClient({ apiKey: b.apiKey, telemetry: false });
    const decart = await cliente.realtime.connect(new MediaStream(this.camera!.getVideoTracks()), {
      model: models.realtime("lucy-2.5"),
      initialState: { prompt: { text: b.pedido, enhance: true }, image: imagem },
      onRemoteStream: (s) => void this.receber(s).catch((e) => this.o.ao.erro((e as Error).message)),
      onQueuePosition: (q) => this.o.ao.estado("na_fila", q.position),
    });
    if (this.parada) return decart.disconnect();
    this.decart = decart;
    // Só a sessão atual conta: a antiga, desligada aqui, também avisa que caiu.
    const atual = () => this.decart === decart;
    decart.on("sessionEnded", () => atual() && this.caiu());
    decart.on("connectionChange", (c) => {
      if (!atual()) return;
      if (c === "reconnecting") this.o.ao.estado("conectando");
      else if ((c === "connected" || c === "generating") && this.videoPub) this.o.ao.estado("no_ar");
      else if (c === "disconnected") this.caiu();
    });
    decart.on("error", (e) => atual() && this.o.ao.erro(e.message));
  }

  /**
   * A sessão do Lucy acabou (queda de rede, ou o teto de 1 h por sessão numa
   * live longa): reabre sozinha até 3 vezes; depois, fica o botão "Reconectar".
   */
  private caiu() {
    if (this.parada) return;
    this.decart = null;
    if (this.tentativas >= 3) return this.o.ao.estado("caiu");
    this.tentativas++;
    this.o.ao.estado("conectando");
    setTimeout(() => {
      if (!this.parada) void this.abrir().catch(() => this.caiu());
    }, 2000 * this.tentativas);
  }

  /** Chegou o vídeo do Lucy: vai para a sala (atrasado, com a voz trocada). */
  private async receber(stream: MediaStream) {
    const [video] = stream.getVideoTracks();
    if (!video || this.parada) return;
    let saida = video;
    if (this.atrasoVideo) {
      this.retardo ??= new RetardoDeVideo(this.atrasoVideo * 1000);
      this.retardo.entrada(video);
      saida = this.retardo.saida;
    }
    const lp = this.o.room.localParticipant;
    const atual = this.videoPub?.videoTrack;
    if (atual) {
      if (atual.mediaStreamTrack !== saida) await atual.replaceTrack(saida, true);
    } else {
      this.videoPub = await lp.publishTrack(saida, {
        source: Track.Source.Camera,
        name: "sombra",
        simulcast: false,
        videoEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
      });
    }
    this.o.ao.video(new MediaStream([saida]));
    if (!this.audioPub) await this.publicarVoz();
    this.tentativas = 0;
    this.o.ao.estado("no_ar");
  }

  /** Microfone para a sala: a voz da pessoa (atrasada pelo Lucy) ou a trocada. */
  private async publicarVoz() {
    const [mic] = this.camera?.getAudioTracks() ?? [];
    if (!mic) return;
    const ctx = (this.ctx ??= new AudioContext());
    await ctx.resume();
    const entrada = ctx.createMediaStreamSource(new MediaStream([mic]));
    const saida = ctx.createMediaStreamDestination();
    if (this.o.vozTrocada) {
      this.voz = new VozTrocada(ctx, entrada, saida, this.o.liveId, () =>
        this.atrasoVideo ? this.atrasoVideo + this.sincronia : 0,
      (m) => this.o.ao.erro(m));
    } else {
      this.atrasoProprio = ctx.createDelay(SINCRONIA_MAX_MS / 1000);
      this.atrasoProprio.delayTime.value = this.sincronia;
      entrada.connect(this.atrasoProprio).connect(saida);
    }
    const [trilha] = saida.stream.getAudioTracks();
    this.audioPub = await this.o.room.localParticipant.publishTrack(trilha, {
      source: Track.Source.Microphone,
      name: "voz",
    });
  }

  /** Quanto a voz espera para casar com a boca (o atraso do Lucy). */
  ajustarSincronia(ms: number) {
    this.sincronia = Math.min(SINCRONIA_MAX_MS, Math.max(0, ms)) / 1000;
    if (this.atrasoProprio) this.atrasoProprio.delayTime.value = this.sincronia;
  }

  /** Corta o microfone (a pessoa some do áudio; o vídeo continua). */
  mutar(mudo: boolean) {
    for (const t of this.camera?.getAudioTracks() ?? []) t.enabled = !mudo;
  }

  /** Para tudo: Lucy, câmera, voz e o que estava na sala. */
  async parar() {
    this.parada = true;
    this.decart?.disconnect();
    this.decart = null;
    this.voz?.parar();
    this.retardo?.parar();
    const lp = this.o.room.localParticipant;
    for (const pub of [this.videoPub, this.audioPub])
      if (pub?.track) await lp.unpublishTrack(pub.track, true).catch(() => {});
    this.videoPub = this.audioPub = null;
    this.camera?.getTracks().forEach((t) => t.stop());
    this.camera = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.o.ao.video(null);
  }
}

/* ------------------------------------------------------------------ */
/* Voz trocada: pedaços cortados nas pausas → ElevenLabs → na hora certa */
/* ------------------------------------------------------------------ */

const TAXA = 16_000;
/** Quadros de 20 ms (a 16 kHz). */
const QUADRO = 320;
const QUADROS_MAX = 125; // 2,5 s: o pedaço mais longo
const QUADROS_MIN = 40; // 0,8 s antes de cortar numa pausa
const PAUSA = 15; // 300 ms de silêncio corta o pedaço
const FALA_MIN = 10; // menos de 200 ms de fala: não manda
const SO_SILENCIO = 25; // 0,5 s sem fala: descarta (fica 100 ms antes da fala)

class VozTrocada {
  private proc: ScriptProcessorNode;
  private mudo: GainNode;
  /** Sobra da reamostragem e do quadro em formação. */
  private resto = new Float32Array(0);
  private quadros: Float32Array[] = [];
  private fala = 0;
  private silencioFinal = 0;
  private ruido = 0.004;
  /** Hora (relógio do áudio) da primeira amostra do pedaço atual. */
  private inicio = -1;
  /** A fila respeita a ordem dos pedaços; as trocas correm em paralelo. */
  private fila: Promise<void> = Promise.resolve();
  /** Onde termina o último pedaço agendado (não sobrepõe). */
  private fim = 0;
  private avisouErro = false;
  private parado = false;

  constructor(
    private ctx: AudioContext,
    entrada: AudioNode,
    private saida: AudioNode,
    private liveId: string,
    /** Atraso de cada pedaço desde que foi falado (segundos); 0 = assim que chegar. */
    private atraso: () => number,
    private aoErro: (m: string) => void,
  ) {
    this.proc = ctx.createScriptProcessor(2048, 1, 1);
    // O processador só roda ligado à saída: vai mudo para os alto-falantes.
    this.mudo = ctx.createGain();
    this.mudo.gain.value = 0;
    entrada.connect(this.proc);
    this.proc.connect(this.mudo).connect(ctx.destination);
    this.proc.onaudioprocess = (e) => this.ouvir(e.inputBuffer);
  }

  private ouvir(buf: AudioBuffer) {
    if (this.parado) return;
    const dados = buf.getChannelData(0);
    const agora = this.ctx.currentTime - buf.duration;
    if (this.inicio < 0) this.inicio = agora;
    // Reamostra para 16 kHz (média das amostras de cada intervalo).
    const razao = buf.sampleRate / TAXA;
    const n = Math.floor(dados.length / razao);
    const novo = new Float32Array(this.resto.length + n);
    novo.set(this.resto);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * razao);
      const b = Math.min(dados.length, Math.floor((i + 1) * razao));
      let s = 0;
      for (let j = a; j < b; j++) s += dados[j];
      novo[this.resto.length + i] = s / Math.max(1, b - a);
    }
    let pos = 0;
    while (novo.length - pos >= QUADRO) {
      this.quadro(novo.slice(pos, pos + QUADRO));
      pos += QUADRO;
    }
    this.resto = novo.slice(pos);
  }

  private quadro(q: Float32Array) {
    let soma = 0;
    for (const v of q) soma += v * v;
    const rms = Math.sqrt(soma / q.length);
    const falando = rms > Math.max(0.012, this.ruido * 3);
    if (!falando) this.ruido = this.ruido * 0.98 + rms * 0.02;
    this.quadros.push(q);
    if (falando) {
      this.fala++;
      this.silencioFinal = 0;
    } else this.silencioFinal++;

    if (!this.fala && this.quadros.length > SO_SILENCIO) {
      const fora = this.quadros.length - 5;
      this.quadros = this.quadros.slice(fora);
      this.inicio += (fora * QUADRO) / TAXA;
      return;
    }
    const pausa = this.silencioFinal >= PAUSA && this.quadros.length >= QUADROS_MIN;
    if (this.fala && (pausa || this.quadros.length >= QUADROS_MAX)) this.cortar();
  }

  private cortar() {
    const quadros = this.quadros;
    const inicio = this.inicio;
    const fala = this.fala;
    this.quadros = [];
    this.fala = 0;
    this.silencioFinal = 0;
    this.inicio = inicio + (quadros.length * QUADRO) / TAXA;
    if (fala < FALA_MIN) return;
    const pcm = new Int16Array(quadros.length * QUADRO);
    quadros.forEach((q, i) => {
      for (let j = 0; j < QUADRO; j++)
        pcm[i * QUADRO + j] = Math.max(-1, Math.min(1, q[j])) * 0x7fff;
    });
    const trocado = fetch(`/api/live/${this.liveId}/voz`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: pcm.buffer,
    }).then(async (r) => {
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Falha na voz (HTTP ${r.status}).`);
      }
      return r.arrayBuffer();
    });
    this.fila = this.fila
      .then(() => trocado)
      .then((voz) => this.tocar(voz, inicio))
      .catch((e) => {
        if (this.avisouErro) return;
        this.avisouErro = true;
        this.aoErro((e as Error).message);
      });
  }

  /** Agenda o pedaço trocado: na hora em que foi falado mais o atraso da live. */
  private tocar(voz: ArrayBuffer, inicio: number) {
    if (this.parado || voz.byteLength < 2) return;
    const amostras = new Int16Array(voz, 0, Math.floor(voz.byteLength / 2));
    const buf = this.ctx.createBuffer(1, amostras.length, TAXA);
    const canal = buf.getChannelData(0);
    for (let i = 0; i < amostras.length; i++) canal[i] = amostras[i] / 0x8000;
    const fonte = this.ctx.createBufferSource();
    fonte.buffer = buf;
    fonte.connect(this.saida);
    const atraso = this.atraso();
    const quando = Math.max(atraso ? inicio + atraso : 0, this.ctx.currentTime + 0.02, this.fim);
    fonte.start(quando);
    this.fim = quando + buf.duration;
  }

  parar() {
    this.parado = true;
    this.proc.onaudioprocess = null;
    this.proc.disconnect();
    this.mudo.disconnect();
  }
}

/* ------------------------------------------------------------------ */
/* Vídeo atrasado (Chrome/Edge): segura os quadros e solta depois       */
/* ------------------------------------------------------------------ */

interface ProcessadorDeTrilha {
  readable: ReadableStream<VideoFrame>;
}
interface GeradorDeTrilha extends MediaStreamTrack {
  writable: WritableStream<VideoFrame>;
}
type JanelaComTrilhas = Window & {
  MediaStreamTrackProcessor: new (o: { track: MediaStreamTrack }) => ProcessadorDeTrilha;
  MediaStreamTrackGenerator: new (o: { kind: "video" }) => GeradorDeTrilha;
};

/** Quadros guardados no máximo (~5 s a 30 fps): uma folga se o atraso crescer. */
const MAX_QUADROS_GUARDADOS = 150;

class RetardoDeVideo {
  readonly saida: GeradorDeTrilha;
  private escritor: WritableStreamDefaultWriter<VideoFrame>;
  private leitor: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private fila: { em: number; dados: Uint8Array; init: VideoFrameBufferInit }[] = [];

  constructor(private ms: number) {
    const w = window as unknown as JanelaComTrilhas;
    this.saida = new w.MediaStreamTrackGenerator({ kind: "video" });
    this.escritor = this.saida.writable.getWriter();
  }

  /** Troca o vídeo de entrada (o Lucy reconectou); a saída continua a mesma. */
  entrada(trilha: MediaStreamTrack) {
    void this.leitor?.cancel().catch(() => {});
    const w = window as unknown as JanelaComTrilhas;
    const leitor = new w.MediaStreamTrackProcessor({ track: trilha }).readable.getReader();
    this.leitor = leitor;
    void this.ler(leitor);
  }

  private async ler(leitor: ReadableStreamDefaultReader<VideoFrame>) {
    for (;;) {
      const r = await leitor.read().catch(() => null);
      if (!r || r.done || !r.value) return;
      const quadro = r.value;
      const agora = performance.now();
      try {
        // Copia e solta o quadro na hora: segurar o original trava o decodificador.
        const ret = quadro.visibleRect;
        if (quadro.format && ret) {
          const dados = new Uint8Array(quadro.allocationSize());
          const layout = await quadro.copyTo(dados);
          this.fila.push({
            em: agora + this.ms,
            dados,
            init: {
              format: quadro.format,
              codedWidth: ret.width,
              codedHeight: ret.height,
              displayWidth: quadro.displayWidth,
              displayHeight: quadro.displayHeight,
              timestamp: 0,
              layout,
            },
          });
        }
      } catch {
        // Quadro que não deu para copiar: pula.
      } finally {
        quadro.close();
      }
      if (this.fila.length > MAX_QUADROS_GUARDADOS) this.fila.splice(0, this.fila.length - MAX_QUADROS_GUARDADOS);
      // Os quadros chegam o tempo todo (30 por segundo): cada um solta os que venceram.
      while (this.fila[0] && this.fila[0].em <= agora) {
        const q = this.fila.shift()!;
        const saida = new VideoFrame(q.dados, { ...q.init, timestamp: Math.round(performance.now() * 1000) });
        await this.escritor.write(saida).catch(() => {});
        saida.close();
      }
    }
  }

  parar() {
    void this.leitor?.cancel().catch(() => {});
    this.leitor = null;
    this.fila = [];
    void this.escritor.close().catch(() => {});
    this.saida.stop();
  }
}
