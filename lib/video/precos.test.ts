import { describe, expect, it } from "vitest";
import { custoCriar, custoTroca, custoTrocaPremium } from "./precos";

describe("estimativas de custo de vídeo", () => {
  it("troca (Kling O3 Pro) cobra US$ 0,168/s, mínimo 3s", () => {
    expect(custoTroca(10)).toBe(1.68);
    expect(custoTroca(1)).toBe(0.5);
  });

  it("troca (Kling O3): Standard US$ 0,126/s e 4K US$ 0,42/s", () => {
    expect(custoTroca(10, "standard")).toBe(1.26);
    expect(custoTroca(10, "4k")).toBe(4.2);
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

describe("criar vídeo em cenas", () => {
  it("Gen-4 (5 ou 10s por cena): 10, 15 e 30s exatos", async () => {
    const { cenasDoVideo } = await import("./precos");
    expect(cenasDoVideo("gen4_turbo", 10)).toEqual([10]);
    expect(cenasDoVideo("gen4_turbo", 15)).toEqual([10, 5]);
    expect(cenasDoVideo("gen4.5", 30)).toEqual([10, 10, 10]);
  });

  it("Veo (4, 6 ou 8s por cena): soma o mínimo que cobre o pedido", async () => {
    const { cenasDoVideo, segundosGerados } = await import("./precos");
    expect(cenasDoVideo("veo3.1_fast", 10)).toEqual([6, 4]);
    expect(cenasDoVideo("veo3.1_fast", 15)).toEqual([8, 8]);
    expect(cenasDoVideo("veo3.1_fast", 30)).toEqual([8, 8, 8, 6]);
    expect(segundosGerados("veo3.1_fast", 15)).toBe(16);
    expect(segundosGerados("gen4.5", 15)).toBe(15);
  });
});

describe("recorte do avatar (vídeo falado)", () => {
  it("corpo inteiro: quadrado de cabeça e ombros em volta do rosto", async () => {
    const { quadroDoRosto } = await import("./falado");
    // Imagem 1024x1536 com o rosto no alto (como um retrato de corpo inteiro).
    const q = quadroDoRosto(1024, 1536, { x0: 0.41, y0: 0.07, x1: 0.59, y1: 0.2 });
    expect(q.lado).toBeGreaterThan(450);
    expect(q.lado).toBeLessThan(700);
    expect(q.top).toBe(0);
    expect(q.left + q.lado / 2).toBeGreaterThan(480);
    expect(q.left + q.lado / 2).toBeLessThan(545);
  });

  it("sem rosto localizado: alto da imagem, centralizado, dentro dos limites", async () => {
    const { quadroDoRosto } = await import("./falado");
    expect(quadroDoRosto(1024, 1536, null)).toEqual({ left: 231, top: 0, lado: 563 });
    const paisagem = quadroDoRosto(1600, 900, null);
    expect(paisagem.lado).toBe(900);
    expect(paisagem.left + paisagem.lado).toBeLessThanOrEqual(1600);
  });

  it("close: nunca passa do tamanho da imagem", async () => {
    const { quadroDoRosto } = await import("./falado");
    const q = quadroDoRosto(800, 800, { x0: 0.2, y0: 0.15, x1: 0.8, y1: 0.9 });
    expect(q).toEqual({ left: 0, top: 0, lado: 800 });
  });
});

describe("cenas do vídeo falado", () => {
  it("cada parágrafo é uma cena; o que passa de 4 entra na última", async () => {
    const { cenasDaFala } = await import("./precos");
    expect(cenasDaFala("Oi, gente!")).toEqual(["Oi, gente!"]);
    expect(cenasDaFala("Um.\n\nDois.\n \nTrês.")).toEqual(["Um.", "Dois.", "Três."]);
    expect(cenasDaFala("a\n\nb\n\nc\n\nd\n\ne")).toEqual(["a", "b", "c", "d e"]);
    expect(cenasDaFala("linha um\nlinha dois")).toEqual(["linha um\nlinha dois"]);
  });
});

describe("leitura das cenas do roteiro (resposta da IA)", () => {
  it("aceita o formato pedido, com cerca de código em volta", async () => {
    const { cenasDaResposta } = await import("./cenas-roteiro");
    expect(
      cenasDaResposta('```json\n{"cenas": [{"fala": "Oi, gente!", "cenario": "a bedroom"}, {"fala": "Bora!", "cenario": "a gym"}]}\n```'),
    ).toEqual([
      { fala: "Oi, gente!", cenario: "a bedroom" },
      { fala: "Bora!", cenario: "a gym" },
    ]);
  });

  it("aceita lista solta, chaves com acento ou em inglês e cena como texto", async () => {
    const { cenasDaResposta } = await import("./cenas-roteiro");
    expect(cenasDaResposta('[{"Fala": "Um.", "cenário": "street"}]')).toEqual([
      { fala: "Um.", cenario: "street" },
    ]);
    expect(cenasDaResposta('{"scenes": [{"speech": "One.", "setting": "park"}]}')).toEqual([
      { fala: "One.", cenario: "park" },
    ]);
    expect(cenasDaResposta('{"fala": "Só uma.", "cenario": "room"}')).toEqual([
      { fala: "Só uma.", cenario: "room" },
    ]);
    expect(cenasDaResposta('{"cenas": ["Fala um.", "Fala dois."]}')).toEqual([
      { fala: "Fala um.", cenario: "" },
      { fala: "Fala dois.", cenario: "" },
    ]);
  });

  it("JSON cortado: pesca o que dá; texto corrido vira uma cena", async () => {
    const { cenasDaResposta } = await import("./cenas-roteiro");
    expect(
      cenasDaResposta('{"cenas": [{"fala": "Primeira \\"fala\\".", "cenario": "dojo"}, {"fala": "Segunda", "cen'),
    ).toEqual([
      { fala: 'Primeira "fala".', cenario: "dojo" },
      { fala: "Segunda", cenario: "" },
    ]);
    expect(cenasDaResposta("Gente, bora treinar junto!")).toEqual([
      { fala: "Gente, bora treinar junto!", cenario: "" },
    ]);
  });
});
