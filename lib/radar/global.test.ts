import { describe, expect, it } from "vitest";
import {
  idiomasDoRadarGlobal,
  NICHOS_GLOBAIS,
  nichoGlobal,
  perfilDoNicho,
} from "./global";

describe("radar global", () => {
  it("tem os cinco nichos, com nome e temas nos dois idiomas", () => {
    expect(NICHOS_GLOBAIS.map((n) => n.id)).toEqual([
      "tecnologia",
      "ia",
      "startups",
      "influencer-ia",
      "politica",
    ]);
    for (const n of NICHOS_GLOBAIS)
      for (const idioma of ["pt", "en"] as const) {
        expect(n.nome[idioma]).toBeTruthy();
        expect(n.temas[idioma].length).toBeGreaterThan(0);
      }
  });

  it("acha o nicho pelo id e recusa o que não existe", () => {
    expect(nichoGlobal("ia")?.nome.pt).toBe("IA");
    expect(nichoGlobal("fofoca")).toBeNull();
    expect(nichoGlobal(null)).toBeNull();
  });

  it("o perfil fala do nicho, no idioma pedido, sem ser de uma pessoa", () => {
    const n = nichoGlobal("startups")!;
    expect(perfilDoNicho(n, "pt")).toContain("Nicho: Startups");
    expect(perfilDoNicho(n, "pt")).toContain("não é uma pessoa específica");
    expect(perfilDoNicho(n, "en")).toContain("Niche: Startups");
  });

  it("idiomas: padrão pt e en; a variável de ambiente restringe e ignora lixo", () => {
    expect(idiomasDoRadarGlobal("")).toEqual(["pt", "en"]);
    expect(idiomasDoRadarGlobal("pt")).toEqual(["pt"]);
    expect(idiomasDoRadarGlobal(" EN , pt, en, xx ")).toEqual(["en", "pt"]);
    expect(idiomasDoRadarGlobal("xx")).toEqual(["pt", "en"]);
  });
});
