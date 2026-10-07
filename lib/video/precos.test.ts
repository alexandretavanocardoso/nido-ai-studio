import { describe, expect, it } from "vitest";
import { custoCriar, custoTroca, custoTrocaPremium } from "./precos";

describe("estimativas de custo de vídeo", () => {
  it("troca (Kling O1 Pro) cobra US$ 0,168/s, mínimo 3s", () => {
    expect(custoTroca(10)).toBe(1.68);
    expect(custoTroca(1)).toBe(0.5);
  });

  it("Premium (Seedance 2.5) cobra US$ 0,568/s (entrada + saída), mínimo 4s gerados", () => {
    expect(custoTrocaPremium(30)).toBe(17.04);
    expect(custoTrocaPremium(3)).toBe(2.27);
  });

  it("criar vídeo: Veo com áudio custa mais; Gen-4 ignora áudio", () => {
    expect(custoCriar("veo3.1_fast", 8, false)).toBe(0.8);
    expect(custoCriar("veo3.1_fast", 8, true)).toBe(1.2);
    expect(custoCriar("gen4.5", 10, true)).toBe(1.2);
    expect(custoCriar("gen4_turbo", 10, false)).toBe(0.5);
  });
});
