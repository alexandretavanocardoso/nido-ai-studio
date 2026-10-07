import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { closeDoRosto, ehModeloTroca, MOTORES_TROCA } from "./troca";

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
  it("o Kling padrão é o O1 Pro, e jobs antigos (standard) continuam reconhecidos", () => {
    expect(MOTORES_TROCA.kling.modelo).toBe(
      "fal-ai/kling-video/o1/video-to-video/edit",
    );
    expect(
      ehModeloTroca("fal-ai/kling-video/o1/standard/video-to-video/edit"),
    ).toBe(true);
    expect(ehModeloTroca("outro/modelo")).toBe(false);
  });
});
