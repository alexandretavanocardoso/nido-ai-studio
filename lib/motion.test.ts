import { describe, expect, it } from "vitest";
import {
  custoMotion,
  estimativaMotion,
  MODELOS_MOTION,
  precoMotion,
} from "../worker/motion/modelos";
import { pedidoCorrecao, pedidoMotion, sistemaMotion } from "../worker/motion/prompt";
import { extrairHtml, montarHtml, resolverAssets, runtimeJs } from "../worker/motion/runtime";
import type { InputMotion } from "../worker/motion/tipos";

const doc = "<!doctype html><html><head><title>x</title></head><body><img src=\"asset://a1\"></body></html>";

describe("HTML do motion", () => {
  it("tira o documento de dentro da resposta do modelo", () => {
    expect(extrairHtml("Aqui está:\n```html\n" + doc + "\n```\nPronto.")).toBe(doc);
    expect(extrairHtml("<html lang=\"pt\"><body></body></html>")).toBe("<html lang=\"pt\"><body></body></html>");
    expect(extrairHtml("<!doctype html><html><body>cortado no meio")).toBeNull();
    expect(extrairHtml("sem html")).toBeNull();
  });

  it("troca asset:// pelos endereços e deixa os desconhecidos", () => {
    expect(resolverAssets('<img src="asset://a1"> url(asset://s2) asset://zz', { a1: "https://x/1.jpg", s2: "data:a" })).toBe(
      '<img src="https://x/1.jpg"> url(data:a) asset://zz',
    );
  });

  it("põe o palco, o GSAP e o relógio no começo do <head>", () => {
    const html = montarHtml(doc, {
      largura: 1080,
      altura: 1920,
      duracao: 15,
      fps: 30,
      modo: "preview",
      enderecos: { a1: "https://x/1.jpg" },
    });
    const cabeca = html.indexOf("<head>");
    expect(html.indexOf("gsap.min.js")).toBeGreaterThan(cabeca);
    expect(html.indexOf("gsap.min.js")).toBeLessThan(html.indexOf("<title>"));
    expect(html).toContain("width:1080px;height:1920px");
    expect(html).toContain('src="https://x/1.jpg"');
    expect(html).toContain("window.motion");
  });

  it("monta mesmo sem <head> ou sem <html>", () => {
    const sem = montarHtml("<html><body>oi</body></html>", { largura: 10, altura: 10, duracao: 1, fps: 30, modo: "render", enderecos: {} });
    expect(sem).toMatch(/<html>\s*<head>[\s\S]*<\/head><body>oi/);
    const solto = montarHtml("<div>oi</div>", { largura: 10, altura: 10, duracao: 1, fps: 30, modo: "render", enderecos: {} });
    expect(solto.startsWith("<!doctype html>")).toBe(true);
  });

  it("o relógio é JavaScript válido em todos os modos", () => {
    for (const modo of ["preview", "render", "arquivo"] as const)
      expect(() => new Function(runtimeJs({ largura: 1080, altura: 1080, duracao: 10, fps: 30, modo }))).not.toThrow();
  });
});

describe("preço do motion", () => {
  it("cobra entrada e saída pelo preço do modelo", () => {
    expect(custoMotion("claude-opus-5-5", 1_000_000, 1_000_000)).toBe(24);
    expect(custoMotion("claude-haiku-5-5", 10_000, 20_000)).toBe(0.011);
    expect(custoMotion("gpt-6.1-sol", 1_000_000, 1_000_000)).toBe(12);
    expect(custoMotion("modelo-desconhecido", 1000, 1000)).toBe(0);
  });

  it("o Argon sai do preço de lançamento em dezembro", () => {
    expect(precoMotion("gemini-4-argon", Date.UTC(2026, 10, 30, 23))).toEqual({ entrada: 2, saida: 10 });
    expect(precoMotion("gemini-4-argon", Date.UTC(2026, 11, 1))).toEqual({ entrada: 4, saida: 20 });
  });

  it("mais esforço custa mais, e o Fable é o mais caro", () => {
    expect(estimativaMotion("claude-opus-5-5", "max", 2)).toBeGreaterThan(estimativaMotion("claude-opus-5-5", "low", 2));
    const caros = Object.keys(MODELOS_MOTION).map((m) => estimativaMotion(m as keyof typeof MODELOS_MOTION, "high", 2));
    expect(Math.max(...caros)).toBe(estimativaMotion("claude-fable-5-1", "high", 2));
  });
});

describe("pedido ao modelo", () => {
  const input: InputMotion = {
    brief: "Lançamento do tênis Aurora",
    formato: "9:16",
    duracao: 15,
    assets: [
      { id: "a1", key: "k1", papel: "produto", largura: 1024, altura: 1024 },
      { id: "a2", key: "k2", papel: "produto-recorte", transparente: true },
    ],
    produto: { nome: "Tênis Aurora" },
    site: { url: "https://aurora.com", leitura: { url: "https://aurora.com", titulo: "Aurora", descricao: "", textos: ["Leve"], botoes: ["Comprar"], cores: ["#ff6600"] } },
  };
  const imagens = input.assets.map((asset) => ({ asset, mime: "image/jpeg" as const, base64: "AAAA" }));

  it("o sistema fixa o palco, a duração e o contrato do relógio", () => {
    const s = sistemaMotion({ largura: 1080, altura: 1920, duracao: 15 });
    expect(s).toContain("1080×1920");
    expect(s).toContain("15 seconds");
    expect(s).toContain("motion.build");
    expect(s).toContain("bottom 18%");
  });

  it("cada imagem vem depois do seu asset://, com o site lido", () => {
    const partes = pedidoMotion(input, "produto", imagens);
    expect(partes[0]).toMatchObject({ tipo: "texto" });
    const texto = (partes[0] as { texto: string }).texto;
    expect(texto).toContain("Tênis Aurora");
    expect(texto).toContain("Comprar");
    expect(texto).toContain("#ff6600");
    expect(partes.slice(1).map((p) => p.tipo)).toEqual(["texto", "imagem", "texto", "imagem"]);
    expect((partes[3] as { texto: string }).texto).toContain("asset://a2 — product cut-out");
  });

  it("no ajuste, vai o HTML atual e o pedido de mudança", () => {
    const partes = pedidoMotion(
      { ...input, ajuste: { pedido: "fundo mais escuro", baseId: "b", baseHtmlKey: "k" } },
      "produto",
      imagens,
      doc,
    );
    const texto = (partes[0] as { texto: string }).texto;
    expect(texto).toContain(doc);
    expect(texto).toContain("fundo mais escuro");
  });

  it("a correção manda o erro e o HTML", () => {
    const [p] = pedidoCorrecao(doc, "ReferenceError: x is not defined");
    expect((p as { texto: string }).texto).toContain("ReferenceError");
  });
});
