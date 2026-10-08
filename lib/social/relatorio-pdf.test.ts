import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { PostMetricas } from "./metricas";
import { resumir } from "./painel";
import { baixarRelatorioPdf, textoPdf } from "./relatorio-pdf";

describe("textoPdf", () => {
  it("troca o que a fonte do PDF não tem e mantém os acentos", () => {
    expect(textoPdf("SOON → NIDO — ação “top”… 🚀")).toBe(
      'SOON -> NIDO - ação "top"...',
    );
  });
});

describe("baixarRelatorioPdf", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "nido-pdf-"));
  const antes = process.cwd();
  afterAll(() => {
    process.chdir(antes);
    rmSync(pasta, { recursive: true, force: true });
  });

  it("gera o PDF com várias páginas sem quebrar", async () => {
    process.chdir(pasta);
    const agora = new Date();
    const posts: PostMetricas[] = Array.from({ length: 70 }, (_, i) => ({
      id: `p${i}`,
      characterId: i % 2 ? "a" : "b",
      quando: new Date(agora.getTime() - (i % 25) * 86_400_000).toISOString(),
      redes: [i % 3 ? "LINKEDIN" : "TIKTOK"],
      link: i % 4 ? null : `https://www.linkedin.com/posts/exemplo-${i}`,
      viewsManual: i % 8 === 0,
      texto: "",
      metricas: {
        [i % 3 ? "LINKEDIN" : "TIKTOK"]: {
          views: 1000 + i,
          curtidas: i,
          comentarios: 2,
          reposts: 1,
          quotes: 0,
          salvos: 3,
        },
      },
    }));
    await baixarRelatorioPdf({
      personagem: null,
      periodo: 30,
      resumo: resumir(posts, 30, agora),
      posts,
      nomes: new Map([
        ["a", "João Ação"],
        ["b", "Gru musculoso"],
      ]),
    });
    const [arquivo] = readdirSync(pasta);
    expect(arquivo).toMatch(/^nido-metricas-todos-30d-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(existsSync(path.join(pasta, arquivo))).toBe(true);
    const pdf = readFileSync(path.join(pasta, arquivo), "latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
