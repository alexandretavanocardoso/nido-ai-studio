import { describe, expect, it } from "vitest";
import {
  bloqueioTrocaPremium,
  bloqueioCriarVideo,
  bloqueioImagem,
  bloqueioTroca,
  creditosCriarVideo,
  creditosImagem,
  creditosTrocaPremium,
  creditosTroca,
  PACOTES,
  PLANOS,
  PLANOS_PAGOS,
  precoPlano,
} from "./planos";

describe("custo em créditos", () => {
  it("imagens", () => {
    expect(creditosImagem("nano-banana", "padrao")).toBe(5);
    expect(creditosImagem("nano-banana", "pro")).toBe(10);
    expect(creditosImagem("seedream", "pro")).toBe(5);
    expect(creditosImagem("gpt-image", "pro")).toBe(20);
  });

  it("vídeo cobra por segundo, arredondando pra cima", () => {
    expect(creditosTroca(30)).toBe(390);
    expect(creditosTroca(29.2)).toBe(390);
    expect(creditosTroca(2)).toBe(39); // mínimo de 3s do Kling
    expect(creditosTrocaPremium(30)).toBe(870);
    expect(creditosTrocaPremium(3)).toBe(116); // Seedance gera no mínimo 4s
    expect(creditosCriarVideo("gen4.5", 5, false)).toBe(60);
    expect(creditosCriarVideo("veo3.1_fast", 8, true)).toBe(120);
    expect(creditosCriarVideo("gen4_turbo", 10, true)).toBe(50); // Gen-4 não tem áudio
  });
});

describe("margem: o crédito nunca sai abaixo do custo", () => {
  it("todo plano e pacote vende o crédito a pelo menos US$ 0,018 (custo = US$ 0,01)", () => {
    // Pior caso = anual com 20% off e 100% dos créditos usados: ~44% de margem antes de taxas.
    for (const id of PLANOS_PAGOS) {
      const anual = precoPlano(id, "anual", "USD") / 12 / PLANOS[id].creditos;
      expect(anual).toBeGreaterThanOrEqual(0.018);
    }
    for (const p of Object.values(PACOTES)) expect(p.precoUSD / p.creditos).toBeGreaterThan(0.02);
  });
});

describe("bloqueios por plano", () => {
  it("grátis: só modelos básicos, sem vídeo", () => {
    expect(bloqueioImagem("gratis", "seedream", "padrao")).toBeNull();
    expect(bloqueioImagem("gratis", "flux2", "padrao")).not.toBeNull();
    expect(bloqueioTroca("gratis", 10)).not.toBeNull();
    expect(bloqueioCriarVideo("gratis", "gen4_turbo", false)).not.toBeNull();
  });

  it("starter: sem Pro, troca até 15s, sem Premium", () => {
    expect(bloqueioImagem("starter", "nano-banana", "pro")).not.toBeNull();
    expect(bloqueioTroca("starter", 15)).toBeNull();
    expect(bloqueioTroca("starter", 16)).not.toBeNull();
    expect(bloqueioTrocaPremium("starter")).not.toBeNull();
    expect(bloqueioCriarVideo("starter", "gen4.5", false)).not.toBeNull();
  });

  it("creator e studio liberam Pro e troca Premium; áudio só no studio", () => {
    expect(bloqueioImagem("creator", "gpt-image", "pro")).toBeNull();
    expect(bloqueioTrocaPremium("creator")).toBeNull();
    expect(bloqueioCriarVideo("creator", "veo3.1_fast", true)).not.toBeNull();
    expect(bloqueioCriarVideo("studio", "veo3.1_fast", true)).toBeNull();
    expect(bloqueioTroca("studio", 60)).toBeNull();
  });
});
