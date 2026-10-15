import { describe, expect, it, vi } from "vitest";

const pedido = vi.hoisted(() => ({ resposta: "", falha: false, ultimo: null as null | Record<string, unknown> }));
vi.mock("@/lib/ai/anthropic", () => ({
  askClaude: async (o: Record<string, unknown>) => {
    pedido.ultimo = o;
    if (pedido.falha) throw new Error("sem créditos");
    return pedido.resposta;
  },
}));

import { melhorarCena, pedidoCenaTexto } from "./cena";

describe("cenário da live", () => {
  it("a IA reescreve o pedido (em inglês), sem raciocínio, com o modelo da live", async () => {
    pedido.resposta = "  A cozy bedroom at night. Add over-ear headphones worn on the head.  ";
    expect(await melhorarCena("Quarto ao fundo e com fone de ouvido")).toBe(
      "A cozy bedroom at night. Add over-ear headphones worn on the head.",
    );
    expect(pedido.ultimo).toMatchObject({
      user: "Quarto ao fundo e com fone de ouvido",
      thinking: { type: "disabled" },
      effort: "low",
    });
    expect(String(pedido.ultimo?.system)).toMatch(/English/);
  });

  it("se a IA falhar ou voltar vazia, segue com o texto como veio", async () => {
    pedido.falha = true;
    expect(await melhorarCena("na praia")).toBe("na praia");
    pedido.falha = false;
    pedido.resposta = "   ";
    expect(await melhorarCena("na praia")).toBe("na praia");
  });

  it("o pedido da imagem mantém a pessoa e só aceita mudança nela quando pedida", () => {
    const p = pedidoCenaTexto("A beach at sunset.");
    expect(p).toContain("Instructions: A beach at sunset.");
    expect(p).toMatch(/same face/);
    expect(p).toMatch(/unless the instructions explicitly add or change something on the person/);
    expect(p).toMatch(/head and shoulders/);
  });
});
