import { describe, expect, it } from "vitest";
import { promptTroca } from "./troca";
import { posicaoEmPalavras } from "./pessoas";

describe("escolher quem trocar", () => {
  it("sem marcas: troca a pessoa principal", () => {
    expect(promptTroca("kling", [{}], false)).toMatch(/main person in @Video1 with the character @Element1/);
  });
  it("com marcas: cada pessoa descrita vai pro seu personagem e o resto fica igual", () => {
    const p = promptTroca("kling", [{ descricao: "the man in green" }, { descricao: "the man in black" }], false);
    expect(p).toContain("the man in green → replace with the character @Element1");
    expect(p).toContain("the man in black → replace with the character @Element2");
    expect(p).toMatch(/Every other person/);
    expect(promptTroca("seedance", [{ descricao: "a" }], true)).toMatch(/@Image1[\s\S]*Remove all on-screen text/);
  });
  it("posição em palavras (reserva quando a IA não descreve)", () => {
    expect(posicaoEmPalavras({ x: 0.1, y: 0.5 })).toBe("the person on the left side of the frame (middle)");
    expect(posicaoEmPalavras({ x: 0.9, y: 0.9 })).toContain("right side");
  });
});
