import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { montarPassos, QUADROS } from "./passos";

/**
 * Um "corredor" de mentira virado para a direita: cabelo atrás, cabeça para a
 * frente, tronco, perna e o pé apontando para a frente (o tamanho do pé marca
 * qual pose é). `espelho` vira para a esquerda, como o modelo às vezes faz.
 */
function figura(x: number, y: number, pe: number, espelho = false): string {
  const formas = `
    <rect x="20" y="10" width="20" height="22" fill="#3a2010"/>
    <circle cx="48" cy="34" r="22" fill="#e0b090"/>
    <rect x="20" y="58" width="34" height="140" fill="#d02020"/>
    <rect x="25" y="198" width="22" height="130" fill="#2040c0"/>
    <rect x="20" y="328" width="${30 + pe}" height="18" fill="#111111"/>`;
  const vira = espelho ? `translate(${x + 120} ${y}) scale(-1 1)` : `translate(${x} ${y})`;
  return `<g transform="${vira}">${formas}</g>`;
}

async function png(svg: string, w: number, h: number): Promise<Buffer> {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svg}</svg>`)).png().toBuffer();
}

describe("montarPassos (as pernas do corredor se mexendo)", () => {
  it("separa as 4 poses da folha, na ordem da grade, desvira a espelhada e alinha numa tira", async () => {
    const pes = [40, 60, 80, 100];
    const folha = await png(
      figura(60, 20, pes[0]) + figura(460, 30, pes[1]) + figura(60, 420, pes[2]) + figura(460, 425, pes[3], true),
      800,
      800,
    );
    const parada = await png(figura(0, 0, 60), 200, 360);
    const tira = await montarPassos(folha, parada);
    expect(tira).not.toBeNull();
    const { data, info } = await sharp(tira!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.height).toBe(360);
    expect(info.width % QUADROS).toBe(0);
    const cw = info.width / QUADROS;
    // Em cada quadro, o pé (as últimas linhas) aponta para a direita do meio do tronco, e cresce de pose em pose.
    const frente = Array.from({ length: QUADROS }, (_, k) => {
      let min = cw;
      let max = 0;
      for (let y = info.height - 8; y < info.height; y++)
        for (let x = 0; x < cw; x++)
          if (data[(y * info.width + k * cw + x) * 4 + 3] > 100) {
            min = Math.min(min, x);
            max = Math.max(max, x);
          }
      expect(max - cw / 2).toBeGreaterThan(cw / 2 - min);
      return max - cw / 2;
    });
    for (let k = 1; k < QUADROS; k++) expect(frente[k]).toBeGreaterThan(frente[k - 1]);
  });

  it("sem as 4 poses separadas (o modelo juntou ou esqueceu alguma), não monta", async () => {
    const folha = await png(figura(60, 20, 40) + figura(460, 30, 60) + figura(60, 420, 80), 800, 800);
    expect(await montarPassos(folha, await png(figura(0, 0, 60), 200, 360))).toBeNull();
  });
});
