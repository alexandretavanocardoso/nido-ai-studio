import { describe, expect, it } from "vitest";
import { SECOES } from "@/data/perguntas";
import { extractJson } from "@/lib/extract-json";
import { buildPromptClaude, parseRespostaClaude } from "./gerar-no-claude";

describe("buildPromptClaude", () => {
  it("inclui a ideia do usuário", () => {
    expect(buildPromptClaude("Influenciadora de finanças debochada")).toContain(
      "Influenciadora de finanças debochada"
    );
  });

  it("sem ideia, manda o Claude fazer perguntas", () => {
    expect(buildPromptClaude("   ")).toContain("Faça as perguntas que precisar");
  });

  it("lista todas as perguntas do catálogo", () => {
    const p = buildPromptClaude("x");
    for (const s of SECOES) for (const q of s.perguntas) expect(p).toContain(`- ${q.id}:`);
  });

  it("não deixa placeholders sem substituir", () => {
    expect(buildPromptClaude("x")).not.toMatch(/\{\{(ideia|perguntas|esqueleto)\}\}/);
  });

  it("não reinterpreta placeholders digitados na ideia", () => {
    const p = buildPromptClaude("teste {{perguntas}} fim");
    expect(p).toContain("teste {{perguntas}} fim");
  });

  it("o esqueleto do prompt é um JSON válido com todas as seções", () => {
    const esqueleto = extractJson(buildPromptClaude("x"));
    const obj = JSON.parse(esqueleto);
    for (const s of SECOES) expect(obj[s.id]).toBeDefined();
    expect(obj.pontosEmAberto).toBeDefined();
  });
});

describe("parseRespostaClaude", () => {
  const exemplo = {
    identidade: { nome: "Lila", genero: "Feminino", forma: "humano", bio: "Arquiteta ácida" },
    visual: { cabelo: "cacheado" },
    soul: {
      adjetivos: ["debochada", "generosa"],
      gostos: { comidas: ["pastel de feira"] },
      reacoes: { hater: "ignora" },
    },
    nicho: {
      plataformas: ["instagram", "TikTok", "Orkut"],
      ideiasConteudo: [{ formato: "Reels", titulo: "3 erros", descricao: "x" }],
    },
    voz: { tomHumor: 130, emoji: "Pouco", tamanhoFrase: "Médias" },
    pontosEmAberto: [{ decisao: "É vegetariana?", porQueImporta: "muda o repertório" }],
  };

  it("importa JSON dentro de bloco ```json com texto em volta", () => {
    const raw = "Claro! Aqui está:\n```json\n" + JSON.stringify(exemplo) + "\n```\nQualquer ajuste, avise.";
    const r = parseRespostaClaude(raw);
    expect(r.ok).toBe(true);
  });

  it("marca tudo como sugestão (suposicao) para revisão", () => {
    const r = parseRespostaClaude(JSON.stringify(exemplo));
    if (!r.ok) throw new Error(r.error);
    expect(r.suggestions.every((s) => s.origem === "suposicao")).toBe(true);
  });

  it("normaliza opções (acento, caixa)", () => {
    const r = parseRespostaClaude(JSON.stringify(exemplo));
    if (!r.ok) throw new Error(r.error);
    const get = (id: string) => r.suggestions.find((s) => s.fieldId === id)?.valor;
    expect(get("identidade.genero")).toBe("feminino");
    expect(get("voz.emoji")).toBe("pouco");
    expect(get("voz.tamanhoFrase")).toBe("medias");
    expect(get("nicho.plataformas")).toEqual(["Instagram", "TikTok"]);
  });

  it("limita números a 0–100 e valida listas aninhadas", () => {
    const r = parseRespostaClaude(JSON.stringify(exemplo));
    if (!r.ok) throw new Error(r.error);
    const get = (id: string) => r.suggestions.find((s) => s.fieldId === id)?.valor;
    expect(get("voz.tomHumor")).toBe(100);
    expect(get("soul.gostos.comidas")).toEqual(["pastel de feira"]);
  });

  it("lê os pontos em aberto", () => {
    const r = parseRespostaClaude(JSON.stringify(exemplo));
    if (!r.ok) throw new Error(r.error);
    expect(r.pontosEmAberto).toEqual([
      { decisao: "É vegetariana?", porQueImporta: "muda o repertório" },
    ]);
  });

  it("descarta opção inválida e reporta em ignorados", () => {
    const r = parseRespostaClaude(JSON.stringify({ identidade: { nome: "Lila", genero: "alienígena" } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.suggestions.map((s) => s.fieldId)).toEqual(["identidade.nome"]);
    expect(r.ignorados[0]).toContain("identidade.genero");
  });

  it("trunca bio acima de 140 caracteres", () => {
    const r = parseRespostaClaude(JSON.stringify({ identidade: { bio: "a".repeat(200) } }));
    if (!r.ok) throw new Error(r.error);
    expect((r.suggestions[0].valor as string).length).toBe(140);
  });

  it("erra com mensagem clara para texto vazio, JSON quebrado e JSON sem campos", () => {
    expect(parseRespostaClaude("  ")).toMatchObject({ ok: false });
    expect(parseRespostaClaude("isso não é json")).toMatchObject({ ok: false });
    const semCampos = parseRespostaClaude('{"foo": 1}');
    expect(semCampos).toMatchObject({ ok: false });
  });
});
