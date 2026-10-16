/**
 * A corrida de influencers do sorteio: a "receita" de quem corre quanto a cada
 * instante. O ganhador já foi sorteado no servidor (crypto) antes da largada;
 * a corrida só encena o resultado, com ultrapassagens. A receita sai toda da
 * semente, do número de corredores e de quem ganha: o servidor guarda os três
 * e cada tela (quem participa, o admin, o palco do OBS) monta a mesma corrida,
 * no mesmo instante. Contas puras, usadas no navegador e nos testes.
 */

/** Contagem antes da largada (segundos). */
export const CONTAGEM_S = 5;
/** Quando o ganhador cruza a linha (segundos depois da largada). */
export const DURACAO_S = 24;
/** Quando o último já chegou: a corrida acabou para todas as telas. */
export const FIM_S = DURACAO_S + 7;

/** Pontos de ritmo de cada corredor até a chegada. */
const PONTOS = 12;
/** Depois da linha, o corredor ainda anda isto (freando). */
const SOBRA = 0.06;

/** Gerador de números da semente (mulberry32): o mesmo em qualquer navegador. */
export function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Roteiro {
  /** Quando cada corredor cruza a linha (segundos desde a largada). */
  chegada: number[];
  /** Velocidade (já normalizada) em cada ponto, de 0 até a chegada. */
  ritmo: number[][];
  /** Distância percorrida até cada ponto (0 a 1). */
  feito: number[][];
}

/**
 * Monta a corrida: o ganhador chega em DURACAO_S; os outros, depois, numa
 * ordem sorteada (o 2º quase junto, para dar emoção). Cada um tem arrancadas e
 * cansaços sorteados; o ganhador guarda força para o fim.
 */
export function montarRoteiro(n: number, vencedor: number, semente: number): Roteiro {
  const r = gerador(semente);
  const outros = Array.from({ length: n }, (_, i) => i).filter((i) => i !== vencedor);
  for (let i = outros.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [outros[i], outros[j]] = [outros[j], outros[i]];
  }
  const chegada = new Array<number>(n);
  chegada[vencedor] = DURACAO_S;
  outros.forEach((c, k) => {
    const lugar = outros.length > 1 ? k / (outros.length - 1) : 0;
    chegada[c] = DURACAO_S + 0.18 + 5.5 * lugar ** 1.25 + r() * 0.12;
  });
  const ritmo: number[][] = [];
  const feito: number[][] = [];
  for (let i = 0; i < n; i++) {
    const bruto = Array.from({ length: PONTOS }, (_, j) => {
      let v = 0.55 + 0.9 * r();
      if (i === vencedor) v *= 0.85 + 0.35 * (j / (PONTOS - 1));
      return v;
    });
    // Suaviza (sem trancos) e larga do zero: a arrancada leva um instante.
    const v = bruto.map((x, j) => (x + (bruto[j - 1] ?? x) + (bruto[j + 1] ?? x)) / 3);
    v[0] = 0.15;
    const h = chegada[i] / (PONTOS - 1);
    const acum = [0];
    for (let j = 0; j < PONTOS - 1; j++) acum.push(acum[j] + (h * (v[j] + v[j + 1])) / 2);
    const total = acum[PONTOS - 1];
    ritmo.push(v.map((x) => x / total));
    feito.push(acum.map((x) => x / total));
  }
  return { chegada, ritmo, feito };
}

/** Quanto o corredor andou no instante `t` (segundos desde a largada): 0 na largada, 1 na linha. */
export function progresso(r: Roteiro, i: number, t: number): number {
  if (t <= 0) return 0;
  const f = r.chegada[i];
  if (t >= f) return 1 + SOBRA * (1 - Math.exp(-(t - f) / 1.2));
  const h = f / (PONTOS - 1);
  const j = Math.min(PONTOS - 2, Math.floor(t / h));
  const u = t - j * h;
  const v0 = r.ritmo[i][j];
  const v1 = r.ritmo[i][j + 1];
  return r.feito[i][j] + v0 * u + ((v1 - v0) * u * u) / (2 * h);
}

/** Quem está na frente no instante `t` (índices, do 1º ao último). */
export function classificacao(r: Roteiro, t: number): number[] {
  const p = r.chegada.map((_, i) => progresso(r, i, t));
  return p
    .map((_, i) => i)
    .sort((a, b) => (p[b] - p[a]) || r.chegada[a] - r.chegada[b]);
}
