import { describe, expect, it } from "vitest";
import { en } from "./en";
import { pt } from "./pt";
import { traduzir } from "./index";

describe("idiomas", () => {
  it("todo texto em português existe em inglês (e nenhum vazio)", () => {
    for (const k of Object.keys(pt) as Array<keyof typeof pt>)
      expect(en[k]?.trim(), k).toBeTruthy();
  });
  it("troca variáveis e cai pro português se faltar", () => {
    expect(traduzir("en", "etapa.xDeY", { x: 2, y: 7 })).toBe("Step 2 of 7");
    expect(traduzir("pt", "etapa.xDeY", { x: 2, y: 7 })).toBe("Etapa 2 de 7");
  });
});

describe("tx", () => {
  it("devolve o português em PT e traduz em EN, mantendo espaços das pontas", async () => {
    const { tx, definirIdiomaAtivo } = await import("./tx");
    definirIdiomaAtivo("pt");
    expect(tx("Cancelar")).toBe("Cancelar");
    definirIdiomaAtivo("en");
    expect(tx("Cancelar")).toBe("Cancel");
    expect(tx(" ou crie um vídeo novo")).toBe(" or create a new video");
    expect(tx("Texto sem tradução")).toBe("Texto sem tradução");
    definirIdiomaAtivo("pt");
  });
});

describe("idioma da IA", () => {
  it("lê o cookie e só instrui quando é inglês", async () => {
    const { idiomaDoPedido, instrucaoIdioma } = await import("../ai/idioma");
    const pedido = (cookie?: string) =>
      new Request("http://x", { headers: cookie ? { cookie } : {} });
    expect(idiomaDoPedido(pedido("a=1; nido-idioma=en"))).toBe("en");
    expect(idiomaDoPedido(pedido("nido-idioma=pt"))).toBe("pt");
    expect(idiomaDoPedido(pedido())).toBe("pt");
    expect(instrucaoIdioma("pt")).toBe("");
    expect(instrucaoIdioma("en")).toMatch(/English/);
  });
});
