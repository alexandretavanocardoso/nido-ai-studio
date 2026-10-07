import { describe, expect, it } from "vitest";
import { expandirRespostaSchema } from "./schema";
import { sugestoesDaSecao } from "./secao";
import { camposDaEtapaParaIA } from "@/lib/campos-ficha";

describe("preencher etapa com IA", () => {
  it("aceita campos opcionais da ficha (medos, origem, reações) e descarta o nome", () => {
    const data = expandirRespostaSchema.parse({
      soul: {
        medos: { valor: "ser esquecido", origem: "suposicao" },
        origem: { valor: "cresceu em Porto Alegre", origem: "contexto" },
        reacoes: { hater: { valor: "ignora", origem: "suposicao" } },
        inventado: { valor: "x", origem: "suposicao" },
      },
      identidade: { nome: { valor: "Outro Nome", origem: "suposicao" } },
    });
    const ids = sugestoesDaSecao(data, "soul", camposDaEtapaParaIA("soul")).map(
      (s) => s.fieldId,
    );
    expect(ids.sort()).toEqual([
      "soul.medos",
      "soul.origem",
      "soul.reacoes.hater",
    ]);
    expect(
      sugestoesDaSecao(data, "identidade", camposDaEtapaParaIA("identidade")),
    ).toEqual([]);
  });

  it("embrulha campos soltos na etapa pedida", () => {
    const data = expandirRespostaSchema.parse({
      tomHumor: { valor: 75, origem: "suposicao" },
      girias: { valor: ["bah"], origem: "suposicao" },
    });
    const ids = sugestoesDaSecao(data, "voz", camposDaEtapaParaIA("voz")).map(
      (s) => s.fieldId,
    );
    expect(ids.sort()).toEqual(["voz.girias", "voz.tomHumor"]);
  });

  it("tolera lista onde é texto, ideia sem formato e origem fora do combinado", () => {
    const data = expandirRespostaSchema.parse({
      soul: {
        manias: {
          valor: ["morder caneta", "estalar dedos"],
          origem: "inferido",
        },
      },
      nicho: {
        ideiasConteudo: { valor: [{ titulo: "3 erros" }], origem: "suposicao" },
      },
    }) as {
      soul: { manias: { valor: string; origem: string } };
      nicho: { ideiasConteudo: { valor: Array<{ formato: string }> } };
    };
    expect(data.soul.manias).toEqual({
      valor: "morder caneta; estalar dedos",
      origem: "suposicao",
    });
    expect(data.nicho.ideiasConteudo.valor[0].formato).toBe("Post");
  });
});
