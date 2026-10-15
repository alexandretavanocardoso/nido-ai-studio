import { describe, expect, it } from "vitest";
import {
  ajustarCorte,
  caixaEmPixels,
  emendaDireta,
  type VideoInfo,
} from "./ffmpeg";
import { centroDaLegenda, quebrarLinhas } from "./legenda-texto";

describe("centroDaLegenda", () => {
  it("fica no meio da área marcada", () => {
    expect(centroDaLegenda({ x: 0.1, w: 0.4 }, ["oi"])).toBeCloseTo(0.3);
  });

  it("gruda no meio do vídeo quando a área está quase centralizada", () => {
    expect(centroDaLegenda({ x: 0.22, w: 0.6 }, ["oi"])).toBe(0.5);
  });

  it("não deixa a linha mais comprida sair do quadro", () => {
    const linhas = ["uma linha de vinte letras", "curta"];
    const metade = (25 * 0.062 * 0.58) / 2;
    expect(centroDaLegenda({ x: 0, w: 0.2 }, linhas)).toBeCloseTo(metade);
    expect(centroDaLegenda({ x: 0.8, w: 0.2 }, linhas)).toBeCloseTo(1 - metade);
  });
});

describe("ajustarCorte", () => {
  it("mantém o trecho pedido quando ele cabe no vídeo", () => {
    expect(ajustarCorte(2, 11.5, 15, 0.5)).toEqual({ inicio: 2, duracao: 9.5 });
  });

  it("segura o fim na duração real do vídeo", () => {
    expect(ajustarCorte(10, 15.04, 15, 0.5)).toEqual({ inicio: 10, duracao: 5 });
  });

  it("recusa o trecho que fica menor que o mínimo", () => {
    expect(ajustarCorte(14.8, 16, 15, 0.5)).toBeNull();
    expect(ajustarCorte(20, 25, 15, 0.5)).toBeNull();
  });
});

describe("emendaDireta", () => {
  const k4 = "h264 (Main) (avc1 / 0x31637661), yuv420p(progressive), 2160x3840";
  const trecho = (duracao: number, formato = k4, fps = 24): VideoInfo => ({
    largura: 2160,
    altura: 3840,
    duracao,
    fps,
    formato,
  });

  it("emenda os trechos do Kling, que saem arredondados para o quadro", () => {
    // O caso real: 52,1s em 4 trechos de 13,025s; o Kling devolve 13,04s.
    expect(emendaDireta(Array(4).fill(trecho(13.04)), Array(4).fill(13.025))).toBe(true);
  });

  it("recodifica quando a diferença acumulada passa de 0,1s", () => {
    expect(emendaDireta(Array(4).fill(trecho(13.06)), Array(4).fill(13.025))).toBe(false);
  });

  it("recodifica a tomada curta gerada em câmera lenta", () => {
    expect(emendaDireta([trecho(6), trecho(3)], [6, 1.5])).toBe(false);
  });

  it("recodifica quando formato ou fps mudam entre trechos", () => {
    const hd = k4.replace("2160x3840", "1080x1920");
    expect(emendaDireta([trecho(5), trecho(5, hd)], [5, 5])).toBe(false);
    expect(emendaDireta([trecho(5), trecho(5, k4, 30)], [5, 5])).toBe(false);
    expect(emendaDireta([trecho(5, "")], [5])).toBe(false);
  });
});

describe("caixaEmPixels", () => {
  it("converte frações em pixels", () => {
    expect(
      caixaEmPixels({ x: 0.1, y: 0.2, w: 0.5, h: 0.1 }, 720, 1280),
    ).toEqual({ x: 72, y: 256, w: 360, h: 128 });
  });

  it("mantém 1px de margem dentro do quadro (exigência do delogo)", () => {
    const px = caixaEmPixels({ x: 0, y: 0, w: 1, h: 1 }, 720, 1280);
    expect(px).toEqual({ x: 1, y: 1, w: 718, h: 1278 });
  });
});

describe("quebrarLinhas", () => {
  it("quebra por palavra sem passar do limite", () => {
    const t = quebrarLinhas(
      "Quando o prazo é amanhã e você ainda não começou",
      24,
    );
    for (const l of t.split("\n")) expect(l.length).toBeLessThanOrEqual(24);
    expect(t.replace(/\n/g, " ")).toBe(
      "Quando o prazo é amanhã e você ainda não começou",
    );
  });

  it("respeita quebras de linha do usuário", () => {
    expect(quebrarLinhas("linha um\nlinha dois", 40)).toBe(
      "linha um\nlinha dois",
    );
  });
});
