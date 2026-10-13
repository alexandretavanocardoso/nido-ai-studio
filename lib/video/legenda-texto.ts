/**
 * Como a legenda nova é escrita no vídeo. Fica fora de ./ffmpeg (que só roda no
 * servidor) porque a tela usa as mesmas regras para mostrar a prévia.
 */

/** Tamanho da letra, em fração da largura do vídeo. */
export const LEGENDA_FONTE = 0.062;
/** Altura de cada linha, em vezes o tamanho da letra. */
export const LEGENDA_ALTURA_LINHA = 1.25;
/** Contorno preto, em fração do tamanho da letra. */
export const LEGENDA_CONTORNO = 1 / 11;

/** Largura média de um caractere, em vezes o tamanho da letra. */
const LARGURA_LETRA = 0.58;
/** Até esta distância do meio do vídeo (fração da largura), a legenda gruda no meio. */
export const LEGENDA_IMA = 0.03;

/** Quantos caracteres cabem numa linha, com a letra em `fontsize` (mesma unidade de `largura`). */
export function caracteresPorLinha(largura: number, fontsize: number): number {
  return Math.max(8, Math.floor((largura * 0.88) / (fontsize * LARGURA_LETRA)));
}

/**
 * Meio da legenda, em fração da largura do vídeo: o meio da área marcada. Com a
 * área quase no meio do vídeo, a legenda fica no meio exato (a mão não acerta o
 * centro), e a linha mais comprida nunca sai do quadro.
 */
export function centroDaLegenda(
  caixa: { x: number; w: number },
  linhas: string[],
): number {
  const meio = caixa.x + caixa.w / 2;
  if (Math.abs(meio - 0.5) <= LEGENDA_IMA) return 0.5;
  const metade =
    (Math.max(0, ...linhas.map((l) => l.length)) *
      LEGENDA_FONTE *
      LARGURA_LETRA) /
    2;
  return metade >= 0.5 ? 0.5 : Math.min(1 - metade, Math.max(metade, meio));
}

/** Quebra o texto em linhas que caibam em `maxChars`. */
export function quebrarLinhas(texto: string, maxChars: number): string {
  const linhas: string[] = [];
  for (const paragrafo of texto.trim().split(/\r?\n/)) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      if (atual && (atual + " " + palavra).length > maxChars) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = atual ? `${atual} ${palavra}` : palavra;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas.join("\n");
}
