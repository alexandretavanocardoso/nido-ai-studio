import { describe, expect, it } from "vitest";
import { extractPontosEmAberto, toSuggestions } from "./flatten";
import { expandirRespostaSchema } from "./schema";

describe("toSuggestions", () => {
  it("achata campos simples em identidade", () => {
    const data = expandirRespostaSchema.parse({
      identidade: {
        nome: { valor: "Lila", origem: "contexto" },
        bio: { valor: "Arquiteta ácida", origem: "suposicao" },
      },
    });
    const out = toSuggestions(data);
    expect(out).toContainEqual({
      fieldId: "identidade.nome",
      valor: "Lila",
      origem: "contexto",
    });
    expect(out).toContainEqual({
      fieldId: "identidade.bio",
      valor: "Arquiteta ácida",
      origem: "suposicao",
    });
  });

  it("achata soul.gostos aninhado em soul.gostos.<campo>", () => {
    const data = expandirRespostaSchema.parse({
      soul: {
        gostos: {
          comidas: { valor: ["pastel de feira"], origem: "suposicao" },
        },
      },
    });
    const out = toSuggestions(data);
    expect(out).toContainEqual({
      fieldId: "soul.gostos.comidas",
      valor: ["pastel de feira"],
      origem: "suposicao",
    });
  });

  it("usa 'suposicao' quando origem ausente", () => {
    const data = expandirRespostaSchema.parse({
      visual: { cabelo: { valor: "cacheado" } },
    });
    const out = toSuggestions(data);
    expect(out[0]?.origem).toBe("suposicao");
  });

  it("extrai pontosEmAberto como array simples", () => {
    const data = expandirRespostaSchema.parse({
      pontosEmAberto: [
        { decisao: "é vegetariano?", porQueImporta: "muda o repertório" },
      ],
    });
    expect(extractPontosEmAberto(data)).toHaveLength(1);
    expect(extractPontosEmAberto(data)[0].decisao).toBe("é vegetariano?");
  });
});
