import { describe, expect, it } from "vitest";
import {
  BADGES,
  badgePorId,
  badgesAtingidos,
  badgesDaMetrica,
  ESCADAS,
  lerDados,
  lerTotais,
  MAX_BYTES_DADOS,
  mesmosBadges,
  METRICAS_BADGE,
  METRICAS_COM_BADGE,
  montarDados,
  precisaAprovacao,
  precisaConexao,
  proximoBadge,
  rotuloDoLimite,
} from "./badges";

const views = badgesDaMetrica("views");

describe("catálogo de badges", () => {
  it("views: dez marcas, de 5 mil a 100 milhões, com os ids de sempre", () => {
    expect(views.map((b) => b.limite)).toEqual([
      5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000,
      10_000_000, 50_000_000, 100_000_000,
    ]);
    expect(views.map((b) => b.id)).toEqual([
      "views_5k",
      "views_10k",
      "views_50k",
      "views_100k",
      "views_500k",
      "views_1m",
      "views_5m",
      "views_10m",
      "views_50m",
      "views_100m",
    ]);
    expect(views[0]).toMatchObject({ nome: "5 mil views", nomeEn: "5K views", rotulo: "5K" });
    expect(views[5]).toMatchObject({ nome: "1 milhão de views", rotulo: "1M" });
    expect(views[6]).toMatchObject({ nome: "5 milhões de views", rotulo: "5M" });
  });

  it("as outras cinco métricas têm escada: a de views dividida pelo quanto cada uma rende por view", () => {
    expect(METRICAS_COM_BADGE).toEqual([...METRICAS_BADGE]);
    const degraus = (m: (typeof METRICAS_BADGE)[number]) => ESCADAS[m].degraus;
    const viewsDivididasPor = (n: number) => degraus("views").map((v) => v / n);
    expect(degraus("curtidas")).toEqual(viewsDivididasPor(50)); // 100 … 2 milhões
    // comentários: ÷ 1.000, sem o primeiro degrau (5): nenhuma escada começa abaixo de 10
    expect(degraus("comentarios")).toEqual(viewsDivididasPor(1_000).slice(1)); // 10 … 100 mil
    expect(degraus("reposts")).toEqual(viewsDivididasPor(500)); // 10 … 200 mil
    expect(degraus("salvos")).toEqual(viewsDivididasPor(500));
    // quotes só existem no X (1 a cada 10 mil views de lá): escada mais curta, no mesmo ritmo
    expect(degraus("quotes")).toEqual([10, 50, 100, 500, 1_000, 5_000, 10_000]);
    for (const m of METRICAS_BADGE) expect(degraus(m)[0], m).toBeGreaterThanOrEqual(10);
  });

  it("os ids gravados no banco e no NFT são estes (mudar um deles quebra quem já conquistou)", () => {
    const ids = (m: (typeof METRICAS_BADGE)[number]) => badgesDaMetrica(m).map((b) => b.id);
    expect(ids("curtidas")).toEqual([
      "likes_100",
      "likes_200",
      "likes_1k",
      "likes_2k",
      "likes_10k",
      "likes_20k",
      "likes_100k",
      "likes_200k",
      "likes_1m",
      "likes_2m",
    ]);
    expect(ids("comentarios")).toEqual([
      "comments_10",
      "comments_50",
      "comments_100",
      "comments_500",
      "comments_1k",
      "comments_5k",
      "comments_10k",
      "comments_50k",
      "comments_100k",
    ]);
    expect(ids("reposts")).toEqual([
      "reposts_10",
      "reposts_20",
      "reposts_100",
      "reposts_200",
      "reposts_1k",
      "reposts_2k",
      "reposts_10k",
      "reposts_20k",
      "reposts_100k",
      "reposts_200k",
    ]);
    expect(ids("quotes")).toEqual([
      "quotes_10",
      "quotes_50",
      "quotes_100",
      "quotes_500",
      "quotes_1k",
      "quotes_5k",
      "quotes_10k",
    ]);
    expect(ids("salvos")).toEqual([
      "saves_10",
      "saves_20",
      "saves_100",
      "saves_200",
      "saves_1k",
      "saves_2k",
      "saves_10k",
      "saves_20k",
      "saves_100k",
      "saves_200k",
    ]);
    expect(BADGES).toHaveLength(56);
  });

  it("os nomes saem certos em português e em inglês, com e sem milhar", () => {
    const nomes = (id: string) => [badgePorId(id)?.nome, badgePorId(id)?.nomeEn, badgePorId(id)?.rotulo];
    expect(nomes("likes_100")).toEqual(["100 curtidas", "100 likes", "100"]);
    expect(nomes("likes_2k")).toEqual(["2 mil curtidas", "2K likes", "2K"]);
    expect(nomes("likes_1m")).toEqual(["1 milhão de curtidas", "1M likes", "1M"]);
    expect(nomes("likes_2m")).toEqual(["2 milhões de curtidas", "2M likes", "2M"]);
    expect(nomes("comments_10")).toEqual(["10 comentários", "10 comments", "10"]);
    expect(nomes("reposts_200k")).toEqual(["200 mil reposts", "200K reposts", "200K"]);
    expect(nomes("quotes_10k")).toEqual(["10 mil quotes", "10K quotes", "10K"]);
    expect(nomes("saves_10")).toEqual(["10 salvamentos", "10 saves", "10"]);
  });

  it("todo degrau é um número redondo (1, 2 ou 5 seguido de zeros), no ritmo ×2 e ×5", () => {
    for (const m of METRICAS_COM_BADGE) {
      const d = ESCADAS[m].degraus;
      expect(d.length, m).toBeGreaterThanOrEqual(7);
      expect(d.length, m).toBeLessThanOrEqual(10);
      for (const [i, v] of d.entries()) {
        const cabeca = v / 10 ** Math.floor(Math.log10(v));
        expect([1, 2, 5], `${m} ${v}`).toContain(Math.round(cabeca * 1000) / 1000);
        if (i) expect([2, 5], `${m} ${d[i - 1]}→${v}`).toContain(v / d[i - 1]);
      }
    }
  });

  it("em cada escada, as duas marcas de conferência são os degraus gêmeos de 100 mil e de 1 milhão de views", () => {
    const gemeos = { curtidas: 50, comentarios: 1_000, reposts: 500, salvos: 500 } as const;
    for (const [m, divisor] of Object.entries(gemeos) as Array<[keyof typeof gemeos, number]>) {
      const e = ESCADAS[m];
      expect(e.semConexaoDe, m).toBe(ESCADAS.views.semConexaoDe / divisor);
      expect(e.aprovacaoDe, m).toBe(ESCADAS.views.aprovacaoDe / divisor);
    }
    for (const m of METRICAS_COM_BADGE) {
      expect(ESCADAS[m].degraus, m).toContain(ESCADAS[m].semConexaoDe);
      expect(ESCADAS[m].degraus, m).toContain(ESCADAS[m].aprovacaoDe);
    }
    // quotes (7 degraus): o primeiro sai sozinho; do 4º em diante, admin
    expect(ESCADAS.quotes.semConexaoDe).toBe(50);
    expect(ESCADAS.quotes.aprovacaoDe).toBe(500);
    const aguardam = (m: (typeof METRICAS_BADGE)[number]) =>
      badgesDaMetrica(m).filter(precisaAprovacao).map((b) => b.rotulo);
    expect(aguardam("curtidas")).toEqual(["20K", "100K", "200K", "1M", "2M"]);
    expect(aguardam("comentarios")).toEqual(["1K", "5K", "10K", "50K", "100K"]);
    expect(aguardam("quotes")).toEqual(["500", "1K", "5K", "10K"]);
    const semConexao = (m: (typeof METRICAS_BADGE)[number]) =>
      badgesDaMetrica(m).filter((b) => !precisaConexao(b)).map((b) => b.rotulo);
    expect(semConexao("curtidas")).toEqual(["100", "200", "1K"]);
    expect(semConexao("reposts")).toEqual(["10", "20", "100"]);
    expect(semConexao("quotes")).toEqual(["10"]);
  });

  it("toda escada é crescente, sem marca repetida, e os ids não se repetem entre métricas", () => {
    for (const m of METRICAS_BADGE) {
      const d = ESCADAS[m].degraus;
      expect([...d].sort((a, b) => a - b), m).toEqual(d);
      expect(new Set(d).size, m).toBe(d.length);
    }
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    // letras e prefixos gravados no NFT: um por métrica
    expect(new Set(METRICAS_BADGE.map((m) => ESCADAS[m].letra)).size).toBe(METRICAS_BADGE.length);
    expect(new Set(METRICAS_BADGE.map((m) => ESCADAS[m].prefixo)).size).toBe(METRICAS_BADGE.length);
    expect(METRICAS_COM_BADGE).toContain("views");
  });

  it("nome curto das marcas", () => {
    expect(rotuloDoLimite(500)).toBe("500");
    expect(rotuloDoLimite(1_000)).toBe("1K");
    expect(rotuloDoLimite(2_500)).toBe("2.5K");
    expect(rotuloDoLimite(100_000)).toBe("100K");
    expect(rotuloDoLimite(1_000_000)).toBe("1M");
    expect(rotuloDoLimite(100_000_000)).toBe("100M");
  });

  it("cada marca dispara no valor exato, nem uma unidade antes", () => {
    for (const m of METRICAS_COM_BADGE)
      for (const [i, b] of badgesDaMetrica(m).entries()) {
        expect(badgesAtingidos({ [m]: b.limite - 1 }), b.id).toHaveLength(i);
        expect(badgesAtingidos({ [m]: b.limite }).map((x) => x.id), b.id).toContain(b.id);
        expect(badgesAtingidos({ [m]: b.limite }), b.id).toHaveLength(i + 1);
      }
    expect(badgesAtingidos({})).toEqual([]);
    expect(badgesAtingidos({ views: 4_999 })).toEqual([]);
  });

  it("os badges se acumulam: quem bate várias marcas de uma vez leva todas", () => {
    expect(badgesAtingidos({ views: 1_200_000 }).map((b) => b.id)).toEqual([
      "views_5k",
      "views_10k",
      "views_50k",
      "views_100k",
      "views_500k",
      "views_1m",
    ]);
    expect(badgesAtingidos({ views: 10 ** 12 }).filter((b) => b.metrica === "views")).toHaveLength(10);
  });

  it("uma métrica não conquista badge de outra", () => {
    expect(badgesAtingidos({ curtidas: 10 ** 12 }).some((b) => b.metrica === "views")).toBe(false);
    expect(badgesAtingidos({ views: 10 ** 12 }).every((b) => b.metrica === "views")).toBe(true);
  });

  it("views: de 1 milhão para cima sempre passa por um admin; de 100 mil para cima, só com conta conectada", () => {
    expect(views.filter(precisaAprovacao).map((b) => b.id)).toEqual([
      "views_1m",
      "views_5m",
      "views_10m",
      "views_50m",
      "views_100m",
    ]);
    expect(views.filter((b) => !precisaConexao(b)).map((b) => b.id)).toEqual([
      "views_5k",
      "views_10k",
      "views_50k",
    ]);
  });

  it("em toda escada, a marca que exige conta conectada vem antes (ou junto) da que exige admin", () => {
    for (const m of METRICAS_COM_BADGE)
      expect(ESCADAS[m].semConexaoDe, m).toBeLessThanOrEqual(ESCADAS[m].aprovacaoDe);
  });

  it("diz qual é a próxima marca", () => {
    expect(proximoBadge("curtidas", 0)?.id).toBe("likes_100");
    expect(proximoBadge("curtidas", 150)?.id).toBe("likes_200");
    expect(proximoBadge("quotes", 10_000)).toBeNull();
    expect(proximoBadge("views", 0)?.id).toBe("views_5k");
    expect(proximoBadge("views", 5_000)?.id).toBe("views_10k");
    expect(proximoBadge("views", 100_000_000)).toBeNull();
  });

  it("lê os totais guardados no banco, completando com zero", () => {
    expect(lerTotais({ views: 10, curtidas: "7", lixo: 3, quotes: -1 })).toEqual({
      views: 10,
      curtidas: 7,
      comentarios: 0,
      reposts: 0,
      quotes: 0,
      salvos: 0,
    });
    expect(lerTotais(null).views).toBe(0);
  });
});

