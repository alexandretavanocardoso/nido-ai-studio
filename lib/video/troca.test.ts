import { describe, expect, it } from "vitest";
import { dimensoesTroca, trechosTroca } from "./ffmpeg";

describe("trechos da troca", () => {
  it("Kling O3 aceita até 15s: 15s vai inteiro, 20s vira 2 de 10s, nenhum abaixo de 3s", () => {
    expect(trechosTroca(15, 15)).toEqual([{ inicio: 0, duracao: 15 }]);
    expect(trechosTroca(20, 15).map((t) => t.duracao)).toEqual([10, 10]);
    for (const d of [15.5, 30, 44.9, 60])
      expect(
        trechosTroca(d, 15).every((x) => x.duracao <= 15 && x.duracao >= 3),
      ).toBe(true);
  });
  it("Seedance aceita até 30s: 25s vai inteiro, 45s vira 2 de 22,5s", () => {
    expect(trechosTroca(25, 30)).toEqual([{ inicio: 0, duracao: 25 }]);
    expect(trechosTroca(45, 30).map((t) => t.duracao)).toEqual([22.5, 22.5]);
  });
  it("até 10s vai inteiro", () => {
    expect(trechosTroca(5)).toEqual([{ inicio: 0, duracao: 5 }]);
    expect(trechosTroca(10)).toEqual([{ inicio: 0, duracao: 10 }]);
  });
  it("divide em partes iguais, cobrindo o vídeo todo, nenhuma acima de 10s nem abaixo de 3s", () => {
    for (const d of [10.5, 15, 23.7, 30, 59.9, 60]) {
      const t = trechosTroca(d);
      expect(t.length).toBe(Math.ceil(d / 10));
      expect(t.every((x) => x.duracao <= 10 && x.duracao >= 3)).toBe(true);
      expect(t.reduce((s, x) => s + x.duracao, 0)).toBeCloseTo(d, 2);
      expect(t[0].inicio).toBe(0);
    }
    expect(trechosTroca(15)).toEqual([
      { inicio: 0, duracao: 7.5 },
      { inicio: 7.5, duracao: 7.5 },
    ]);
  });
});

describe("resolução aceita pelo Kling (lado menor ≥ 720, maior ≤ 2160)", () => {
  it("aumenta vídeo pequeno, reduz vídeo grande, mantém o resto", () => {
    expect(dimensoesTroca(576, 1024)).toEqual({ largura: 720, altura: 1280 });
    expect(dimensoesTroca(2160, 3840)).toEqual({ largura: 1216, altura: 2160 });
    expect(dimensoesTroca(1080, 1920)).toEqual({ largura: 1080, altura: 1920 });
    expect(dimensoesTroca(464, 832).largura % 2).toBe(0);
  });
});
