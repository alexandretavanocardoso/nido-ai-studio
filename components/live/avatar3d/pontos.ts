/**
 * Pontos do rosto do MediaPipe (malha de 468 pontos) que o avatar 3D usa, e
 * contas de geometria em 2D. "Direito" e "esquerdo" são do personagem (o olho
 * direito dele aparece à esquerda na imagem).
 */

export interface P2 {
  x: number;
  y: number;
}

/** Lábios por dentro, de canto a canto (78 → 308). */
export const LABIO_SUP_INTERNO = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
export const LABIO_INF_INTERNO = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
/** Cantos de fora da boca, o alto do lábio de cima e o pé do lábio de baixo. */
export const CANTO_BOCA_D = 61;
export const CANTO_BOCA_E = 291;
export const LABIO_TOPO = 0;
export const LABIO_PE = 17;
/** Queixo, testa, ponta do nariz, base do nariz e as laterais do rosto. */
export const QUEIXO = 152;
export const TESTA = 10;
export const NARIZ = 1;
export const BASE_NARIZ = 2;
export const LATERAL_D = 234;
export const LATERAL_E = 454;

/** Pálpebras de canto a canto (do canto de fora para o de dentro). */
export const OLHO_D = {
  cima: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  baixo: [33, 7, 163, 144, 145, 153, 154, 155, 133],
};
export const OLHO_E = {
  cima: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  baixo: [263, 249, 390, 373, 374, 380, 381, 382, 362],
};
/** Sobrancelhas, de fora para dentro (borda de cima). */
export const SOBRANCELHA_D = [70, 63, 105, 66, 107];
export const SOBRANCELHA_E = [300, 293, 334, 296, 336];

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export function suave(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Uma linha de pontos (pálpebra, lábio) refeita em `n` pontos igualmente
 * espaçados em x, do primeiro ao último. Serve para casar duas linhas (a de
 * cima e a de baixo) ponto a ponto.
 */
export function reamostrar(linha: P2[], n: number): P2[] {
  const a = linha[0];
  const b = linha[linha.length - 1];
  const ordenada = [...linha].sort((p, q) => p.x - q.x);
  return Array.from({ length: n }, (_, i) => {
    const x = lerp(a.x, b.x, i / (n - 1));
    return { x, y: yEm(ordenada, x) };
  });
}

/** Altura da linha (pontos ordenados em x) no x pedido; fora dela, a da ponta. */
export function yEm(ordenada: P2[], x: number): number {
  if (x <= ordenada[0].x) return ordenada[0].y;
  for (let i = 1; i < ordenada.length; i++) {
    const p = ordenada[i - 1];
    const q = ordenada[i];
    if (x <= q.x) return q.x === p.x ? q.y : lerp(p.y, q.y, (x - p.x) / (q.x - p.x));
  }
  return ordenada[ordenada.length - 1].y;
}

export const media = (ps: P2[]): P2 => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
});

export const distancia = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);
