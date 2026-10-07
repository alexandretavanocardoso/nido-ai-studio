import { describe, expect, it } from "vitest";
import { emptyCharacter } from "@/lib/defaults";
import {
  buildAllImagePrompts,
  buildImagePrompt,
  extractDescricaoVisual,
} from "./gerar-imagem";

function sampleCharacter() {
  const c = emptyCharacter();
  c.identidade.nome = "Lila Serafina";
  c.identidade.genero = "feminino";
  c.identidade.forma = "humano";
  c.identidade.idadeAparente = "28 anos";
  c.visual.cabelo = "Cacheado cor cobre, altura dos ombros";
  c.visual.pele = "Pele quente com sardas no nariz";
  c.visual.olhos = "Castanhos, levemente puxados";
  c.visual.roupa = "Oversize vintage colorido";
  c.visual.acessorios = "Óculos redondo, anéis grandes";
  c.visual.tracosMarcantes = "Tatuagem floral no antebraço";
  c.visual.paleta = "Terracota, bege, verde-oliva";
  c.soul.adjetivos = ["debochada", "generosa", "teimosa"];
  return c;
}

describe("buildImagePrompt", () => {
  it("os 3 formatos sempre têm o nome do personagem", () => {
    const c = sampleCharacter();
    for (const f of ["neutro", "midjourney", "flux"] as const) {
      expect(buildImagePrompt(c, f)).toContain("Lila Serafina");
    }
  });

  it("não deixa placeholders por substituir", () => {
    const c = sampleCharacter();
    for (const f of ["neutro", "midjourney", "flux"] as const) {
      expect(buildImagePrompt(c, f)).not.toMatch(/\{\{.*?\}\}/);
    }
  });

  it("inclui cabelo, roupa, paleta e tatuagem", () => {
    const p = buildImagePrompt(sampleCharacter(), "neutro");
    expect(p).toContain("Cacheado cor cobre");
    expect(p).toContain("Oversize vintage colorido");
    expect(p).toContain("Terracota, bege, verde-oliva");
    expect(p).toContain("Tatuagem floral no antebraço");
  });

  it("Midjourney traz as flags --ar, --style raw, --v e --no", () => {
    const p = buildImagePrompt(sampleCharacter(), "midjourney");
    expect(p).toMatch(/--ar\s/);
    expect(p).toContain("--style raw");
    expect(p).toMatch(/--v\s/);
    expect(p).toContain("--no ");
  });

  it("Flux separa Positive e Negative", () => {
    const p = buildImagePrompt(sampleCharacter(), "flux");
    expect(p).toContain("Positive:");
    expect(p).toContain("Negative:");
  });

  it("neutro empurra para o lado bizarro/editorial e tem SIGNATURE EXAGGERATED TRAIT", () => {
    const p = buildImagePrompt(sampleCharacter(), "neutro");
    expect(p).toContain("SIGNATURE EXAGGERATED TRAIT");
    expect(p).toMatch(/high-fashion editorial/i);
  });

  it("todos os formatos listam 'safe realism' ou 'generic model' no negativo", () => {
    for (const f of ["neutro", "midjourney", "flux"] as const) {
      const p = buildImagePrompt(sampleCharacter(), f).toLowerCase();
      expect(p).toMatch(/safe (generic )?realism|generic model|stock-model|stock photo/);
    }
  });

  it("não quebra quando a ficha está vazia", () => {
    const c = emptyCharacter();
    const p = buildImagePrompt(c, "neutro");
    expect(p).toContain("the character");
    expect(p).toContain("no visual details provided yet");
    expect(p).not.toMatch(/\{\{.*?\}\}/);
  });

  it("ficha vazia + ideia livre: usa só a ideia", () => {
    const c = emptyCharacter();
    c.visual.ideiaLivre = "Jovem skatista com pisante punk e cabelo platinado";
    const p = buildImagePrompt(c, "neutro");
    expect(p).toContain("skatista com pisante punk");
    expect(p).not.toContain("no visual details provided yet");
    expect(p).not.toContain("Additional details");
  });

  it("ideia + ficha: ideia primeiro, campos como Additional details", () => {
    const c = sampleCharacter();
    c.visual.ideiaLivre = "Vibe editorial calma com um quê de ateliê";
    const p = buildImagePrompt(c, "neutro");
    const idxIdeia = p.indexOf("Vibe editorial calma");
    const idxAdd = p.indexOf("Additional details");
    const idxCabelo = p.indexOf("Cacheado cor cobre");
    expect(idxIdeia).toBeGreaterThan(0);
    expect(idxAdd).toBeGreaterThan(idxIdeia);
    expect(idxCabelo).toBeGreaterThan(idxAdd);
  });

  it("Midjourney concatena ideia + campos em linha única", () => {
    const c = sampleCharacter();
    c.visual.ideiaLivre = "editorial fashion vibe";
    const p = buildImagePrompt(c, "midjourney");
    expect(p).toContain("editorial fashion vibe, additional details:");
  });

  it("forma != humano aparece explicitamente", () => {
    const c = emptyCharacter();
    c.identidade.nome = "Vulpes";
    c.identidade.forma = "animal";
    const d = extractDescricaoVisual(c, "neutro");
    expect(d).toContain("animal form");
  });
});

describe("buildAllImagePrompts", () => {
  it("retorna os 3 formatos, cada um com nome e descrição curta", () => {
    const list = buildAllImagePrompts(sampleCharacter());
    expect(list.map((p) => p.formato)).toEqual(["neutro", "midjourney", "flux"]);
    for (const p of list) {
      expect(p.nome).toBeTruthy();
      expect(p.descricaoCurta.length).toBeGreaterThan(10);
      expect(p.prompt).toContain("Lila Serafina");
    }
  });
});

describe("estilo 3D", () => {
  it("troca o render fotográfico pelo 3D no formato neutro (card e retrato)", () => {
    const c = sampleCharacter();
    c.visual.estilo = "3d";
    for (const tipo of ["referencia", "retrato"] as const) {
      const p = buildImagePrompt(c, "neutro", tipo);
      expect(p).toContain("Stylized 3D character render");
      expect(p).toContain("No photographic realism");
      expect(p).not.toContain("Photoreal with AAA");
      expect(p).not.toContain("no cartoon or anime styling");
    }
    expect(buildImagePrompt(c, "neutro")).not.toContain("hyperrealistic character portrait");
  });

  it("Midjourney e Flux também viram 3D (card e retrato)", () => {
    const c = sampleCharacter();
    c.visual.estilo = "3d";
    for (const tipo of ["referencia", "retrato"] as const) {
      const mj = buildImagePrompt(c, "midjourney", tipo);
      expect(mj).toContain("stylized 3D render");
      expect(mj).not.toContain("hyperrealistic photoreal");
      expect(mj).not.toContain("100% photographic");
      expect(mj).not.toContain("--style raw");
      expect(mj).toContain("--no photographic realism");

      const flux = buildImagePrompt(c, "flux", tipo);
      expect(flux).toContain("stylized 3D character render");
      expect(flux).not.toContain("photoreal with AAA");
      expect(flux).toContain("Negative:\nphotographic realism");
    }
  });

  it("realista (padrão) mantém os prompts fotográficos", () => {
    const c = sampleCharacter();
    expect(buildImagePrompt(c, "neutro")).toContain("Photoreal with AAA");
    expect(buildImagePrompt(c, "midjourney")).toContain("hyperrealistic photoreal");
    expect(buildImagePrompt(c, "midjourney")).toContain("--style raw");
    expect(buildImagePrompt(c, "flux")).toContain("photoreal with AAA");
  });
});
