import { describe, expect, it } from "vitest";
import { custoAnaliseVideo, estimativaMotion, fpsDaAnalise, maxTokensMotion } from "@/worker/motion/modelos";
import { pedidoAnaliseReferencia, pedidoMotion } from "@/worker/motion/prompt";
import { batidasDoEnvelope, cortesDoShowinfo, temposDosQuadros } from "@/worker/motion/referencia-tempos";
import { duracaoDaReferencia, formatoMaisProximo, type InputMotion } from "@/worker/motion/tipos";

describe("motion a partir de um vídeo: tempos da referência", () => {
  it("trocas de cena saem do showinfo, sem as coladas nem as das pontas", () => {
    const saida = [
      "[Parsed_showinfo_2 @ 0x1] n:   0 pts:   1500 pts_time:0.1 duration: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   1 pts:  31500 pts_time:2.1 duration: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   2 pts:  33000 pts_time:2.2 duration: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   3 pts:  90000 pts_time:6.004 duration: 1",
      "[Parsed_showinfo_2 @ 0x1] n:   4 pts: 148500 pts_time:9.9 duration: 1",
    ].join("\n");
    expect(cortesDoShowinfo(saida, 10)).toEqual([2.1, 6]);
  });

  it("batidas: os picos de volume, com 0,2 s de folga entre eles", () => {
    const fps = 50;
    const envelope = Array.from({ length: fps * 4 }, (_, i) => (i % 25 === 0 && i > 0 ? 9000 : 300));
    const batidas = batidasDoEnvelope(envelope, fps);
    expect(batidas).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(batidasDoEnvelope(Array(200).fill(300), fps)).toEqual([]);
  });

  it("quadros: o meio de cada cena; com poucas cenas, espalhados; até o máximo", () => {
    expect(temposDosQuadros(12, [4, 8], 10)).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11]);
    const muitas = temposDosQuadros(60, Array.from({ length: 40 }, (_, i) => (i + 1) * 1.45), 10);
    expect(muitas).toHaveLength(10);
    expect(muitas).toEqual([...muitas].sort((a, b) => a - b));
  });

  it("formato e duração seguem o vídeo", () => {
    expect(formatoMaisProximo(1080, 1920)).toBe("9:16");
    expect(formatoMaisProximo(1920, 1080)).toBe("16:9");
    expect(formatoMaisProximo(1080, 1350)).toBe("1:1");
    expect(duracaoDaReferencia(23.4)).toBe(23);
    expect(duracaoDaReferencia(60.6)).toBe(60);
    expect(duracaoDaReferencia(1.2)).toBe(3);
  });

  it("custo: assistir ao vídeo entra na estimativa (mais quadros por segundo nos curtos)", () => {
    expect(fpsDaAnalise(10)).toBe(5);
    expect(fpsDaAnalise(60)).toBe(2);
    const sem = estimativaMotion("claude-opus-5-5", "high", 2);
    const com = estimativaMotion("claude-opus-5-5", "high", 2, 30);
    expect(com).toBeGreaterThan(sem + custoAnaliseVideo(30) - 0.0001);
    expect(custoAnaliseVideo(60)).toBeLessThan(0.2);
  });
});

describe("motion a partir de um vídeo: pedido ao modelo", () => {
  const input: InputMotion = {
    brief: "",
    formato: "9:16",
    duracao: 12,
    assets: [],
    referencia: {
      key: "users/u/videos/r.mp4",
      duracao: 12.3,
      largura: 1080,
      altura: 1920,
      origem: "link",
      usarAudio: true,
      analise: "SHOT 1 (0.0–4.0): big yellow headline slams in.",
      cortes: [4, 8],
      batidas: [0.5, 1],
    },
  };

  it("sem material: recria o vídeo, com os quadros só para olhar e a trilha nas batidas", () => {
    const partes = pedidoMotion(input, "video", [], undefined, [{ t: 2, base64: "AAAA" }]);
    const texto = partes.map((p) => (p.tipo === "texto" ? p.texto : "[img]")).join("\n");
    expect(texto).toContain("REFERENCE VIDEO — RECREATE THIS EDIT");
    expect(texto).toContain("recreate the reference as faithfully as you can");
    expect(texto).toContain("They are NOT assets");
    expect(texto).toContain("soundtrack will play under your video");
    expect(texto).toContain("Scene changes measured in the reference (s): 4.0, 8.0");
    expect(texto).toContain("SHOT 1 (0.0–4.0)");
    expect(partes.at(-1)).toMatchObject({ tipo: "imagem", base64: "AAAA" });
  });

  it("com pedido ou material: troca o conteúdo e mantém o ritmo; os assets vêm antes da referência", () => {
    const imagens = [{ asset: { id: "a1", key: "k", papel: "produto" as const }, mime: "image/jpeg" as const, base64: "BBBB" }];
    const partes = pedidoMotion({ ...input, brief: "Lançamento da caneca Nido" }, "video", imagens);
    const texto = partes.map((p) => (p.tipo === "texto" ? p.texto : "[img]")).join("\n");
    expect(texto).toContain("replace the reference's subject");
    expect(texto.indexOf("asset://a1")).toBeLessThan(texto.indexOf("REFERENCE VIDEO"));
  });

  it("vídeo filmado: conta a história em motion, sem desenhar pessoas nem cenário", () => {
    const filmado = { ...input, referencia: { ...input.referencia!, estilo: "filmado" as const } };
    const textoDe = (i: InputMotion) =>
      pedidoMotion(i, "video", [])
        .map((p) => (p.tipo === "texto" ? p.texto : ""))
        .join("\n");
    const texto = textoDe(filmado);
    expect(texto).toContain("The reference is LIVE FOOTAGE");
    expect(texto).toContain("Do NOT draw the people");
    expect(texto).toContain("Keep the document compact");
    // Motion graphics: copia o design, sem a regra do filmado.
    expect(textoDe(input)).not.toContain("LIVE FOOTAGE");
  });

  it("com referência, mais folga de resposta (e a estimativa conta com isso)", () => {
    expect(maxTokensMotion("high")).toBe(64_000);
    expect(maxTokensMotion("high", true)).toBe(128_000);
    expect(estimativaMotion("claude-opus-5-5", "high", 2, 20)).toBeGreaterThan(
      estimativaMotion("claude-opus-5-5", "high", 12) + custoAnaliseVideo(20),
    );
  });

  it("o pedido ao Gemini traz os tempos medidos", () => {
    const p = pedidoAnaliseReferencia({ duracao: 12.3, cortes: [4, 8], batidas: [0.5], temAudio: true });
    expect(p).toContain("duration 12.3s");
    expect(p).toContain("Scene changes detected at (s): 4.0, 8.0");
    expect(p).toContain("SHOT BY SHOT");
    expect(p).toContain("approximate BPM");
    expect(p).toContain("KIND: motion graphics | KIND: live footage | KIND: mixed");
    // Vídeo mudo: o Gemini não pode inventar trilha.
    const mudo = pedidoAnaliseReferencia({ duracao: 10, cortes: [], batidas: [], temAudio: false });
    expect(mudo).toContain("NO audio track");
    expect(mudo).not.toContain("approximate BPM");
  });
});
