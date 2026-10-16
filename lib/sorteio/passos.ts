import sharp, { type Sharp } from "sharp";
import { QUADROS_PASSOS } from "./tipos";

/**
 * As pernas do corredor se mexendo: o Nano Banana desenha o mesmo influencer
 * em 4 poses do ciclo de corrida, numa folha 2×2 (uma imagem só, para as
 * quatro saírem com a mesma cara, roupa e traço); o fundo sai e aqui cada pose
 * vira um quadro de uma tira, alinhado pelo pé e pelo meio do tronco — a tela
 * troca os quadros com a passada. Pose que vier espelhada (o modelo às vezes
 * vira o personagem para a esquerda) é desvirada comparando com a figura
 * parada, que corre para a direita.
 */
export const QUADROS = QUADROS_PASSOS;

export const PEDIDO_PASSOS = [
  "Turn this exact same character into a 4-frame running cycle sprite sheet for a 2D side-scrolling game.",
  "Layout: a 2x2 grid of four equal cells — top-left is frame 1, top-right frame 2, bottom-left frame 3, bottom-right frame 4. Each cell shows the whole character once, full body from the top of the head to the shoes, at exactly the same size and scale in every cell, seen from the side, running to the RIGHT, with clear empty space between the four figures.",
  "Frame 1: right leg stretched forward with the heel touching the ground, left leg extended behind, left arm forward, right arm back.",
  "Frame 2: right foot planted under the body, left knee driven high forward, arms swinging through.",
  "Frame 3: left leg stretched forward with the heel touching the ground, right leg extended behind, right arm forward, left arm back.",
  "Frame 4: left foot planted under the body, right knee driven high forward, arms swinging through.",
  "Keep them perfectly recognisable and identical in every frame: same face, hair, skin, body type, outfit, accessories, colours and the same art style as the reference image.",
  "Every figure faces and runs to the RIGHT. Plain pure white background, no grid lines, no borders, no frame numbers, no text, no floor, no shadow, no other people.",
].join("\n");

/** Altura da tira (px), a mesma da figura parada. */
const ALTURA = 360;
/** Alfa a partir do qual o pixel é do personagem. */
const CHEIO = 100;

interface Mancha {
  id: number;
  n: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Quadro {
  px: Buffer;
  w: number;
  h: number;
}

/** Manchas (pedaços conectados) do alfa, da maior para a menor, e o rótulo de cada pixel. */
function manchas(data: Buffer, w: number, h: number): { lista: Mancha[]; rotulo: Int32Array } {
  const rotulo = new Int32Array(w * h).fill(-1);
  const fila = new Int32Array(w * h);
  const lista: Mancha[] = [];
  for (let i = 0; i < w * h; i++) {
    if (rotulo[i] !== -1 || data[i * 4 + 3] < CHEIO) continue;
    const m: Mancha = { id: lista.length, n: 0, x0: w, y0: h, x1: 0, y1: 0 };
    let ini = 0;
    let fim = 0;
    fila[fim++] = i;
    rotulo[i] = m.id;
    while (ini < fim) {
      const p = fila[ini++];
      const x = p % w;
      const y = (p / w) | 0;
      m.n++;
      if (x < m.x0) m.x0 = x;
      if (x > m.x1) m.x1 = x;
      if (y < m.y0) m.y0 = y;
      if (y > m.y1) m.y1 = y;
      const vizinhos = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of vizinhos) {
        if (q < 0 || q >= w * h || rotulo[q] !== -1 || data[q * 4 + 3] < CHEIO) continue;
        rotulo[q] = m.id;
        fila[fim++] = q;
      }
    }
    lista.push(m);
  }
  return { lista: [...lista].sort((a, b) => b.n - a.n), rotulo };
}

