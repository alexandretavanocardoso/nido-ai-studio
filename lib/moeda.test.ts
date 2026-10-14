import { afterEach, describe, expect, it } from "vitest";
import { definirIdiomaAtivo } from "@/lib/i18n/tx";
import {
  converter,
  definirMoedaAtiva,
  dinheiro,
  dinheiroEm,
  moedaAtual,
  naMoeda,
} from "./moeda";

// Espaço do Intl entre o símbolo e o número (não separável).
const limpar = (s: string) => s.replace(/\s/g, " ");

describe("moeda da tela", () => {
  afterEach(() => {
    definirMoedaAtiva("USD", 5.3);
    definirIdiomaAtivo("pt");
  });

  it("a moeda não depende do idioma", () => {
    definirIdiomaAtivo("en");
    definirMoedaAtiva("BRL", 5);
    expect(moedaAtual()).toBe("BRL");
    expect(limpar(dinheiro(10))).toBe("R$10.00");
    definirIdiomaAtivo("pt");
    definirMoedaAtiva("USD", 5);
    expect(limpar(dinheiro(10))).toBe("US$ 10,00");
  });

  it("preço de tabela pega o da moeda, sem câmbio", () => {
    definirMoedaAtiva("BRL", 5);
    expect(naMoeda({ BRL: 95, USD: 18 })).toBe(95);
    definirMoedaAtiva("USD", 5);
    expect(naMoeda({ BRL: 95, USD: 18 })).toBe(18);
  });

  it("valor em dólar é convertido pelo câmbio", () => {
    definirMoedaAtiva("BRL", 5);
    expect(converter(3, "USD")).toBe(15);
    expect(limpar(dinheiro(3, { de: "USD" }))).toBe("R$ 15,00");
    definirMoedaAtiva("USD", 5);
    expect(converter(15, "BRL")).toBe(3);
    expect(limpar(dinheiro(3, { de: "USD" }))).toBe("US$ 3,00");
  });

  it("moeda fixa não converte", () => {
    definirMoedaAtiva("BRL", 5);
    expect(limpar(dinheiroEm(20, "USD"))).toBe("US$ 20,00");
  });
});
