import { describe, expect, it } from "vitest";
import { extrairMetricas, type PostMetricas } from "./metricas";
import { engajamento, resumir, variacao } from "./painel";

const AGORA = new Date(2026, 9, 7, 15, 0);
const m = (views: number, curtidas = 0) => ({
  views,
  curtidas,
  comentarios: 0,
  reposts: 0,
  quotes: 0,
  salvos: 0,
});
const post = (
  id: string,
  characterId: string,
  diasAtras: number,
  metricas: PostMetricas["metricas"],
): PostMetricas => ({
  id,
  characterId,
  quando: new Date(2026, 9, 7 - diasAtras, 10, 0).toISOString(),
  redes: Object.keys(metricas) as PostMetricas["redes"],
  link: null,
  viewsManual: false,
  texto: "",
  metricas,
});

describe("resumir", () => {
  const posts = [
    post("a", "x", 0, { INSTAGRAM: m(100, 10), TIKTOK: m(300, 5) }),
    post("b", "y", 3, { TWITTER: m(50) }),
    post("c", "x", 9, { INSTAGRAM: m(200) }),
    post("d", "x", 20, { INSTAGRAM: m(999) }),
  ];

  it("soma o período e o período anterior", () => {
    const r = resumir(posts, 7, AGORA);
    expect(r.posts).toBe(2);
    expect(r.atual.views).toBe(450);
    expect(r.atual.curtidas).toBe(15);
    expect(r.anterior.views).toBe(200);
  });

  it("ordena personagens por views e acha a melhor rede", () => {
    const r = resumir(posts, 7, AGORA);
    expect(r.personagens.map((p) => p.characterId)).toEqual(["x", "y"]);
    expect(r.personagens[0].melhor).toBe("TIKTOK");
    expect(r.redes[0]).toEqual({ rede: "TIKTOK", views: 300 });
  });

  it("põe as views na barra do dia da publicação", () => {
    const r = resumir(posts, 7, AGORA);
    expect(r.barras).toHaveLength(7);
    expect(r.barras[6].views).toBe(400);
    expect(r.barras[3].views).toBe(50);
    expect(resumir(posts, 30, AGORA).barras).toHaveLength(6);
  });
});

describe("contas", () => {
  it("engajamento = interações ÷ views", () => {
    expect(engajamento(m(200, 10))).toBe(0.05);
    expect(engajamento(m(0, 10))).toBe(0);
  });
  it("variação sem base é null", () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(150, 100)).toBe(50);
  });
});

describe("extrairMetricas", () => {
  const base = {
    impressions: 900,
    views: 0,
    likes: 4,
    comments: 2,
    shares: 7,
    saves: 1,
    createdAt: null,
    updatedAt: null,
  };
  it("usa impressões quando não há views e shares como reposts", () => {
    expect(extrairMetricas(base)).toEqual({
      views: 900,
      curtidas: 4,
      comentarios: 2,
      reposts: 7,
      quotes: 0,
      salvos: 1,
    });
  });
  it("separa reposts e quotes quando a rede manda os dois", () => {
    const r = extrairMetricas({
      ...base,
      raw: { public_metrics: { retweet_count: 5, quote_count: 2 } },
    });
    expect(r.reposts).toBe(5);
    expect(r.quotes).toBe(2);
  });
});
