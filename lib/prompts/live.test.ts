import { describe, expect, it } from "vitest";
import { pedidoEspontaneo, pedidoLive, proximoTipo, type TrocaLive } from "./live";

const fala = (tipo: TrocaLive["tipo"]): TrocaLive => ({ texto: "", resposta: "…", espontanea: true, tipo });
const chat: TrocaLive = { autor: "lucas", texto: "qual teu anime favorito?", resposta: "Naruto!" };

describe("modo apresentador: tipo da próxima fala", () => {
  // Varre o sorteio inteiro (0 a 1) e devolve os tipos possíveis.
  const possiveis = (anteriores: TrocaLive[]) =>
    new Set(Array.from({ length: 101 }, (_, i) => proximoTipo(anteriores, i / 101)));

  it("sem chat ainda, nunca sorteia retomar o chat", () => {
    expect(possiveis([])).toEqual(new Set(["assunto", "piada", "pergunta", "chamada"]));
  });

  it("com alguém no chat, retomar o chat entra no sorteio", () => {
    expect(possiveis([chat]).has("chat")).toBe(true);
  });

  it("não repete o tipo da última fala", () => {
    expect(possiveis([fala("piada")]).has("piada")).toBe(false);
  });

  it("pergunta só uma a cada 2 falas, boas-vindas uma a cada 4", () => {
    expect(possiveis([fala("pergunta"), fala("assunto")]).has("pergunta")).toBe(false);
    expect(possiveis([fala("pergunta"), fala("assunto"), fala("piada")]).has("pergunta")).toBe(true);
    const tresDepois = [fala("chamada"), fala("assunto"), fala("piada"), fala("pergunta")];
    expect(possiveis(tresDepois).has("chamada")).toBe(false);
    expect(possiveis([...tresDepois, fala("assunto")]).has("chamada")).toBe(true);
  });

  it("respostas ao chat no meio não contam como falas espontâneas", () => {
    expect(possiveis([fala("pergunta"), chat]).has("pergunta")).toBe(false);
  });

  it("com jogo na tela, comentar o jogo entra no sorteio, é o mais provável e pode repetir", () => {
    expect(possiveis([]).has("jogo")).toBe(false);
    const comTela = (anteriores: TrocaLive[]) =>
      Array.from({ length: 1000 }, (_, i) => proximoTipo(anteriores, i / 1000, true));
    const n = comTela([fala("jogo")]);
    const conta = (t: string) => n.filter((x) => x === t).length;
    expect(conta("jogo")).toBeGreaterThan(conta("assunto"));
    expect(conta("jogo")).toBeGreaterThan(400);
  });

  it("assunto é o tipo mais provável (maior peso)", () => {
    const n = Array.from({ length: 1000 }, (_, i) => proximoTipo([], i / 1000));
    const conta = (t: string) => n.filter((x) => x === t).length;
    expect(conta("assunto")).toBeGreaterThan(conta("piada"));
    expect(conta("assunto")).toBeGreaterThan(conta("chamada"));
  });
});

describe("pedidos da live", () => {
  it("a fala espontânea leva o tipo, o assunto e proíbe reclamar do chat parado", () => {
    const p = pedidoEspontaneo({ tipo: "piada", tema: "animes", anteriores: [chat, fala("assunto")] });
    expect(p).toContain("Assunto da live: animes.");
    expect(p).toMatch(/piada leve/);
    expect(p).toMatch(/Não reclame que o chat está parado/);
    expect(p).toContain("lucas: qual teu anime favorito?");
    expect(p).toContain("Você falou por conta própria: …");
  });

  it("com a tela, o pedido avisa que a imagem é o jogo e proíbe inventar", () => {
    expect(pedidoEspontaneo({ tipo: "jogo", comTela: true })).toMatch(/imagem da sua tela agora/);
    expect(pedidoEspontaneo({ tipo: "jogo", comTela: true })).toMatch(/não invente placar/);
    expect(pedidoLive({ autor: "ana", texto: "oi" }, [], true)).toMatch(/imagem da sua tela agora/);
    expect(pedidoLive({ autor: "ana", texto: "oi" })).not.toMatch(/imagem da sua tela/);
  });

  it("sem assunto, usa o nicho e a personalidade", () => {
    expect(pedidoEspontaneo({ tipo: "assunto" })).toMatch(/seu nicho e da sua personalidade/);
  });

  it("a resposta ao chat também vê as falas espontâneas anteriores", () => {
    const p = pedidoLive({ autor: "ana", texto: "oi" }, [fala("piada")]);
    expect(p).toContain("Você falou por conta própria");
    expect(p).toContain("Nova mensagem no chat, de ana:");
  });
});
