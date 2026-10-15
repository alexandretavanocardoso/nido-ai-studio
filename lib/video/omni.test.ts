import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import {
  estadoLoteOmni,
  mensagemDoOmni,
  nomeDoArquivo,
  pedidoParaOmni,
  RECUSA_OMNI,
} from "./omni";

describe("pedido no formato do Omni", () => {
  it("o vídeo vira \"the input video\" e as imagens viram <IMAGE_REF_n>, contando de 0", () => {
    expect(
      pedidoParaOmni(
        "In @Video1, replace ONLY these people:\n- a → @Image1.\n- b → @Image2.\n@Image3 is a frame of @Video1.",
      ),
    ).toBe(
      "In the input video, replace ONLY these people:\n- a → <IMAGE_REF_0>.\n- b → <IMAGE_REF_1>.\n<IMAGE_REF_2> is a frame of the input video.",
    );
  });

  it("lê o nome do arquivo na URI do resultado", () => {
    expect(nomeDoArquivo("https://generativelanguage.googleapis.com/v1beta/files/abc123")).toBe("files/abc123");
    expect(nomeDoArquivo("https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media")).toBe(
      "files/abc123",
    );
    expect(nomeDoArquivo("gs://bucket/video.mp4")).toBeNull();
  });
});

/** Um cliente do Google de mentira: o estado de cada interação e de cada arquivo. */
function clienteFalso(
  interacoes: Record<string, unknown>,
  arquivos: Record<string, string> = {},
) {
  return {
    interactions: {
      get: vi.fn(async (id: string) => {
        const r = interacoes[id];
        if (r instanceof Error) throw r;
        return r;
      }),
    },
    files: {
      get: vi.fn(async ({ name }: { name: string }) => ({ name, state: arquivos[name] ?? "ACTIVE" })),
    },
  } as unknown as GoogleGenAI;
}

const seg = (requestId: string) => ({ requestId, inicio: 0, duracao: 5 });
const pronto = (uri: string) => ({
  status: "completed",
  output_video: { type: "video", uri, mime_type: "video/mp4" },
});

describe("andamento do lote no Omni", () => {
  it("na fila, processando (com o resultado ainda sendo salvo) e pronto", async () => {
    const uri = "https://generativelanguage.googleapis.com/v1beta/files/r1";
    expect(await estadoLoteOmni(clienteFalso({ a: { status: "queued" } }), [seg("a")])).toEqual({ estado: "na_fila" });
    expect(
      await estadoLoteOmni(
        clienteFalso({ a: pronto(uri), b: pronto(`${uri}x`) }, { "files/r1x": "PROCESSING" }),
        [seg("a"), seg("b")],
      ),
    ).toEqual({ estado: "processando", progresso: 0.5 });
    expect(
      await estadoLoteOmni(clienteFalso({ a: pronto(uri), b: pronto(`${uri}x`) }), [seg("a"), seg("b")]),
    ).toEqual({ estado: "concluido", urls: [`omni:${uri}`, `omni:${uri}x`] });
  });

  it("resultado no corpo da resposta (sem arquivo): a montagem pega pela interação", async () => {
    const r = await estadoLoteOmni(
      clienteFalso({ a: { status: "completed", output_video: { type: "video", data: "AAAA" } } }),
      [seg("a")],
    );
    expect(r).toEqual({ estado: "concluido", urls: ["omni:interacao:a"] });
  });

  it("recusa (pessoa reconhecível) ou fim sem vídeo derrubam o lote com a mensagem da recusa", async () => {
    const recusada = {
      status: "failed",
      steps: [{ type: "model_output", error: { message: "Editing videos of recognizable people is not supported." } }],
    };
    expect(await estadoLoteOmni(clienteFalso({ a: pronto("files/x"), b: recusada }), [seg("a"), seg("b")])).toEqual({
      estado: "erro",
      mensagem: RECUSA_OMNI,
    });
    expect(await estadoLoteOmni(clienteFalso({ a: { status: "completed" } }), [seg("a")])).toEqual({
      estado: "erro",
      mensagem: RECUSA_OMNI,
    });
  });

  it("falha de rede na consulta segue processando; interação que sumiu (404) é erro", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await estadoLoteOmni(clienteFalso({ a: new Error("fetch failed") }), [seg("a")])).toEqual({
      estado: "processando",
      progresso: 0,
    });
    const sumiu = Object.assign(new Error("not found"), { status: 404 });
    expect((await estadoLoteOmni(clienteFalso({ a: sumiu }), [seg("a")])).estado).toBe("erro");
  });

  it("bloqueio do filtro chega como 400 na consulta: é recusa, não espera para sempre", async () => {
    const barrado = Object.assign(
      new Error("400 Request blocked for an unspecified policy reason. Please modify your input and retry."),
      { status: 400 },
    );
    expect(await estadoLoteOmni(clienteFalso({ a: pronto("files/x"), b: barrado }), [seg("a"), seg("b")])).toEqual({
      estado: "erro",
      mensagem: RECUSA_OMNI,
    });
    // Limite de uso (429) na consulta é passageiro.
    const limite = Object.assign(new Error("quota"), { status: 429 });
    expect((await estadoLoteOmni(clienteFalso({ a: limite }), [seg("a")])).estado).toBe("processando");
  });
});

describe("mensagens de erro do Omni", () => {
  it("limite, chave, recusa e o resto", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const erro = (status: number, msg = "") => Object.assign(new Error(msg), { status });
    expect(mensagemDoOmni(erro(429))).toMatch(/Limite de uso do Gemini/);
    expect(mensagemDoOmni(erro(403))).toMatch(/GEMINI_API_KEY/);
    expect(mensagemDoOmni(erro(400, "Uploading images of certain recognizable people is not supported"))).toBe(RECUSA_OMNI);
    expect(mensagemDoOmni(erro(500))).toBe("Falha no Gemini Omni (HTTP 500).");
  });
});
