import { suave } from "./pontos";

/**
 * Esqueleto do avatar 3D. O modelo do fal vem sem ossos: aqui saem quatro
 * (raiz, peito, pescoço e cabeça), com as posições tiradas do rosto achado no
 * modelo, e o peso de cada vértice em cada osso. Contas puras (sem three),
 * em unidades do modelo (y para cima, rosto virado para +z).
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Juntas {
  /** Centro do pescoço em x. */
  cx: number;
  queixoY: number;
  /** Do queixo à testa. */
  alturaRosto: number;
  /** De uma lateral do rosto à outra. */
  larguraRosto: number;
  raiz: V3;
  peito: V3;
  pescoco: V3;
  cabeca: V3;
}

/** Ordem dos ossos (o índice de cada um no skinIndex). */
export const OSSOS = ["raiz", "peito", "pescoco", "cabeca"] as const;

/**
 * Meio da fatia do modelo numa altura (perto do eixo do pescoço): o ponto do
 * meio entre a frente e as costas. É onde a junta gira.
 */
export function meioDaFatia(
  posicoes: ArrayLike<number>,
  y: number,
  cx: number,
  meiaLargura: number,
  tolerancia: number,
): number | null {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < posicoes.length; i += 3) {
    if (Math.abs(posicoes[i + 1] - y) > tolerancia || Math.abs(posicoes[i] - cx) > meiaLargura) continue;
    const z = posicoes[i + 2];
    if (z < min) min = z;
    if (z > max) max = z;
  }
  return min <= max ? (min + max) / 2 : null;
}

/**
 * Onde ficam as juntas, a partir do rosto (queixo, testa e laterais, já em 3D)
 * e da altura do modelo. A cabeça gira um pouco acima do queixo (na altura da
 * mandíbula); o pescoço, no pé do pescoço; o peito, no meio do tronco.
 */
export function calcularJuntas(o: {
  posicoes: ArrayLike<number>;
  queixo: V3;
  testa: V3;
  lateralD: V3;
  lateralE: V3;
  minY: number;
}): Juntas {
  const h = Math.max(1e-4, o.testa.y - o.queixo.y);
  const w = Math.max(1e-4, Math.abs(o.lateralE.x - o.lateralD.x));
  const cx = (o.lateralD.x + o.lateralE.x) / 2;
  const zRosto = Math.max(o.queixo.z, o.testa.z);
  const junta = (y: number, meiaLargura: number, recuo: number): V3 => ({
    x: cx,
    y,
    z: meioDaFatia(o.posicoes, y, cx, meiaLargura, 0.06 * h) ?? zRosto - recuo,
  });
  const cabecaY = o.queixo.y + 0.2 * h;
  const pescocoY = o.queixo.y - 0.35 * h;
  const peitoY = Math.max(o.minY + 0.05 * h, pescocoY - 1.3 * h);
  return {
    cx,
    queixoY: o.queixo.y,
    alturaRosto: h,
    larguraRosto: w,
    raiz: { x: cx, y: o.minY, z: junta(peitoY, 0.6 * w, 0.5 * w).z },
    peito: junta(peitoY, 0.6 * w, 0.5 * w),
    pescoco: junta(pescocoY, 0.35 * w, 0.6 * w),
    cabeca: junta(cabecaY, 0.5 * w, 0.6 * w),
  };
}

/**
 * Peso do vértice em cada osso [raiz, peito, pescoço, cabeça], somando 1.
 * Pela altura, com passagens suaves; perto do pescoço, o que está longe do
 * eixo (ombros) fica com o peito, para não girar junto com a cabeça.
 */
export function pesos(x: number, y: number, j: Juntas): [number, number, number, number] {
  const h = j.alturaRosto;
  let cabeca = suave(j.queixoY - 0.25 * h, j.queixoY + 0.1 * h, y);
  let pescoco = suave(j.pescoco.y - 0.25 * h, j.pescoco.y + 0.15 * h, y);
  let peito = suave(j.peito.y - 0.6 * h, j.peito.y + 0.4 * h, y);
  const meioPescoco = 0.45 * j.larguraRosto;
  const abaixo = 1 - suave(j.queixoY - 0.35 * h, j.queixoY, y);
  const longe = suave(meioPescoco * 1.15, meioPescoco * 1.9, Math.abs(x - j.cx));
  const corte = 1 - abaixo * longe;
  cabeca *= corte;
  pescoco = Math.max(pescoco * corte, cabeca);
  peito = Math.max(peito, pescoco);
  return [1 - peito, peito - pescoco, pescoco - cabeca, cabeca];
}
