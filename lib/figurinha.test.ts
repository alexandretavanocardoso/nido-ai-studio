import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  FIGURINHA_MAX_BYTES,
  figurinhaTemFundo,
  LADO_FIGURINHA,
  montarFigurinha,
  montarFigurinhaInteira,
  promptFigurinha,
  recortarFundoBranco,
} from "./figurinha";

/** Um "personagem" de teste: círculo vermelho com um miolo branco, sobre fundo branco. */
async function desenho(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <rect width="400" height="300" fill="#ffffff"/>
    <circle cx="200" cy="150" r="100" fill="#d02020"/>
    <circle cx="200" cy="150" r="30" fill="#ffffff"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

const pixel = async (img: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(img)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

describe("figurinha", () => {
  it("recorte do fundo branco: some o de fora, fica o branco de dentro da figura", async () => {
    const recorte = await recortarFundoBranco(await desenho());
    expect((await pixel(recorte, 5, 5))[3]).toBe(0); // canto: fundo
    expect((await pixel(recorte, 200, 80))[3]).toBe(255); // vermelho
    expect((await pixel(recorte, 200, 150))[3]).toBe(255); // miolo branco, cercado
  });

  it("monta no formato do WhatsApp: WebP 512×512, transparente, até 100 KB, com contorno branco", async () => {
    const figurinha = await montarFigurinha(
      await recortarFundoBranco(await desenho()),
    );
    const meta = await sharp(figurinha).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(LADO_FIGURINHA);
    expect(meta.height).toBe(LADO_FIGURINHA);
    expect(meta.hasAlpha).toBe(true);
    expect(figurinha.length).toBeLessThanOrEqual(FIGURINHA_MAX_BYTES);
    // canto transparente; centro (miolo branco) opaco
    expect((await pixel(figurinha, 2, 2))[3]).toBe(0);
    expect((await pixel(figurinha, 256, 256))[3]).toBeGreaterThan(200);
    // contorno: logo fora do círculo (que ocupa a área útil) há branco opaco
    const y = 256;
    let achouContorno = false;
    for (let x = 0; x < 40 && !achouContorno; x++) {
      const [r, g, b, a] = await pixel(figurinha, x, y);
      if (a > 200 && r > 230 && g > 230 && b > 230) achouContorno = true;
    }
    expect(achouContorno).toBe(true);
  });

  it("o pedido leva a cena e exige fundo branco liso", () => {
    const p = promptFigurinha("rindo muito, com a mão na barriga");
    expect(p).toContain("rindo muito, com a mão na barriga");
    expect(p).toMatch(/pure white/);
    expect(p).toMatch(/same face/);
  });

  it("figurinha de quadro inteiro (com cenário) é reconhecida e sai inteira", async () => {
    const cena = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#305070" },
    })
      .png()
      .toBuffer();
    expect(await figurinhaTemFundo(cena)).toBe(true);
    expect(await figurinhaTemFundo(await recortarFundoBranco(await desenho()))).toBe(false);
    const figurinha = await montarFigurinhaInteira(cena);
    const meta = await sharp(figurinha).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 512, 512]);
    expect(figurinha.length).toBeLessThanOrEqual(FIGURINHA_MAX_BYTES);
    expect((await pixel(figurinha, 2, 2))[3]).toBe(255); // canto opaco: o cenário ficou
  });
});
