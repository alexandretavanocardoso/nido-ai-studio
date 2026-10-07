import { describe, expect, it } from "vitest";
import { SECOES } from "@/data/perguntas";
import { extractJson } from "@/lib/extract-json";
import { buildPromptFromImage } from "./gerar-da-imagem";

describe("buildPromptFromImage", () => {
  it("inclui anotações extras do usuário", () => {
    expect(buildPromptFromImage("Nome: Lila. Nicho: moda.")).toContain(
      "Nome: Lila. Nicho: moda."
    );
  });

  it("sem anotações, deixa claro para basear tudo na imagem", () => {
    expect(buildPromptFromImage("   ")).toContain("Sem anotações extras");
  });

  it("pede explicitamente para anexar a imagem", () => {
    const p = buildPromptFromImage("x");
    expect(p).toContain("ANEXE A IMAGEM NO CHAT");
    expect(p.toLowerCase()).toContain("anexe a imagem");
  });

  it("lista todas as perguntas do catálogo", () => {
    const p = buildPromptFromImage("x");
    for (const s of SECOES) for (const q of s.perguntas) expect(p).toContain(`- ${q.id}:`);
  });

  it("esqueleto é um JSON válido com todas as seções", () => {
    const esqueleto = extractJson(buildPromptFromImage("x"));
    const obj = JSON.parse(esqueleto);
    for (const s of SECOES) expect(obj[s.id]).toBeDefined();
    expect(obj.pontosEmAberto).toBeDefined();
  });

  it("não deixa placeholders sem substituir", () => {
    expect(buildPromptFromImage("x")).not.toMatch(/\{\{(ideia|perguntas|esqueleto)\}\}/);
  });
});
