import { describe, expect, it } from "vitest";
import {
  comissaoEmCentavos,
  formatoDeCarteira,
  linkDeIndicacao,
  moedaDaComissao,
  normalizarCodigo,
  problemaDoCodigo,
} from "./regras";

describe("código de indicação", () => {
  it("normaliza para minúsculas e sem espaços nas pontas", () => {
    expect(normalizarCodigo("  SeuBigode ")).toBe("seubigode");
  });

  it("aceita letras, números, hífen e sublinhado", () => {
    expect(problemaDoCodigo("seu-bigode_01")).toBeNull();
    expect(problemaDoCodigo("ABC")).toBeNull();
  });

  it("recusa curto, longo, com acento, espaço ou começando por símbolo", () => {
    expect(problemaDoCodigo("ab")).not.toBeNull();
    expect(problemaDoCodigo("a".repeat(25))).not.toBeNull();
    expect(problemaDoCodigo("joão")).not.toBeNull();
    expect(problemaDoCodigo("seu bigode")).not.toBeNull();
    expect(problemaDoCodigo("-bigode")).not.toBeNull();
    expect(problemaDoCodigo("a/b?c")).not.toBeNull();
  });

  it("recusa palavras reservadas", () => {
    expect(problemaDoCodigo("Admin")).not.toBeNull();
    expect(problemaDoCodigo("nido")).not.toBeNull();
  });
});

describe("comissão", () => {
  it("é 10% do valor pago, arredondada para baixo no centavo", () => {
    expect(comissaoEmCentavos(199)).toBe(1990);
    expect(comissaoEmCentavos(95)).toBe(950);
    expect(comissaoEmCentavos(18.99)).toBe(189);
  });

  it("é zero para valor inválido ou não positivo", () => {
    expect(comissaoEmCentavos(0)).toBe(0);
    expect(comissaoEmCentavos(-10)).toBe(0);
    expect(comissaoEmCentavos(Number.NaN)).toBe(0);
  });

  it("sai na moeda do pagamento: USDC quando o plano foi pago em USDC", () => {
    expect(moedaDaComissao("BRL", "stripe")).toBe("BRL");
    expect(moedaDaComissao("usd", "stripe")).toBe("USD");
    expect(moedaDaComissao("USD", "usdc")).toBe("USDC");
  });
});

describe("carteira de saque", () => {
  it("EVM: 0x + 40 hexadecimais", () => {
    expect(
      formatoDeCarteira("base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    ).toBe(true);
    expect(formatoDeCarteira("base", "0x1234")).toBe(false);
    expect(
      formatoDeCarteira("base", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    ).toBe(false);
  });

  it("Solana: base58 de 32 a 44 caracteres", () => {
    expect(
      formatoDeCarteira("solana", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    ).toBe(true);
    expect(
      formatoDeCarteira("solana", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    ).toBe(false);
    expect(formatoDeCarteira("solana", "curto")).toBe(false);
  });
});

describe("link", () => {
  it("monta o link com o código na raiz do site", () => {
    expect(linkDeIndicacao("https://aistudio.nido.global/", "bigode")).toBe(
      "https://aistudio.nido.global/?ref=bigode",
    );
  });
});