/** As 4 poses da folha recortada, na ordem da grade, cada uma só com os pixels dela. */
function separar(data: Buffer, w: number, h: number): Quadro[] | null {
  const { lista, rotulo } = manchas(data, w, h);
  const poses = lista.slice(0, QUADROS);
  // Quatro figuras de tamanho parecido; senão o modelo juntou ou cortou alguma.
  if (poses.length < QUADROS || poses[QUADROS - 1].n < poses[0].n * 0.4) return null;
  // Pedaços soltos (uma mecha de cabelo, um sapato) vão para a pose mais perto.
  const dono = new Map<number, Mancha>(poses.map((p) => [p.id, p]));
  for (const m of lista.slice(QUADROS)) {
    if (m.n < 30) continue;
    const cx = (m.x0 + m.x1) / 2;
    const cy = (m.y0 + m.y1) / 2;
    let melhor = poses[0];
    let dist = Infinity;
    for (const p of poses) {
      const d = Math.max(p.x0 - cx, 0, cx - p.x1) + Math.max(p.y0 - cy, 0, cy - p.y1);
      if (d < dist) {
        dist = d;
        melhor = p;
      }
    }
    if (dist > Math.max(w, h) * 0.05) continue;
    dono.set(m.id, melhor);
    melhor.x0 = Math.min(melhor.x0, m.x0);
    melhor.x1 = Math.max(melhor.x1, m.x1);
    melhor.y0 = Math.min(melhor.y0, m.y0);
    melhor.y1 = Math.max(melhor.y1, m.y1);
  }
  // Ordem da grade: linha de cima, depois a de baixo; da esquerda para a direita.
  const meioY = poses.reduce((s, p) => s + (p.y0 + p.y1) / 2, 0) / poses.length;
  const linha = (p: Mancha) => ((p.y0 + p.y1) / 2 > meioY ? 1 : 0);
  poses.sort((a, b) => linha(a) - linha(b) || a.x0 - b.x0);
  return poses.map((p) => {
    const qw = p.x1 - p.x0 + 1;
    const qh = p.y1 - p.y0 + 1;
    const px = Buffer.alloc(qw * qh * 4);
    for (let y = 0; y < qh; y++)
      for (let x = 0; x < qw; x++) {
        const i = (p.y0 + y) * w + (p.x0 + x);
        if (rotulo[i] !== -1 && dono.get(rotulo[i]) === p) data.copy(px, (y * qw + x) * 4, i * 4, i * 4 + 4);
      }
    return { px, w: qw, h: qh };
  });
}

/** Retrato pequeno da metade de cima (cabeça e tronco): cores pesadas pelo alfa. */
async function assinatura(img: Sharp): Promise<Float32Array> {
  const { data } = await img.resize(16, 24, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const v = new Float32Array(16 * 12 * 4);
  for (let i = 0; i < v.length / 4; i++) {
    const a = data[i * 4 + 3] / 255;
    v[i * 4] = (data[i * 4] / 255) * a;
    v[i * 4 + 1] = (data[i * 4 + 1] / 255) * a;
    v[i * 4 + 2] = (data[i * 4 + 2] / 255) * a;
    v[i * 4 + 3] = a;
  }
  return v;
}

function distancia(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

/**
 * Da folha já sem fundo (PNG com alfa) para a tira de quadros (WebP de
 * QUADROS × largura, ALTURA px). `figura` é o corredor parado (virado para a
 * direita), para desvirar as poses espelhadas. Devolve null se a folha não
 * tiver as 4 poses separadas.
 */
export async function montarPassos(folhaSemFundo: Buffer, figura: Buffer): Promise<Buffer | null> {
  const { data, info } = await sharp(folhaSemFundo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const poses = separar(data, info.width, info.height);
  if (!poses) return null;
  const ref = await assinatura(sharp(figura).trim());
  const quadros: Quadro[] = [];
  for (const p of poses) {
    const bruto = () => sharp(p.px, { raw: { width: p.w, height: p.h, channels: 4 } });
    const normal = distancia(await assinatura(bruto()), ref);
    const espelho = distancia(await assinatura(bruto().flop()), ref);
    if (espelho < normal) {
      const { data: virado } = await bruto().flop().raw().toBuffer({ resolveWithObject: true });
      quadros.push({ px: virado, w: p.w, h: p.h });
    } else quadros.push(p);
  }
  // Âncora de cada pose: o meio do tronco (40% de cima), para o corpo não escorregar entre os quadros.
  const ancoras = quadros.map((q) => {
    let soma = 0;
    let conta = 0;
    for (let y = 0; y < q.h * 0.4; y++)
      for (let x = 0; x < q.w; x++)
        if (q.px[(y * q.w + x) * 4 + 3] >= CHEIO) {
          soma += x;
          conta++;
        }
    return conta ? soma / conta : q.w / 2;
  });
  const escala = ALTURA / Math.max(...quadros.map((q) => q.h));
  const meia = Math.ceil(Math.max(...quadros.map((q, k) => Math.max(ancoras[k], q.w - ancoras[k]))) * escala) + 2;
  const largura = meia * 2;
  const camadas = await Promise.all(
    quadros.map(async (q, k) => {
      const nw = Math.max(1, Math.round(q.w * escala));
      const nh = Math.max(1, Math.round(q.h * escala));
      const input = await sharp(q.px, { raw: { width: q.w, height: q.h, channels: 4 } }).resize(nw, nh).png().toBuffer();
      // Pé no chão da tira e o tronco no meio do quadro.
      return { input, left: k * largura + Math.round(meia - ancoras[k] * escala), top: ALTURA - nh };
    }),
  );
  return sharp({ create: { width: largura * QUADROS, height: ALTURA, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(camadas)
    .webp({ quality: 85, alphaQuality: 90 })
    .toBuffer();
}
