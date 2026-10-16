"use client";

import { Track, type LocalTrackPublication, type Room } from "livekit-client";
import { Avatar3D } from "./avatar3d/motor";
import {
  calibrada,
  calibrar,
  expressaoDaLeitura,
  NEUTRA,
  pontosDoRosto,
  Rastreio,
  SEM_CALIBRACAO,
  suavizar,
  type Calibracao,
  type Expressao,
} from "./avatar3d/rastreio";
import { ATRASO_VOZ_TROCADA, podeAtrasarVideo, RetardoDeVideo, VozNaSala } from "./sombra";

/**
 * Sombra 3D no navegador de quem faz a live: o avatar 3D do influencer
 * (components/live/avatar3d) copia a cabeça e o rosto da webcam, como num
 * espelho, e o canvas dele vira a câmera na sala do LiveKit — o palco, o OBS,
 * o Discord e as redes mostram o mesmo que a Sombra ao vivo. Sem IA por
 * minuto: o rastreio (MediaPipe) e o desenho (three.js) rodam aqui.
 *
 * Antes de entrar no ar, o avatar já aparece no palco (respirando e piscando)
 * e dá para testar com a câmera sem custo. A voz é a própria (com um pequeno
 * atraso, o do desenho) ou a trocada, como na Sombra ao vivo.
 */

const QUADRO_MS = 1000 / 30;
/** Sem rosto na câmera por mais que isto: avisa e o avatar volta ao repouso. */
const SEM_ROSTO_MS = 1500;
/** Quadros com rosto usados para calibrar (o jeito natural da pessoa vira o centro). */
const QUADROS_CALIBRACAO = 20;

interface Ao {
  /** O vídeo do avatar (para o palco desta página). */
  video: (s: MediaStream | null) => void;
  /** A câmera está ligada e não acha um rosto (ou voltou a achar). */
  semRosto: (sem: boolean) => void;
  erro: (mensagem: string) => void;
}

export class Sombra3D {
  private avatar: Avatar3D | null = null;
  private rastreio: Rastreio | null = null;
  private camera: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private relogio: Worker | null = null;
  private saida: MediaStream | null = null;
  private expressao: Expressao = NEUTRA;
  private calibracao: Calibracao = SEM_CALIBRACAO;
  /** Quadros juntados para a calibração (null: já calibrado). */
  private amostras: Expressao[] | null = [];
  private ultimoRosto = 0;
  private avisouSemRosto = false;
  private ultimoQuadro = 0;
  private proximaPiscada = 0;
  private readonly inicio = performance.now();
  private room: Room | null = null;
  private videoPub: LocalTrackPublication | null = null;
  private retardo: RetardoDeVideo | null = null;
  private voz: VozNaSala;
  private readonly atrasoVideo: number;
  private parada = false;

  constructor(private o: { liveId: string; vozTrocada: boolean; sincroniaMs: number; ao: Ao }) {
    this.atrasoVideo = o.vozTrocada && podeAtrasarVideo() ? ATRASO_VOZ_TROCADA : 0;
    this.voz = new VozNaSala({
      liveId: o.liveId,
      vozTrocada: o.vozTrocada,
      atrasoVideo: this.atrasoVideo,
      sincroniaMs: o.sincroniaMs,
      aoErro: (m) => o.ao.erro(m),
    });
  }

  /** A voz trocada vai sem casar com a boca (navegador sem atraso de vídeo). */
  get vozSemSincronia(): boolean {
    return this.o.vozTrocada && !this.atrasoVideo;
  }

  get cameraLigada(): boolean {
    return !!this.camera;
  }

  /** O modelo não teve o rosto achado: mexe só a cabeça. */
  get soCabeca(): boolean {
    return !!this.avatar && !this.avatar.temRosto;
  }

  /** Carrega o avatar (modelo e fundo) e começa a desenhar, em repouso. */
  async carregar(modelo: string, fundo: string | null) {
    const avatar = await Avatar3D.carregar({ modelo, fundo, acharRosto: pontosDoRosto });
    if (this.parada) return avatar.dispose();
    this.avatar = avatar;
    this.saida = avatar.stream(30);
    this.o.ao.video(this.saida);
    this.ligarRelogio();
  }

  /**
   * Liga a webcam e o microfone (o navegador pede permissão) e o avatar passa
   * a copiar os movimentos. Antes de cobrar: se o navegador recusar, nada é cobrado.
   */
  async abrirCamera() {
    if (this.camera) return;
    const camera = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    if (this.parada) return camera.getTracks().forEach((t) => t.stop());
    this.camera = camera;
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream(camera.getVideoTracks());
    await v.play().catch(() => {});
    this.video = v;
    this.ultimoRosto = performance.now();
    this.centralizar();
    try {
      this.rastreio ??= await Rastreio.criar();
    } catch (e) {
      throw new Error(`Não consegui ligar o rastreio do rosto: ${(e as Error).message}`);
    }
  }

