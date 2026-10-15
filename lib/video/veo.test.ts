import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buscarResultado,
  estadoDaOperacao,
  mensagemDeErroVeo,
  RECUSA_VEO,
  veoPassageiro,
} from "./veo";

const comStatus = (status: number, msg = "erro") =>
  Object.assign(new Error(msg), { status });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("andamento do Veo", () => {
  it("segue processando até a operação terminar", () => {
    expect(estadoDaOperacao({ done: false })).toEqual({ estado: "processando" });
    expect(estadoDaOperacao({})).toEqual({ estado: "processando" });
  });

  it("pronto: o vídeo vira veo:<uri> (só baixa com a chave)", () => {
    const uri = "https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media";
    expect(
      estadoDaOperacao({ done: true, response: { generatedVideos: [{ video: { uri } }] } }),
    ).toEqual({ estado: "concluido", videoUrl: `veo:${uri}` });
  });

  it("barrado pelo filtro: termina sem vídeo e vira recusa", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      estadoDaOperacao({
        done: true,
        response: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ["filtered"] },
      }),
    ).toEqual({ estado: "erro", mensagem: RECUSA_VEO });
  });

  it("erro da operação: recusa quando é política; senão, falha genérica", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      estadoDaOperacao({ done: true, error: { message: "Blocked by safety policy" } }),
    ).toEqual({ estado: "erro", mensagem: RECUSA_VEO });
    expect(estadoDaOperacao({ done: true, error: { message: "internal" } })).toEqual({
      estado: "erro",
      mensagem: "O Veo não conseguiu gerar o vídeo.",
    });
  });
});

describe("download do resultado", () => {
  it("veo:<uri> vai com a chave; as outras URLs vão como vieram", async () => {
    vi.stubEnv("GEMINI_API_KEY", "chave-teste");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await buscarResultado("veo:https://g.test/files/a:download?alt=media");
    expect(fetch).toHaveBeenLastCalledWith("https://g.test/files/a:download?alt=media", {
      headers: { "x-goog-api-key": "chave-teste" },
    });
    await buscarResultado("https://fal.test/video.mp4");
    expect(fetch).toHaveBeenLastCalledWith("https://fal.test/video.mp4");
  });
});

describe("erros do Veo", () => {
  it("limite e Google fora do ar são passageiros; recusa não", () => {
    expect(veoPassageiro(comStatus(429))).toBe(true);
    expect(veoPassageiro(comStatus(503))).toBe(true);
    expect(veoPassageiro(new Error("fetch failed"))).toBe(true);
    expect(veoPassageiro(comStatus(400))).toBe(false);
    expect(veoPassageiro(comStatus(403))).toBe(false);
  });

  it("mensagem para a tela conforme o erro", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mensagemDeErroVeo(comStatus(429))).toBe(
      "Limite de uso do Gemini atingido. Tente de novo em alguns minutos.",
    );
    expect(mensagemDeErroVeo(comStatus(403))).toMatch(/GEMINI_API_KEY/);
    expect(mensagemDeErroVeo(comStatus(400, "Image violates our safety policy"))).toBe(RECUSA_VEO);
    expect(mensagemDeErroVeo(comStatus(400))).toBe("O Google recusou o pedido do vídeo.");
    expect(mensagemDeErroVeo(comStatus(500))).toBe("Falha no Veo (HTTP 500).");
  });
});
