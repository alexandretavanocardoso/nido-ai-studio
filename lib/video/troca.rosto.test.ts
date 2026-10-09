import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  caberNaProporcao,
  closeDoRosto,
  ehModeloTroca,
  MODELOS_KLING,
  MOTORES_TROCA,
} from "./troca";

/** Figura escura em pé sobre branco, com margem. */
const figura = (largura: number, altura: number) =>
  sharp({
    create: { width: 600, height: 1000, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: {
          create: {
            width: largura,
            height: altura,
            channels: 3,
            background: "#402020",
          },
        },
        left: Math.round((600 - largura) / 2),
        top: Math.round((1000 - altura) / 2),
      },
    ])
    .png()
    .toBuffer();

describe("imagens dentro da proporção que o Kling aceita (0,4 a 2,5)", () => {
  const proporcao = async (b: Buffer) => {
    const m = await sharp(b).metadata();
    return m.width! / m.height!;
  };
  const lisa = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: "#402020" } })
      .png()
      .toBuffer();

  it("figura larga (pouco mais alta que larga): o close não vira uma tira", async () => {
    // 760×1000: o terço de cima daria 760×300 = 2,53 — o Kling recusava.
    const close = await closeDoRosto(await figura(580, 760));
    expect(await proporcao(close!)).toBeLessThanOrEqual(2.2);
  });

  it("completa com branco a imagem alta ou larga demais, sem cortar nem deformar", async () => {
    const alta = await caberNaProporcao(await lisa(300, 1500)); // 0,2
    const larga = await caberNaProporcao(await lisa(1500, 300)); // 5
    expect(await proporcao(alta)).toBeGreaterThanOrEqual(0.44);
    expect(await proporcao(larga)).toBeLessThanOrEqual(2.21);
    // A figura continua do mesmo tamanho: só ganhou margem.
    expect((await sharp(alta).metadata()).height).toBe(1500);
    expect((await sharp(larga).metadata()).width).toBe(1500);
  });

  it("imagem numa proporção normal volta como veio", async () => {
    const normal = await lisa(1024, 1536);
    expect(await caberNaProporcao(normal)).toBe(normal);
  });
});

describe("closeDoRosto", () => {
  it("corta o terço de cima da figura em pé e amplia para 1024px de largura", async () => {
    const close = await closeDoRosto(await figura(300, 900));
    const meta = await sharp(close!).metadata();
    expect(meta.width).toBe(1024);
    // 30% de 900 = 270 de altura para 300 de largura → proporção 0,9
    expect(meta.height! / meta.width!).toBeCloseTo(0.9, 1);
  });

  it("não inventa close quando a imagem já é um retrato curto", async () => {
    expect(await closeDoRosto(await figura(400, 420))).toBeNull();
  });
});

describe("modelos da troca", () => {
  it("o Kling padrão é o O3 Pro (trechos de até 15s), e jobs antigos do O1 continuam reconhecidos", () => {
    expect(MOTORES_TROCA.kling).toEqual({
      modelo: "fal-ai/kling-video/o3/pro/video-to-video/edit",
      maxTrecho: 15,
    });
    expect(
      ehModeloTroca("fal-ai/kling-video/o1/standard/video-to-video/edit"),
    ).toBe(true);
    expect(ehModeloTroca("fal-ai/kling-video/o1/video-to-video/edit")).toBe(
      true,
    );
  });

  it("cada formato do Kling O3 tem seu endpoint", () => {
    expect(MODELOS_KLING).toEqual({
      standard: "fal-ai/kling-video/o3/standard/video-to-video/edit",
      pro: "fal-ai/kling-video/o3/pro/video-to-video/edit",
      "4k": "fal-ai/kling-video/o3/4k/video-to-video/edit",
    });
    for (const m of Object.values(MODELOS_KLING))
      expect(ehModeloTroca(m)).toBe(true);
    expect(ehModeloTroca("outro/modelo")).toBe(false);
  });
});
