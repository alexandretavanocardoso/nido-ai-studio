import { describe, expect, it } from "vitest";
import { caixaEmPixels, quebrarLinhas } from "./ffmpeg";

describe("caixaEmPixels", () => {
  it("converte frações em pixels", () => {
    expect(
      caixaEmPixels({ x: 0.1, y: 0.2, w: 0.5, h: 0.1 }, 720, 1280),
    ).toEqual({ x: 72, y: 256, w: 360, h: 128 });
  });

  it("mantém 1px de margem dentro do quadro (exigência do delogo)", () => {
    const px = caixaEmPixels({ x: 0, y: 0, w: 1, h: 1 }, 720, 1280);
    expect(px).toEqual({ x: 1, y: 1, w: 718, h: 1278 });
  });
});

describe("quebrarLinhas", () => {
  it("quebra por palavra sem passar do limite", () => {
    const t = quebrarLinhas(
      "Quando o prazo é amanhã e você ainda não começou",
      24,
    );
    for (const l of t.split("\n")) expect(l.length).toBeLessThanOrEqual(24);
    expect(t.replace(/\n/g, " ")).toBe(
      "Quando o prazo é amanhã e você ainda não começou",
    );
  });

  it("respeita quebras de linha do usuário", () => {
    expect(quebrarLinhas("linha um\nlinha dois", 40)).toBe(
      "linha um\nlinha dois",
    );
  });
});
