import type { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { clamp, lerp, type P2 } from "./pontos";

/**
 * Rastreio do rosto pela webcam (MediaPipe Face Landmarker, no navegador e de
 * graça): a cada quadro, a posição da cabeça e as "formas" do rosto (piscar,
 * boca aberta, sorriso…). O avatar copia como num espelho: a pessoa vira para
 * a esquerda dela e o avatar vira para o mesmo lado da tela.
 *
 * Os arquivos do MediaPipe (WASM, da mesma versão do pacote) vêm do jsDelivr;
 * o modelo do rosto, do Google.
 */
const VERSAO = "1.0.1";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSAO}/wasm`;
const MODELO = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let arquivos: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

async function criarLandmarker(modo: "IMAGE" | "VIDEO"): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  arquivos ??= FilesetResolver.forVisionTasks(WASM);
  const fs = await arquivos.catch((e) => {
    arquivos = null;
    throw e;
  });
  const opcoes = {
    runningMode: modo,
    numFaces: 1,
    outputFaceBlendshapes: modo === "VIDEO",
    outputFacialTransformationMatrixes: modo === "VIDEO",
  };
  try {
    return await FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODELO, delegate: "GPU" }, ...opcoes });
  } catch {
    // Sem WebGL para o MediaPipe (ou placa recusada): roda na CPU.
    return FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODELO, delegate: "CPU" }, ...opcoes });
  }
}

/** Os 468 pontos do rosto numa imagem (fração da largura e da altura, y para baixo). Null: sem rosto. */
export async function pontosDoRosto(img: HTMLCanvasElement): Promise<P2[] | null> {
  const fl = await criarLandmarker("IMAGE");
  try {
    const r = fl.detect(img);
    return r.faceLandmarks[0]?.map((p) => ({ x: p.x, y: p.y })) ?? null;
  } finally {
    fl.close();
  }
}

/** O que sai de um quadro da webcam, antes de virar expressão. */
export interface Leitura {
  /** Matriz 4×4 da cabeça (como o MediaPipe entrega). */
  matriz: number[];
  /** Formas do rosto (nome → 0..1). */
  formas: Record<string, number>;
  /** Ponta do nariz no quadro (fração, y para baixo). */
  nariz: P2;
}

/** O avatar num instante: cabeça (radianos, já espelhada), corpo e rosto. */
export interface Expressao {
  /** Positivo: o nariz vai para a direita da tela. */
  yaw: number;
  /** Positivo: olha para baixo. */
  pitch: number;
  /** Positivo: a cabeça tomba para a esquerda da tela. */
  roll: number;
  /** Inclinação do corpo (-1 esquerda da tela, 1 direita), de onde o rosto está no quadro. */
  inclinacao: number;
  /** Olho direito e esquerdo do avatar: 0 aberto, 1 fechado. */
  piscarD: number;
  piscarE: number;
  /** Boca: 0 fechada, 1 bem aberta. */
  boca: number;
  sorriso: number;
  /** Boca em bico (o, u). */
  bico: number;
  /** -1 franzida, 1 levantada. */
  sobrancelha: number;
}

export const NEUTRA: Expressao = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  inclinacao: 0,
  piscarD: 0,
  piscarE: 0,
  boca: 0,
  sorriso: 0,
  bico: 0,
  sobrancelha: 0,
};

/** Ângulos da cabeça na matriz (ordem YXZ, coluna a coluna como no three). */
export function angulos(m: number[]): { yaw: number; pitch: number; roll: number } {
  const m13 = m[8];
  const m21 = m[1];
  const m22 = m[5];
  const m23 = m[9];
  const m33 = m[10];
  return { pitch: Math.asin(-clamp(m23, -1, 1)), yaw: Math.atan2(m13, m33), roll: Math.atan2(m21, m22) };
}

const LIMITE = { yaw: 0.75, pitch: 0.5, roll: 0.5 };

/**
 * Leitura do MediaPipe → expressão do avatar, como num espelho. Os sinais
 * foram conferidos pondo o próprio avatar na frente da câmera: ele vira e
 * tomba para um lado e a cópia para o outro (a imagem refletida); olhar para
 * baixo continua para baixo; o olho direito fechado fecha o esquerdo da cópia.
 */
export function expressaoDaLeitura(l: Leitura): Expressao {
  const f = (n: string) => l.formas[n] ?? 0;
  const a = angulos(l.matriz);
  // Olho fechado no MediaPipe passa de ~0,5; aberto fica em ~0,05–0,3.
  const olho = (v: number) => clamp((v - 0.3) / 0.35);
  return {
    yaw: clamp(-a.yaw, -LIMITE.yaw, LIMITE.yaw),
    pitch: clamp(a.pitch, -LIMITE.pitch, LIMITE.pitch),
    roll: clamp(-a.roll, -LIMITE.roll, LIMITE.roll),
    inclinacao: clamp((0.5 - l.nariz.x) * 2.5, -1, 1),
    // Espelho: o olho direito da pessoa fecha o esquerdo do avatar.
    piscarE: olho(f("eyeBlinkRight")),
    piscarD: olho(f("eyeBlinkLeft")),
    boca: clamp((f("jawOpen") - 0.04) / 0.4),
    sorriso: clamp(((f("mouthSmileLeft") + f("mouthSmileRight")) / 2) * 1.6 - 0.1),
    bico: clamp(Math.max(f("mouthFunnel"), f("mouthPucker")) * 1.4 - 0.15),
    sobrancelha: clamp(
      f("browInnerUp") * 1.2 + ((f("browOuterUpLeft") + f("browOuterUpRight")) / 2) * 0.8 -
        ((f("browDownLeft") + f("browDownRight")) / 2) * 1.5,
      -1,
      1,
    ),
  };
}

/** O jeito natural da pessoa diante da câmera (cabeça e sobrancelhas): vira o centro do avatar. */
export type Calibracao = Pick<Expressao, "yaw" | "pitch" | "roll" | "sobrancelha">;

export const SEM_CALIBRACAO: Calibracao = { yaw: 0, pitch: 0, roll: 0, sobrancelha: 0 };

/**
 * Calibração a partir de alguns quadros com a pessoa parada: a mediana de
 * cada parte, com limite (uma câmera muito torta não vira o centro inteiro).
 */
export function calibrar(amostras: Expressao[]): Calibracao {
  const mediana = (k: keyof Calibracao) => {
    const v = amostras.map((a) => a[k]).sort((x, y) => x - y);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  };
  return {
    yaw: clamp(mediana("yaw"), -0.35, 0.35),
    pitch: clamp(mediana("pitch"), -0.35, 0.35),
    roll: clamp(mediana("roll"), -0.25, 0.25),
    sobrancelha: clamp(mediana("sobrancelha"), -0.4, 0.4),
  };
}

/** Tira o jeito natural da pessoa; nas sobrancelhas, ignora o que é quase parado. */
export function calibrada(e: Expressao, c: Calibracao): Expressao {
  const s = e.sobrancelha - c.sobrancelha;
  return {
    ...e,
    yaw: clamp(e.yaw - c.yaw, -LIMITE.yaw, LIMITE.yaw),
    pitch: clamp(e.pitch - c.pitch, -LIMITE.pitch, LIMITE.pitch),
    roll: clamp(e.roll - c.roll, -LIMITE.roll, LIMITE.roll),
    sobrancelha: Math.abs(s) < 0.12 ? 0 : clamp(s - Math.sign(s) * 0.12, -1, 1),
  };
}

/** Quanto cada parte acompanha o quadro novo (o resto é o anterior): suaviza o tremido. */
const RAPIDEZ: Record<keyof Expressao, number> = {
  yaw: 0.5,
  pitch: 0.5,
  roll: 0.5,
  inclinacao: 0.15,
  piscarD: 0.8,
  piscarE: 0.8,
  boca: 0.6,
  sorriso: 0.35,
  bico: 0.4,
  sobrancelha: 0.3,
};

/** Mistura a expressão nova na anterior (por parte), para o avatar não tremer. */
export function suavizar(antes: Expressao, nova: Expressao, fator = 1): Expressao {
  const r = {} as Expressao;
  for (const k of Object.keys(RAPIDEZ) as (keyof Expressao)[])
    r[k] = lerp(antes[k], nova[k], clamp(RAPIDEZ[k] * fator));
  return r;
}

/** Rastreio contínuo da webcam (modo vídeo do MediaPipe). */
export class Rastreio {
  private ultimo = -1;

  private constructor(private fl: FaceLandmarker) {}

  static async criar(): Promise<Rastreio> {
    return new Rastreio(await criarLandmarker("VIDEO"));
  }

  /** Lê o quadro atual do vídeo. Null: nenhum rosto (ou quadro repetido). */
  ler(video: HTMLVideoElement, agoraMs: number): Leitura | null {
    if (video.readyState < 2 || !video.videoWidth) return null;
    // O MediaPipe exige tempos sempre crescentes.
    const t = Math.max(agoraMs, this.ultimo + 1);
    this.ultimo = t;
    const r = this.fl.detectForVideo(video, t);
    const pontos = r.faceLandmarks[0];
    const matriz = r.facialTransformationMatrixes[0]?.data;
    if (!pontos || !matriz) return null;
    const formas: Record<string, number> = {};
    for (const c of r.faceBlendshapes[0]?.categories ?? []) formas[c.categoryName] = c.score;
    return { matriz, formas, nariz: { x: pontos[1].x, y: pontos[1].y } };
  }

  fechar() {
    this.fl.close();
  }
}
