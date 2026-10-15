import { describe, expect, it, vi } from "vitest";
import type { GoogleGenAI } from "@google/genai";

// Os modelos são lidos quando o módulo carrega.
vi.hoisted(() => {
  process.env.GEMINI_TEXT_MODEL = "visao";
  process.env.GEMINI_TEXT_MODEL_PRO = "juiz";
});

import { perguntarAoJuiz } from "./ancora";

type Pedido = { model: string; contents: unknown; config?: { abortSignal?: AbortSignal } };

/** Cliente falso: cada modelo responde (ou falha) como pedido. */
function cliente(respostas: Record<string, () => Promise<{ text?: string }>>) {
  const generateContent = vi.fn((p: Pedido) => respostas[p.model]());
  const ai = { models: { generateContent } } as unknown as GoogleGenAI;
  const modelos = () => generateContent.mock.calls.map(([p]) => p.model);
  return { ai, generateContent, modelos };
}

const contents = [{ role: "user", parts: [{ text: "qual quadro?" }] }];

describe("perguntarAoJuiz: o modelo forte decide, o de visão é a reserva", () => {
  it("o forte responde: o de visão nem é chamado, e o pedido leva limite de tempo", async () => {
    const c = cliente({ juiz: async () => ({ text: '{"frame": 2}' }) });
    expect(await perguntarAoJuiz(c.ai, { contents })).toBe('{"frame": 2}');
    expect(c.modelos()).toEqual(["juiz"]);
    expect(c.generateContent.mock.calls[0][0].config?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("o forte falha (ou estoura o tempo): a mesma pergunta vai ao de visão", async () => {
    const c = cliente({
      juiz: async () => {
        throw new Error("This operation was aborted");
      },
      visao: async () => ({ text: '{"frame": 1}' }),
    });
    expect(await perguntarAoJuiz(c.ai, { contents })).toBe('{"frame": 1}');
    expect(c.modelos()).toEqual(["juiz", "visao"]);
    expect(c.generateContent.mock.calls[1][0].contents).toBe(contents);
  });

  it("o forte responde vazio: vai ao de visão", async () => {
    const c = cliente({
      juiz: async () => ({ text: "  " }),
      visao: async () => ({ text: '{"frame": 3}' }),
    });
    expect(await perguntarAoJuiz(c.ai, { contents })).toBe('{"frame": 3}');
    expect(c.modelos()).toEqual(["juiz", "visao"]);
  });

  it("prazo perto: pergunta direto ao de visão", async () => {
    const c = cliente({ visao: async () => ({ text: "ok" }) });
    expect(await perguntarAoJuiz(c.ai, { contents, prazo: Date.now() + 2_000 })).toBe("ok");
    expect(c.modelos()).toEqual(["visao"]);
  });

  it("o forte igual ao de visão desliga: uma pergunta só", async () => {
    vi.resetModules();
    vi.stubEnv("GEMINI_TEXT_MODEL_PRO", "visao");
    try {
      const { perguntarAoJuiz: perguntar } = await import("./ancora");
      const c = cliente({ visao: async () => ({ text: "ok" }) });
      expect(await perguntar(c.ai, { contents })).toBe("ok");
      expect(c.modelos()).toEqual(["visao"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
