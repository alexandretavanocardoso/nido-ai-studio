import { describe, expect, it } from "vitest";
import { creditosImagem } from "./planos";
import { creditosProdutoCriado, OPCOES_PRODUTO, opcaoProduto, promptProdutoCriado } from "./produto-criado";

describe("criar produto", () => {
  it("opções: os modelos de imagem sem a persona, com a versão Pro onde existe", () => {
    const ids = OPCOES_PRODUTO.map((o) => o.id);
    expect(ids).not.toContain("persona");
    expect(ids).toEqual(expect.arrayContaining(["nano-banana", "nano-banana:pro", "seedream", "flux2", "gpt-image", "gpt-image:pro"]));
    expect(opcaoProduto("nano-banana:pro")).toMatchObject({ modelo: "nano-banana", qualidade: "pro", label: "Nano Banana Pro" });
    expect(opcaoProduto("persona")).toBeUndefined();
  });

  it("cobra como uma imagem do modelo", () => {
    for (const o of OPCOES_PRODUTO) expect(creditosProdutoCriado(o)).toBe(creditosImagem(o.modelo, o.qualidade));
  });

  it("prompt com foto básica: mantém o produto, foto primeiro e logo por último", () => {
    const p = promptProdutoCriado({ nome: "Garrafa Aurora", descricao: "garrafa térmica de 500 ml", temFoto: true });
    expect(p).toContain('"Garrafa Aurora"');
    expect(p).toContain("garrafa térmica de 500 ml");
    expect(p).toContain("FIRST attached image is a basic photo");
    expect(p).toContain("the LAST image is the company logo");
    expect(p).toContain("3D product render");
    expect(p).not.toContain("PRODUCT DESIGN");
  });

  it("só adicionar a logo: o produto mantém as cores dele", () => {
    const comFoto = promptProdutoCriado({ nome: "Caneca", descricao: "", temFoto: true, cores: "produto" });
    expect(comFoto).toContain("KEEP THE PRODUCT'S OWN COLOURS");
    expect(comFoto).toContain("exactly as in the basic photo");
    expect(comFoto).toContain("Do not redesign or recolour it");
    expect(comFoto).not.toContain("BRAND COLOURS");
    const semFoto = promptProdutoCriado({ nome: "Caneca", descricao: "", prompt: "caneca de cerâmica", temFoto: false, cores: "produto" });
    expect(semFoto).toContain("a white ceramic mug stays white");
    // O padrão continua sendo pintar nas cores da logo.
    expect(promptProdutoCriado({ nome: "Caneca", descricao: "", temFoto: true })).toContain("BRAND COLOURS");
  });

  it("prompt sem foto: o produto sai da descrição de como ele é", () => {
    const p = promptProdutoCriado({ nome: "Tênis Nido", descricao: "", prompt: "tênis de corrida leve, cano baixo", temFoto: false });
    expect(p).toContain("PRODUCT DESIGN — tênis de corrida leve, cano baixo");
    expect(p).toContain("the attached image is the company logo");
    expect(p).not.toContain("BASE PRODUCT");
    expect(p).not.toContain("What it is");
  });
});
