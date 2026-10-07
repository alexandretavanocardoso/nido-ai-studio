import { describe, expect, it } from "vitest";
import { readPath, writePath } from "./paths";

describe("readPath", () => {
  it("lê campos aninhados em dot-notation", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(readPath(obj, "a.b.c")).toBe(42);
  });

  it("devolve undefined se o caminho não existe", () => {
    expect(readPath({ a: 1 }, "a.b.c")).toBeUndefined();
  });
});

describe("writePath", () => {
  it("escreve em caminho aninhado criando objetos no caminho", () => {
    const obj: Record<string, unknown> = {};
    writePath(obj, "a.b.c", 42);
    expect(obj).toEqual({ a: { b: { c: 42 } } });
  });

  it("sobrescreve valor existente", () => {
    const obj: Record<string, unknown> = { a: { b: 1 } };
    writePath(obj, "a.b", 99);
    expect(obj).toEqual({ a: { b: 99 } });
  });
});
