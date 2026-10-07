import { describe, expect, it } from "vitest";
import { blocoTexto, inputFal, tamanho } from "./fal-imagem";

const base = { prompt: "p", qualidade: "padrao" as const };

describe("inputFal", () => {
  it("usa o endpoint de edição quando há referências e o de texto quando não há", () => {
    expect(
      inputFal({
        ...base,
        modelo: "seedream",
        tipo: "referencia",
        imageUrls: ["https://x/a.jpg"],
      }).endpoint,
    ).toBe("fal-ai/bytedance/seedream/v4.5/edit");
    const semRef = inputFal({
      ...base,
      modelo: "seedream",
      tipo: "referencia",
      imageUrls: [],
    });
    expect(semRef.endpoint).toBe(
      "fal-ai/bytedance/seedream/v4.5/text-to-image",
    );
    expect(semRef.input).not.toHaveProperty("image_urls");
    expect(
      inputFal({ ...base, modelo: "flux2", tipo: "retrato", imageUrls: ["u"] })
        .endpoint,
    ).toBe("fal-ai/flux-2-pro/edit");
    expect(
      inputFal({ ...base, modelo: "gpt-image", tipo: "retrato", imageUrls: [] })
        .endpoint,
    ).toBe("openai/gpt-image-2");
  });

  it("GPT Image: média no Padrão, alta no Pro", () => {
    expect(
      inputFal({
        ...base,
        modelo: "gpt-image",
        tipo: "referencia",
        imageUrls: [],
      }).input.quality,
    ).toBe("medium");
    expect(
      inputFal({
        ...base,
        qualidade: "pro",
        modelo: "gpt-image",
        tipo: "referencia",
        imageUrls: [],
      }).input.quality,
    ).toBe("high");
  });
});

describe("tamanho", () => {
  it("Seedream fica dentro de 2K–4K (lados ≥ 1920, ≤ 4096)", () => {
    for (const tipo of ["referencia", "retrato"] as const) {
      const { width, height } = tamanho("seedream", tipo);
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(1920);
      expect(Math.max(width, height)).toBeLessThanOrEqual(4096);
    }
  });

  it("GPT Image usa múltiplos de 16 e respeita a faixa de pixels", () => {
    for (const tipo of ["referencia", "retrato"] as const) {
      const { width, height } = tamanho("gpt-image", tipo);
      expect(width % 16).toBe(0);
      expect(height % 16).toBe(0);
      expect(width * height).toBeGreaterThanOrEqual(655_360);
      expect(width * height).toBeLessThanOrEqual(8_294_400);
    }
  });

  it("card é horizontal e retrato é vertical em todos os modelos", () => {
    for (const m of ["seedream", "flux2", "gpt-image"] as const) {
      expect(tamanho(m, "referencia").width).toBeGreaterThan(
        tamanho(m, "referencia").height,
      );
      expect(tamanho(m, "retrato").height).toBeGreaterThan(
        tamanho(m, "retrato").width,
      );
    }
  });
});

describe("blocoTexto", () => {
  it("pede o texto exato e abre exceção à regra de 'sem texto'", () => {
    const b = blocoTexto("  PROMO DE SEXTA ");
    expect(b).toContain('"PROMO DE SEXTA"');
    expect(b).toContain("only exception");
  });
});
