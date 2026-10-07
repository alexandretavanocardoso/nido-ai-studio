import { describe, expect, it } from "vitest";
import { base58, recebido, valorUSD } from "./usdc";
import { lerCompra } from "./aplicar";
import { PACOTES, pacoteMaisBarato, precoAvulso } from "@/lib/planos";

describe("base58", () => {
  it("codifica como os endereços Solana (zeros à esquerda viram '1')", () => {
    expect(base58(new Uint8Array([0, 0, 1]))).toBe("112");
    expect(base58(new Uint8Array(32)).length).toBe(32); // 32 zeros → 32 '1'
    expect(base58(Uint8Array.from(Buffer.from("hello")))).toBe("Cn8eVZg");
  });
});

describe("recebido", () => {
  const NIDO = "NidoWallet111";
  const USDC = "MintUSDC";
  const saldo = (owner: string, mint: string, amount: string) => ({
    owner,
    mint,
    uiTokenAmount: { amount },
  });

  it("soma só o que a carteira da NIDO recebeu em USDC", () => {
    const meta = {
      preTokenBalances: [
        saldo(NIDO, USDC, "1000000"),
        saldo("cliente", USDC, "50000000"),
      ],
      postTokenBalances: [
        saldo(NIDO, USDC, "16000000"),
        saldo("cliente", USDC, "35000000"),
      ],
    };
    expect(recebido(meta, NIDO, USDC)).toBe(BigInt(15_000_000)); // 15 USDC
  });

  it("ignora outro token e conta criada na própria transação (sem pre)", () => {
    expect(
      recebido(
        { postTokenBalances: [saldo(NIDO, "OUTRO", "9999999")] },
        NIDO,
        USDC,
      ),
    ).toBe(BigInt(0));
    expect(
      recebido(
        { postTokenBalances: [saldo(NIDO, USDC, "40000000")] },
        NIDO,
        USDC,
      ),
    ).toBe(BigInt(40_000_000));
  });
});

describe("compras", () => {
  it("lê plano e pacote válidos; recusa o resto", () => {
    expect(
      lerCompra({ tipo: "plano", plano: "creator", intervalo: "anual" }),
    ).toEqual({
      tipo: "plano",
      plano: "creator",
      intervalo: "anual",
    });
    expect(lerCompra({ tipo: "pacote", pacote: "p1500" })).toEqual({
      tipo: "pacote",
      pacote: "p1500",
    });
    expect(
      lerCompra({ tipo: "plano", plano: "gratis", intervalo: "mensal" }),
    ).toBeNull();
    expect(lerCompra({ tipo: "pacote", pacote: "p999" })).toBeNull();
  });

  it("compra manual: mínimo 100, inteiro, até 100 mil (metadata do Stripe vem como texto)", () => {
    expect(lerCompra({ tipo: "avulso", creditos: "250" })).toEqual({
      tipo: "avulso",
      creditos: 250,
    });
    expect(lerCompra({ tipo: "avulso", creditos: 100 })).toEqual({
      tipo: "avulso",
      creditos: 100,
    });
    expect(lerCompra({ tipo: "avulso", creditos: 99 })).toBeNull();
    expect(lerCompra({ tipo: "avulso", creditos: 150.5 })).toBeNull();
    expect(lerCompra({ tipo: "avulso", creditos: 100_001 })).toBeNull();
    expect(lerCompra({ tipo: "avulso", creditos: null })).toBeNull();
  });

  it("preço da compra manual = preço por crédito do menor pacote", () => {
    expect(valorUSD({ tipo: "avulso", creditos: 100 })).toBe(3);
    expect(valorUSD({ tipo: "avulso", creditos: 333 })).toBe(9.99);
    expect(precoAvulso(100, "BRL")).toBe(16);
    expect(precoAvulso(1234, "BRL")).toBe(197.44);
    // Pacote nunca sai mais caro que a mesma quantidade avulsa.
    for (const p of Object.values(PACOTES))
      expect(p.precoBRL).toBeLessThanOrEqual(precoAvulso(p.creditos, "BRL"));
    expect(pacoteMaisBarato(200)).toBeNull();
    expect(pacoteMaisBarato(495)).toBe("p500");
  });

  it("preço em USDC = tabela em dólar (anual com 20% off)", () => {
    expect(valorUSD({ tipo: "pacote", pacote: "p500" })).toBe(15);
    expect(
      valorUSD({ tipo: "plano", plano: "studio", intervalo: "mensal" }),
    ).toBe(99);
    expect(
      valorUSD({ tipo: "plano", plano: "studio", intervalo: "anual" }),
    ).toBe(950);
  });
});
