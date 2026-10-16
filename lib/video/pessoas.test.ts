import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { descreverPessoasNaFoto } from "./pessoas";

const resposta = (descricao: string) => ({
  text: JSON.stringify({ kind: "person", description: descricao }),
});

describe("descrição de quem foi marcado", () => {
  let foto: Buffer;
  const chave = process.env.GEMINI_API_KEY;
  beforeAll(async () => {
    process.env.GEMINI_API_KEY = "teste";
    foto = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer();
  });
  afterAll(() => {
    process.env.GEMINI_API_KEY = chave;
  });
  // Com chaves: devolvendo a função, o vitest a chamaria como limpeza depois do teste.
  beforeEach(() => {
    generateContent.mockReset();
  });

  it("uma falha do Gemini não vira descrição por posição: tenta de novo", async () => {
    generateContent
      .mockRejectedValueOnce(new Error("503 overloaded"))
      .mockResolvedValueOnce(resposta("the man with half-black, half-white hair"));
    const [alvo] = await descreverPessoasNaFoto(foto, [{ x: 0.4, y: 0.45 }]);
    expect(alvo.descricao).toBe("the man with half-black, half-white hair");
    expect(generateContent).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("resposta sem descrição também tenta de novo", async () => {
    generateContent
      .mockResolvedValueOnce({ text: "não sei" })
      .mockResolvedValueOnce(resposta("the woman in a red dress"));
    const [alvo] = await descreverPessoasNaFoto(foto, [{ x: 0.5, y: 0.5 }]);
    expect(alvo.descricao).toBe("the woman in a red dress");
  }, 15_000);

  it("se todas as tentativas falharem, sobra a posição", async () => {
    generateContent.mockRejectedValue(new Error("503 overloaded"));
    const [alvo] = await descreverPessoasNaFoto(foto, [{ x: 0.4, y: 0.45 }]);
    expect(alvo).toEqual({
      descricao: "the person in the center of the frame (middle)",
      tipo: "pessoa",
    });
    expect(generateContent).toHaveBeenCalledTimes(3);
  }, 15_000);
});