  /** Põe o vídeo do avatar e a voz na sala (de novo, se a sala mudou). */
  async conectar(room: Room) {
    if (!this.avatar || !this.saida) throw new Error("O avatar 3D ainda está carregando.");
    if (!this.camera) await this.abrirCamera();
    if (this.room && this.room !== room) await this.sairDaSala();
    this.room = room;
    let trilha = this.saida.getVideoTracks()[0];
    if (this.atrasoVideo) {
      this.retardo ??= new RetardoDeVideo(this.atrasoVideo * 1000);
      this.retardo.entrada(trilha);
      trilha = this.retardo.saida;
      // O palco desta página mostra o que vai para a sala (atrasado como a voz).
      this.o.ao.video(new MediaStream([trilha]));
    }
    if (!this.videoPub)
      this.videoPub = await room.localParticipant.publishTrack(trilha, {
        source: Track.Source.Camera,
        name: "sombra3d",
        simulcast: false,
        videoEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
      });
    const [mic] = this.camera?.getAudioTracks() ?? [];
    if (mic && !this.voz.publicada) await this.voz.publicar(room, mic);
  }

  ajustarSincronia(ms: number) {
    this.voz.ajustarSincronia(ms);
  }

  /**
   * O jeito como a pessoa está agora (de frente para a tela, com a câmera em
   * cima ou do lado) vira o centro do avatar. Roda sozinho ao ligar a câmera.
   */
  centralizar() {
    this.amostras = [];
  }

  /** Corta o microfone (o avatar continua). */
  mutar(mudo: boolean) {
    for (const t of this.camera?.getAudioTracks() ?? []) t.enabled = !mudo;
  }

  private async sairDaSala() {
    const room = this.room;
    if (!room) return;
    await this.voz.parar(room);
    if (this.videoPub?.track) await room.localParticipant.unpublishTrack(this.videoPub.track, false).catch(() => {});
    this.videoPub = null;
    this.room = null;
  }

  /**
   * O relógio dos quadros roda num worker: o requestAnimationFrame para com a
   * aba em segundo plano, e a live não pode congelar se a pessoa trocar de aba.
   */
  private ligarRelogio() {
    const codigo = "let t;onmessage=(e)=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),e.data)}";
    const url = URL.createObjectURL(new Blob([codigo], { type: "text/javascript" }));
    this.relogio = new Worker(url);
    URL.revokeObjectURL(url);
    this.relogio.onmessage = () => this.quadro();
    this.relogio.postMessage(QUADRO_MS);
  }

  private quadro() {
    const agora = performance.now();
    // Quadros atrasados na fila (a aba engasgou): pula, em vez de acumular.
    if (!this.avatar || this.parada || agora - this.ultimoQuadro < QUADRO_MS * 0.7) return;
    this.ultimoQuadro = agora;
    let leitura = null;
    try {
      leitura = this.rastreio && this.video ? this.rastreio.ler(this.video, agora) : null;
    } catch (e) {
      console.warn("[sombra3d] rastreio", (e as Error).message);
    }
    if (leitura) {
      this.ultimoRosto = agora;
      const crua = expressaoDaLeitura(leitura);
      if (this.amostras) {
        this.amostras.push(crua);
        if (this.amostras.length >= QUADROS_CALIBRACAO) {
          this.calibracao = calibrar(this.amostras);
          this.amostras = null;
        }
      }
      this.expressao = suavizar(this.expressao, calibrada(crua, this.calibracao));
    } else {
      // Sem câmera ou sem rosto: volta devagar ao repouso e pisca sozinho.
      const repouso = { ...NEUTRA, ...this.piscadaSozinha(agora) };
      this.expressao = suavizar(this.expressao, repouso, this.camera ? 0.25 : 1);
    }
    const sem = !!this.camera && agora - this.ultimoRosto > SEM_ROSTO_MS;
    if (sem !== this.avisouSemRosto) {
      this.avisouSemRosto = sem;
      this.o.ao.semRosto(sem);
    }
    try {
      this.avatar.desenhar(this.expressao, (agora - this.inicio) / 1000);
    } catch (e) {
      console.warn("[sombra3d] desenho", (e as Error).message);
    }
  }

  /** Uma piscada a cada 2,5–5,5 s, de ~160 ms. */
  private piscadaSozinha(agora: number): Pick<Expressao, "piscarD" | "piscarE"> {
    if (agora > this.proximaPiscada + 160) this.proximaPiscada = agora + 2500 + Math.random() * 3000;
    const fechado = agora >= this.proximaPiscada ? 1 : 0;
    return { piscarD: fechado, piscarE: fechado };
  }

  /** Para tudo: relógio, câmera, rastreio, sala e o avatar. */
  async parar() {
    this.parada = true;
    this.relogio?.terminate();
    this.relogio = null;
    await this.sairDaSala();
    this.retardo?.parar();
    this.retardo = null;
    this.camera?.getTracks().forEach((t) => t.stop());
    this.camera = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.rastreio?.fechar();
    this.rastreio = null;
    this.saida?.getTracks().forEach((t) => t.stop());
    this.saida = null;
    this.avatar?.dispose();
    this.avatar = null;
    this.o.ao.video(null);
  }
}
