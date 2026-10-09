import { describe, expect, it } from "vitest";
import { dimensoesTroca, lerViradas, trechosTroca } from "./ffmpeg";

describe("divisão nas viradas de cena", () => {
  it("lê instante e força da saída do ffmpeg", () => {
    expect(
      lerViradas(
        "[Parsed_metadata_2 @ 0x1] frame:0    pts:192000  pts_time:8\n" +
          "[Parsed_metadata_2 @ 0x1] lavfi.scene_score=0.090643\n" +
          "[Parsed_metadata_2 @ 0x1] frame:1    pts:276000  pts_time:11.5\n" +
          "[Parsed_metadata_2 @ 0x1] lavfi.scene_score=0.095507\n",
      ),
    ).toEqual([
      { t: 8, forca: 0.090643 },
      { t: 11.5, forca: 0.095507 },
    ]);
    expect(lerViradas("nada aqui")).toEqual([]);
  });

  it("movimento brusco: o trecho novo começa 0,75 s antes do gesto, não em cima dele", () => {
    // O segundo golpe ficaria a menos de 3 s do fim: não divide.
    const golpes = [{ t: 8, forca: 0.09 }, { t: 11.5, forca: 0.095 }];
    expect(trechosTroca(13, 15, golpes, 3).map((x) => x.inicio)).toEqual([0, 7.25]);
  });

  it("divide nos cortes de câmera e, dentro de cada pedaço, em partes de até o máximo", () => {
    const viradas = [
      { t: 8, forca: 0.4 },
      { t: 11.5, forca: 0.45 },
      { t: 11.7, forca: 0.38 }, // colado no anterior: fica de fora
    ];
    const t = trechosTroca(26.19, 15, viradas, 3);
    expect(t.map((x) => x.inicio)).toEqual([0, 8, 11.5]);
    expect(t.map((x) => x.duracao)).toEqual([8, 3.5, 14.69]);
    // Somam o vídeo inteiro e respeitam os limites do motor.
    expect(t.reduce((s, x) => s + x.duracao, 0)).toBeCloseTo(26.19, 2);
    expect(t.every((x) => x.duracao >= 3 && x.duracao <= 15)).toBe(true);
  });

  it("virada perto demais do começo ou do fim não divide; a mais forte ganha", () => {
    expect(trechosTroca(10, 15, [{ t: 1, forca: 0.9 }, { t: 8.5, forca: 0.9 }], 3)).toEqual([
      { inicio: 0, duracao: 10 },
    ]);
    const t = trechosTroca(12, 15, [{ t: 5, forca: 0.35 }, { t: 7, forca: 0.6 }], 3);
    expect(t.map((x) => x.inicio)).toEqual([0, 7]);
  });
});

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
