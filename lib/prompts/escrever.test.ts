import { describe, expect, it } from "vitest";
import { pedidoEscrita, separarOpcoes } from "./escrever";

describe("escrever como o personagem", () => {
  it("cada formato pede o que precisa", () => {
    expect(pedidoEscrita({ tipo: "legenda", plataforma: "tiktok", tema: "pastel na feira" })).toMatch(/3 opções de legenda.*TikTok.*pastel na feira/s);
    expect(pedidoEscrita({ tipo: "roteiro", plataforma: "instagram", tema: "3 erros" })).toMatch(/GANCHO.*CENAS.*FECHAMENTO/s);
    const r = pedidoEscrita({ tipo: "resposta", plataforma: "youtube", tema: "", comentario: "que look feio" });
    expect(r).toContain('"que look feio"');
    expect(r).not.toContain("Contexto do post");
  });
  it("separa as opções pelo ---", () => {
    expect(separarOpcoes("A\n---\nB\n\n---\nC")).toEqual(["A", "B", "C"]);
    expect(separarOpcoes("só uma")).toEqual(["só uma"]);
  });
});
