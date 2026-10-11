import { describe, expect, it } from "vitest";
import { emptyCharacter } from "@/lib/defaults";
import type { Character } from "@/lib/types";
import {
  fichaCanonica,
  hashDaFicha,
  MAX_NOME_NA_REDE,
  metadadosDaColecao,
  metadadosDoNft,
  nomeNaRede,
} from "./metadados";

function personagem(): Character {
  const c = emptyCharacter();
  c.id = "char1";
  c.identidade = {
    nome: "Lila Nova",
    bio: "Criadora sintética de receitas rápidas.",
    forma: "humano",
    idioma: "Português",
  };
  c.nicho.principal = "Culinária";
  c.soul.arquetipo = "Cuidadora";
  c.visual.estilo = "3d";
  c.visual.referencias = [
    {
      id: "r1",
      name: "ref.jpg",
      dataUrl: "",
      size: 10,
      key: "users/u_segredo/refs/abc.jpg",
    },
  ];
  c.visual.capaKey = "users/u_segredo/generated/capa.jpg";
  return c;
}

const BASE = "https://aistudio.nido.global";
const ASSET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

describe("hash da ficha", () => {
  it("é o mesmo para a mesma ficha, seja qual for a ordem das chaves", () => {
    const a = personagem();
    const b = personagem();
    b.identidade = {
      idioma: "Português",
      forma: "humano",
      bio: "Criadora sintética de receitas rápidas.",
      nome: "Lila Nova",
    };
    expect(hashDaFicha(a)).toBe(hashDaFicha(b));
    expect(hashDaFicha(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("muda quando a ficha muda", () => {
    const a = personagem();
    const b = personagem();
    b.identidade.bio = "Outra bio.";
    expect(hashDaFicha(a)).not.toBe(hashDaFicha(b));
  });

  it("não depende de arquivos, capa, galeria nem dos metadados de IA", () => {
    const a = personagem();
    const b = personagem();
    b.visual.referencias = [];
    b.visual.capaKey = undefined;
    b.geradas = [
      {
        id: "g",
        key: "users/u_segredo/generated/x.jpg",
        tipo: "retrato",
        estilo: "3d",
        qualidade: "padrao",
        size: 1,
        createdAt: 1,
      },
    ];
    b._suggestions = { "identidade.bio": "suposicao" };
    b.updatedAt = 999;
    expect(hashDaFicha(a)).toBe(hashDaFicha(b));
    expect(fichaCanonica(a)).not.toContain("users/");
  });
});

describe("nome gravado na rede", () => {
  it("corta em 32 caracteres sem quebrar emoji", () => {
    const c = personagem();
    c.identidade.nome = `  ${"Ã".repeat(31)}😀😀  `;
    const nome = nomeNaRede(c);
    expect(Array.from(nome)).toHaveLength(MAX_NOME_NA_REDE);
    expect(nome.endsWith("😀")).toBe(true);
  });
});

describe("metadados públicos do NFT", () => {
  const base = {
    base: BASE,
    asset: ASSET,
    nome: "Lila Nova",
    temCapa: true,
    totais: { views: 12_345, curtidas: 900 },
    mintadoEm: new Date("2026-10-10T12:00:00Z"),
  };

  it("traz nome, bio, capa pelo endereço público, os traços e o resumo de cada métrica", () => {
    const m = metadadosDoNft({
      ...base,
      personagem: personagem(),
      badges: ["views_5k", "views_10k"],
    });
    expect(m.name).toBe("Lila Nova");
    expect(m.description).toBe("Criadora sintética de receitas rápidas.");
    expect(m.image).toBe(`${BASE}/api/nft/meta/${ASSET}/imagem`);
    const tracos = Object.fromEntries(
      m.attributes.map((a) => [a.trait_type, a.value]),
    );
    expect(tracos).toMatchObject({
      Synthetic: "Yes",
      Niche: "Culinária",
      Archetype: "Cuidadora",
      Form: "humano",
      Style: "3d",
      Minted: "2026-10-10",
      Views: 12_345,
      "Views badge": "10K",
      Likes: 900,
      Badges: 2,
    });
  });

  it("não vaza key de arquivo, id da conta nem nada privado", () => {
    const c = personagem();
    c.soul.origem = "segredo da origem";
    c.voz.bordoes = ["bordão secreto"];
    const texto = JSON.stringify(
      metadadosDoNft({ ...base, personagem: c, badges: [] }),
    );
    expect(texto).not.toContain("users/");
    expect(texto).not.toContain("u_segredo");
    expect(texto).not.toContain("segredo da origem");
    expect(texto).not.toContain("bordão secreto");
  });

  it("personagem apagado: aparece arquivado, sem capa nem bio, e mantém os badges", () => {
    const m = metadadosDoNft({ ...base, personagem: null, badges: ["views_5k"] });
    expect(m.image).toBeUndefined();
    expect(m.properties).toBeUndefined();
    expect(m.description).toMatch(/arquivado/i);
    expect(m.attributes).toContainEqual({ trait_type: "Status", value: "Archived" });
    expect(m.attributes).toContainEqual({ trait_type: "Views badge", value: "5K" });
  });

  it("sem capa copiada, não aponta imagem", () => {
    const m = metadadosDoNft({
      ...base,
      temCapa: false,
      personagem: personagem(),
      badges: [],
    });
    expect(m.image).toBeUndefined();
  });

  it("a coleção tem nome e imagem", () => {
    const m = metadadosDaColecao(BASE);
    expect(m.name).toBe("NIDO Influencers");
    expect(m.image).toContain(BASE);
  });
});
