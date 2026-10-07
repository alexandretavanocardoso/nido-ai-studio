import { describe, expect, it } from "vitest";
import { emptyCharacter } from "@/lib/defaults";
import { promptSistema } from "./sistema";

describe("promptSistema", () => {
  it("gera texto mesmo com personagem vazio", () => {
    const c = emptyCharacter();
    const out = promptSistema(c);
    expect(out).toContain("Você é o personagem");
    expect(out).toContain("[REGRAS GERAIS]");
  });

  it("inclui o nome, bio e arquétipo quando preenchidos", () => {
    const c = emptyCharacter();
    c.identidade.nome = "Lila";
    c.identidade.bio = "Arquiteta ácida";
    c.soul.arquetipo = "Provocadora";
    c.soul.adjetivos = ["debochada", "generosa", "insegura"];
    const out = promptSistema(c);
    expect(out).toContain("Você é Lila");
    expect(out).toContain("Arquiteta ácida");
    expect(out).toContain("Arquétipo: Provocadora");
    expect(out).toContain("debochada, generosa, insegura");
  });

  it("lista regras de consistência quando houver", () => {
    const c = emptyCharacter();
    c.soul.regrasConsistencia = ["nunca fala sobre política partidária"];
    const out = promptSistema(c);
    expect(out).toContain("[REGRAS DE CONSISTÊNCIA — INEGOCIÁVEIS]");
    expect(out).toContain("- nunca fala sobre política partidária");
  });

  it("inclui bordões e palavras proibidas quando houver", () => {
    const c = emptyCharacter();
    c.voz.bordoes = ["bora resolver"];
    c.voz.proibidas = ["literalmente"];
    const out = promptSistema(c);
    expect(out).toContain("Bordões: bora resolver.");
    expect(out).toContain("NUNCA usa estas palavras/expressões: literalmente.");
  });
});
