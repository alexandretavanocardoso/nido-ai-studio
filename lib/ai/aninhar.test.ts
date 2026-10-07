import { describe, expect, it } from "vitest";
import { toSuggestions } from "./flatten";

describe("sugestões da IA com chaves achatadas", () => {
  it('"soul.arquetipo" vira o campo soul.arquetipo (e sub-objetos também)', () => {
    const r = toSuggestions({
      "soul.arquetipo": { valor: "Gigante gentil", origem: "suposicao" },
      "soul.gostos.comidas": { valor: ["frango"], origem: "suposicao" },
      voz: { girias: { valor: ["bora"], origem: "suposicao" } },
    } as never);
    expect(r.map((s) => s.fieldId).sort()).toEqual([
      "soul.arquetipo",
      "soul.gostos.comidas",
      "voz.girias",
    ]);
  });
});
