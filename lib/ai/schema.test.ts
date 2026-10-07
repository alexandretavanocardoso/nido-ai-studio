import { describe, expect, it } from "vitest";
import { expandirRespostaSchema, extractJson } from "./schema";

describe("extractJson", () => {
  it("tira o JSON de dentro de bloco ```json", () => {
    const raw = 'aqui vai:\n```json\n{"a":1}\n```\nfim';
    expect(extractJson(raw)).toBe('{"a":1}');
  });

  it("tira o JSON de bloco sem linguagem", () => {
    const raw = '```\n{"a":2}\n```';
    expect(extractJson(raw)).toBe('{"a":2}');
  });

  it("corta pelo primeiro { e último }", () => {
    const raw = 'qualquer coisa { "a": 3 } mais texto';
    expect(extractJson(raw)).toBe('{ "a": 3 }');
  });
});

describe("expandirRespostaSchema", () => {
  it("aceita payload mínimo (tudo opcional)", () => {
    const parsed = expandirRespostaSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("aceita um campo em envelope com origem", () => {
    const parsed = expandirRespostaSchema.safeParse({
      identidade: {
        bio: { valor: "uma bio curta", origem: "contexto" },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("default origem='suposicao' quando ausente", () => {
    const parsed = expandirRespostaSchema.parse({
      identidade: { nome: { valor: "Lila" } },
    });
    expect(parsed.identidade?.nome?.origem).toBe("suposicao");
  });

  it("aceita pilares como array dentro de envelope", () => {
    const parsed = expandirRespostaSchema.safeParse({
      nicho: {
        pilares: {
          valor: [
            { nome: "Rotina", pct: 40 },
            { nome: "Erros", pct: 30 },
          ],
          origem: "suposicao",
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("aceita pontosEmAberto como array simples", () => {
    const parsed = expandirRespostaSchema.safeParse({
      pontosEmAberto: [{ decisao: "x", porQueImporta: "y" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita gênero inválido", () => {
    const parsed = expandirRespostaSchema.safeParse({
      identidade: { genero: { valor: "indefinido" } },
    });
    expect(parsed.success).toBe(false);
  });
});
