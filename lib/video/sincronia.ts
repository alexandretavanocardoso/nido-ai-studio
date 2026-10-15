/**
 * Sincronia da fala com a boca nos vídeos falados de corpo inteiro (Wan,
 * Seedance, Hailuo). O modelo recebe o MP3 da fala como referência e gera a
 * pessoa falando — mas nem sempre no segundo zero: em 15/10/2026 o Wan 3.0
 * começou a falar 0,67s depois e esticou a fala ~3% (a boca segue o áudio que
 * ele mesmo gerou). Trocar o som do vídeo pelo MP3 a partir do zero deixava a
 * voz até 1s adiantada. Aqui, a partir do volume dos dois áudios, sai quanto
 * atrasar e em que ritmo tocar o MP3 para cair em cima da boca.
 */

/** Volume (RMS) da fala em quadros de 1/`fps` s. */
export type Envelope = number[];

export const FPS_ENVELOPE = 30;

/** Amostras mono (16 bits) → volume de cada quadro. */
export function envelopeDeAmostras(amostras: Int16Array, taxa: number, fps = FPS_ENVELOPE): Envelope {
  const v: Envelope = [];
  for (let k = 0; Math.round(((k + 1) * taxa) / fps) <= amostras.length; k++) {
    const a = Math.round((k * taxa) / fps);
    const b = Math.round(((k + 1) * taxa) / fps);
    let s = 0;
    for (let j = a; j < b; j++) s += amostras[j] * amostras[j];
    v.push(Math.sqrt(s / Math.max(1, b - a)));
  }
  return v;
}

/** Onde a fala começa e termina (s): primeiro e último quadro acima de 12% do pico. Null sem fala. */
export function inicioEFimDaFala(v: Envelope, fps = FPS_ENVELOPE): { inicio: number; fim: number } | null {
  if (v.length < 3) return null;
  const s = v.map((_, i) => (v[i - 1] ?? v[i]) / 4 + v[i] / 2 + (v[i + 1] ?? v[i]) / 4);
  const pico = Math.max(...s);
  // Silêncio ou quase (o modelo não devolveu fala): não dá para medir.
  if (pico < 300) return null;
  const limite = pico * 0.12;
  const ini = s.findIndex((x) => x > limite);
  const fim = s.length - 1 - [...s].reverse().findIndex((x) => x > limite);
  if (ini < 0 || fim <= ini) return null;
  return { inicio: ini / fps, fim: (fim + 1) / fps };
}

/**
 * Como tocar o MP3 para casar com a fala do modelo: `ritmo` multiplica a
 * duração da fala (1,03 = 3% mais lenta) e `atraso` é quando o MP3 começa no
 * vídeo (s; negativo corta o começo do MP3). `fimNoVideo` é onde a fala acaba
 * no vídeo. Null quando os dois não parecem a mesma fala (aí fica como era).
 */
export function alinharFala(
  modelo: Envelope,
  fala: Envelope,
  fps = FPS_ENVELOPE,
): { atraso: number; ritmo: number; fimNoVideo: number } | null {
  const m = inicioEFimDaFala(modelo, fps);
  const f = inicioEFimDaFala(fala, fps);
  if (!m || !f) return null;
  const ritmo = (m.fim - m.inicio) / (f.fim - f.inicio);
  // Fora disso não é a mesma fala esticada: melhor não mexer.
  if (!(ritmo > 0.85 && ritmo < 1.18)) return null;
  const atraso = m.inicio - f.inicio * ritmo;
  if (atraso < -0.5 || atraso > 2.5) return null;
  // Diferença pequena demais para alguém perceber: não mexe.
  if (Math.abs(atraso) < 0.06 && Math.abs(ritmo - 1) < 0.015) return null;
  return { atraso: Number(atraso.toFixed(3)), ritmo: Number(ritmo.toFixed(4)), fimNoVideo: m.fim };
}

/** Pausa que fica antes da fala quando o modelo demora a começar (o resto do começo é cortado). */
export const PAUSA_ANTES_DA_FALA = 0.25;

/**
 * Como montar a cena com a fala alinhada (tempos em s, na linha do tempo do
 * clipe): o vídeo vai de `inicio` a `fim` (e repete o último quadro por `pad`
 * se o clipe acabar antes da fala); o MP3, no ritmo `ritmo`, começa `atraso`
 * depois do início da cena (negativo: corta o começo do MP3). `duracao` é o
 * tamanho da cena pronta.
 */
export function montagemDaCena(o: {
  alinhamento: { atraso: number; ritmo: number };
  duracaoFala: number;
  duracaoClipe: number;
}): { inicio: number; fim: number; pad: number; atraso: number; ritmo: number; duracao: number } {
  const { atraso, ritmo } = o.alinhamento;
  // O modelo esperou para falar: corta a espera, deixando uma pausa natural.
  const inicio = Math.max(0, Math.min(atraso - PAUSA_ANTES_DA_FALA, o.duracaoClipe - 1));
  const alvo = atraso + o.duracaoFala * ritmo;
  const fim = Math.min(o.duracaoClipe, alvo);
  const r = (x: number) => Number(x.toFixed(3));
  return {
    inicio: r(inicio),
    fim: r(fim),
    pad: r(Math.max(0, alvo - fim)),
    atraso: r(atraso - inicio),
    ritmo,
    duracao: r(alvo - inicio),
  };
}
