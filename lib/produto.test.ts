import { describe, expect, it } from "vitest";
import { creditosCriarVideo, creditosImagem, creditosVideoFalado } from "./planos";
import {
  cenasDoProduto,
  creditosProduto,
  MAX_CENAS_MUDAS_PRODUTO,
  MODELOS_FALADO_PRODUTO,
  promptImagemDaCena,
  sistemaRoteiroProduto,
} from "./produto";
import { cadeiaDoJob } from "./video/cadeia";
import { promptComAcao } from "./video/falado";
import { cenasDoVideo } from "./video/precos";

describe("cenas do vídeo de produto", () => {
  it("com fala: uma cena a cada 15s, no máximo 4", () => {
    expect(cenasDoProduto("falado", "seedance20_mini", 10)).toEqual([10]);
    expect(cenasDoProduto("falado", "seedance20_mini", 15)).toEqual([15]);
    expect(cenasDoProduto("falado", "seedance20_mini", 30)).toEqual([15, 15]);
    expect(cenasDoProduto("falado", "seedance20_mini", 45)).toEqual([15, 15, 15]);
    expect(cenasDoProduto("falado", "seedance20_mini", 60)).toEqual([15, 15, 15, 15]);
  });

  it("sem fala: as cenas que o modelo gera, até 8", () => {
    expect(cenasDoProduto("mudo", "kling_v3", 60)).toEqual(cenasDoVideo("kling_v3", 60));
    const veo = cenasDoProduto("mudo", "veo3.1_fast", 60);
    expect(veo.length).toBeLessThanOrEqual(MAX_CENAS_MUDAS_PRODUTO);
    expect(veo.reduce((t, n) => t + n, 0)).toBeGreaterThanOrEqual(60);
  });

  it("o avatar em close não entra (não mostra o produto)", () => {
    expect(MODELOS_FALADO_PRODUTO).not.toContain("avatar");
    expect(MODELOS_FALADO_PRODUTO).toContain("seedance20_mini");
  });
});

describe("créditos do vídeo de produto", () => {
  it("com fala: o vídeo pela duração mais uma imagem por cena", () => {
    expect(
      creditosProduto({ modo: "falado", modelo: "wan3", duracao: 30, audio: false, pro: true }),
    ).toBe(creditosVideoFalado(30, "wan3") + 2 * creditosImagem("nano-banana", "pro"));
  });

  it("sem fala: os segundos gerados mais uma imagem por cena", () => {
    const cenas = cenasDoVideo("kling_v3", 30);
    expect(
      creditosProduto({ modo: "mudo", modelo: "kling_v3", duracao: 30, audio: true, pro: false }),
    ).toBe(
      creditosCriarVideo("kling_v3", cenas.reduce((t, n) => t + n, 0), true) +
        cenas.length * creditosImagem("nano-banana", "padrao"),
    );
  });
});

describe("pedidos", () => {
  it("a cena falada leva a ação e as referências do serviço", () => {
    const p = promptComAcao({ imagem: "@Image1", audio: "@Audio1" }, "She holds the bottle up.");
    expect(p).toContain("She holds the bottle up.");
    expect(p).toContain("@Image1");
    expect(p).toContain("words of @Audio1");
  });

  it("a imagem da cena pede o produto exato e o formato do vídeo", () => {
    const p = promptImagemDaCena({ cena: "in a kitchen", produto: "Tênis Aurora", vertical: false, falado: true });
    expect(p).toContain("EXACTLY the product");
    expect(p).toContain("16:9");
    expect(p).toContain("Tênis Aurora");
  });

  it("o roteiro pede o número certo de cenas e o limite de cada fala", () => {
    const s = sistemaRoteiroProduto({ modo: "falado", segundos: [15, 15], temFalas: false });
    expect(s).toContain("exactly 2 scenes");
    expect(s).toContain('"fala"');
    expect(sistemaRoteiroProduto({ modo: "mudo", segundos: [10], temFalas: false })).not.toContain(
      '"fala" rules',
    );
  });
});

describe("cadeia com uma imagem por cena", () => {
  it("guarda as imagens e os pedidos de cada cena", () => {
    const c = cadeiaDoJob({
      cadeia: { alvo: 30, cenas: [15, 15], partes: [], imagens: ["a", "b"], prompts: ["p1", "p2"] },
    });
    expect(c?.imagens).toEqual(["a", "b"]);
    expect(c?.prompts).toEqual(["p1", "p2"]);
  });

  it("a cadeia de antes continua sem eles", () => {
    const c = cadeiaDoJob({ cadeia: { alvo: 30, cenas: [15, 15], partes: [] } });
    expect(c).toEqual({ alvo: 30, cenas: [15, 15], partes: [] });
  });
});
