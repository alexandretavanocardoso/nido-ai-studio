/**
 * Tempos do vídeo de referência (motion "a partir de um vídeo"): onde a cena
 * troca, onde o áudio bate e de que instantes tirar os quadros que o modelo vê.
 * Sem dependências (o app e os testes importam).
 */

/** Trocas de cena mais próximas que isso viram uma só (flash, piscada). */
const CORTE_MIN_INTERVALO = 0.25;

/**
 * Instantes das trocas de cena a partir da saída do ffmpeg com
 * `select='gt(scene,X)',showinfo` (uma linha "pts_time:12.34" por troca).
 */
export function cortesDoShowinfo(saida: string, duracao: number): number[] {
  const tempos = [...saida.matchAll(/pts_time:\s*([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .filter((t) => Number.isFinite(t) && t > CORTE_MIN_INTERVALO && t < duracao - CORTE_MIN_INTERVALO)
    .sort((a, b) => a - b);
  const cortes: number[] = [];
  for (const t of tempos)
    if (!cortes.length || t - cortes[cortes.length - 1] >= CORTE_MIN_INTERVALO) cortes.push(Number(t.toFixed(2)));
  return cortes;
}

/**
 * Batidas fortes do áudio (o "pulo" do volume em relação ao que vinha antes):
 * picos da novidade acima de média + 1,5 desvio, com pelo menos 0,2 s entre
 * eles. `envelope` é o volume (RMS) em quadros de 1/`fps` s.
 */
export function batidasDoEnvelope(envelope: number[], fps: number, max = 160): number[] {
  if (envelope.length < fps) return [];
  const janela = Math.max(2, Math.round(fps * 0.15));
  const novidade = envelope.map((v, i) => {
    if (i < janela) return 0;
    let soma = 0;
    for (let j = i - janela; j < i; j++) soma += envelope[j];
    return Math.max(0, v - soma / janela);
  });
  const media = novidade.reduce((a, b) => a + b, 0) / novidade.length;
  const desvio = Math.sqrt(novidade.reduce((a, b) => a + (b - media) ** 2, 0) / novidade.length);
  const limite = media + 1.5 * desvio;
  if (!(limite > 0)) return [];
  const minimo = Math.round(fps * 0.2);
  const batidas: number[] = [];
  let ultima = -Infinity;
  for (let i = 1; i < novidade.length - 1; i++) {
    const v = novidade[i];
    if (v < limite || v < novidade[i - 1] || v < novidade[i + 1]) continue;
    if (i - ultima < minimo) continue;
    batidas.push(Number((i / fps).toFixed(2)));
    ultima = i;
    if (batidas.length >= max) break;
  }
  return batidas;
}

/**
 * Instantes dos quadros que o modelo vê: o meio de cada cena (as cenas são o
 * que muda de verdade); com cenas demais, um subconjunto espalhado; com
 * poucas, completa com instantes espalhados pelo vídeo. Até `max`.
 */
export function temposDosQuadros(duracao: number, cortes: number[], max: number): number[] {
  const limites = [0, ...cortes.filter((c) => c > 0 && c < duracao), duracao];
  let tempos = limites.slice(1).map((fim, i) => (limites[i] + fim) / 2);
  if (tempos.length > max) {
    const passo = tempos.length / max;
    tempos = Array.from({ length: max }, (_, i) => tempos[Math.floor(i * passo + passo / 2)]);
  }
  const minimo = Math.min(6, max);
  if (tempos.length < minimo)
    tempos.push(...Array.from({ length: minimo }, (_, i) => ((i + 0.5) * duracao) / minimo));
  const ordenados = tempos.map((t) => Number(t.toFixed(2))).sort((a, b) => a - b);
  const finais: number[] = [];
  for (const t of ordenados) if (!finais.length || t - finais[finais.length - 1] >= 0.4) finais.push(t);
  return finais.slice(0, max);
}

/** Volume (RMS) de amostras mono de 16 bits em quadros de 1/`fps` s. */
export function envelopeDeAmostras(amostras: Int16Array, taxa: number, fps: number): number[] {
  const v: number[] = [];
  for (let k = 0; Math.round(((k + 1) * taxa) / fps) <= amostras.length; k++) {
    const a = Math.round((k * taxa) / fps);
    const b = Math.round(((k + 1) * taxa) / fps);
    let s = 0;
    for (let j = a; j < b; j++) s += amostras[j] * amostras[j];
    v.push(Math.sqrt(s / Math.max(1, b - a)));
  }
  return v;
}