describe("dados gravados no NFT", () => {
  const hash = "a".repeat(64);
  const em = new Date("2026-10-10T12:00:00Z");
  const dia = Math.floor(em.getTime() / 86_400_000);
  const texto = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));

  it("grava por posição na escada, com o dia da conquista, e lê de volta os ids", () => {
    const bytes = montarDados(hash, [
      { id: "views_10k", em },
      { id: "views_5k", em },
    ]);
    expect(texto(bytes)).toEqual({ v: 2, ficha: hash, b: { v: [dia, dia] } });
    expect(lerDados(bytes)).toEqual({ v: 2, ficha: hash, badges: ["views_5k", "views_10k"] });
  });

  it("cada métrica vai na sua letra, na ordem das escadas", () => {
    const bytes = montarDados(hash, [
      { id: "saves_10", em },
      { id: "likes_200", em },
      { id: "likes_100", em },
      { id: "quotes_10", em },
      { id: "comments_50", em }, // sem o de 10: buraco no começo
      { id: "views_5k", em },
      { id: "reposts_100", em },
    ]);
    expect(texto(bytes).b).toEqual({
      v: [dia],
      l: [dia, dia],
      c: [0, dia],
      r: [0, 0, dia],
      q: [dia],
      s: [dia],
    });
    expect(lerDados(bytes)?.badges).toEqual([
      "views_5k",
      "likes_100",
      "likes_200",
      "comments_50",
      "reposts_100",
      "quotes_10",
      "saves_10",
    ]);
  });

  it("marca pulada (ainda em conferência) vira zero no meio, e zeros no fim são cortados", () => {
    const bytes = montarDados(hash, [
      { id: "views_5k", em },
      { id: "views_50k", em },
    ]);
    expect(texto(bytes).b).toEqual({ v: [dia, 0, dia] });
    expect(lerDados(bytes)?.badges).toEqual(["views_5k", "views_50k"]);
  });

  it("sem badge nenhum, grava só o hash da ficha", () => {
    const bytes = montarDados(hash, []);
    expect(texto(bytes)).toEqual({ v: 2, ficha: hash, b: {} });
    expect(lerDados(bytes)).toEqual({ v: 2, ficha: hash, badges: [] });
  });

  it("badge fora do catálogo não é gravado", () => {
    const bytes = montarDados(hash, [
      { id: "views_5k", em },
      { id: "badge_que_nao_existe", em },
    ]);
    expect(lerDados(bytes)?.badges).toEqual(["views_5k"]);
  });

  it("o catálogo inteiro, todas as métricas, cabe com folga numa transação", () => {
    const bytes = montarDados(
      hash,
      BADGES.map((b) => ({ id: b.id, em })),
    );
    expect(bytes.length).toBeLessThan(MAX_BYTES_DADOS);
    expect(lerDados(bytes)?.badges).toEqual(BADGES.map((b) => b.id));
  });

  it("lê o formato da primeira versão (NFTs mintados antes)", () => {
    const antigo = { v: 1, ficha: hash, badges: [["views_5k", 1_760_000_000], ["views_10k", 1_760_000_500]] };
    expect(lerDados(antigo)).toEqual({ v: 1, ficha: hash, badges: ["views_5k", "views_10k"] });
    expect(lerDados({ v: 1, ficha: hash, badges: [] })).toEqual({ v: 1, ficha: hash, badges: [] });
  });

  it("lê o JSON já aberto (como o SDK devolve) e ignora o que está fora do formato", () => {
    expect(lerDados({ v: 2, ficha: hash, b: { v: [dia, "x", dia], z: [1] } })).toEqual({
      v: 2,
      ficha: hash,
      badges: ["views_5k", "views_50k"],
    });
    expect(lerDados(null)).toBeNull();
    expect(lerDados(new TextEncoder().encode("não é json"))).toBeNull();
    expect(lerDados({ b: {} })).toBeNull();
    expect(lerDados({ ficha: hash })).toBeNull();
  });

  it("todo id do catálogo é achado pelo id", () => {
    for (const b of BADGES) expect(badgePorId(b.id)).toBe(b);
    expect(badgePorId("nada")).toBeUndefined();
  });

  it("compara listas de badges sem ligar para a ordem", () => {
    expect(mesmosBadges(["a", "b"], ["b", "a"])).toBe(true);
    expect(mesmosBadges([], [])).toBe(true);
    expect(mesmosBadges(["a"], ["a", "b"])).toBe(false);
    expect(mesmosBadges(["a"], ["b"])).toBe(false);
  });
});
