import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { emptyCharacter } from "@/lib/defaults";
import { inputFal } from "@/lib/ai/fal-imagem";
import { bloqueioPersona, bloqueioVoz, CREDITOS_TREINO, creditosFala, creditosImagem, PLANOS } from "@/lib/planos";
import { descricaoDaFicha, textoAmostra } from "@/lib/voz/elevenlabs";

vi.mock("@/lib/storage/s3", () => ({
  getObjectBuffer: vi.fn(async (_s3: unknown, key: string) => Buffer.from(`img:${key}`)),
}));
const { gerarGatilho, montarZipTreino } = await import("./server");

describe("palavra-gatilho", () => {
  it("usa o nome sem acento/espaço + sufixo, só [a-z0-9_]", () => {
    expect(gerarGatilho("Lila Serafina", 0.5)).toMatch(/^lilaserafina_nd[0-9a-z]{3}$/);
    expect(gerarGatilho("Zé Zen!", 0)).toBe("zezen_nd000");
    expect(gerarGatilho("", 0.1)).toMatch(/^persona_nd/);
  });
});

describe("ZIP de treino", () => {
  it("cada imagem vai com um .txt de legenda contendo o gatilho", async () => {
    const buf = await montarZipTreino({} as never, ["users/u/dataset/a.jpg", "users/u/dataset/b.jpg"], "lila_nd123");
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).sort()).toEqual(["img_001.jpg", "img_001.txt", "img_002.jpg", "img_002.txt"]);
    expect(await zip.file("img_002.txt")!.async("string")).toBe("a photo of lila_nd123");
    expect(await zip.file("img_001.jpg")!.async("string")).toBe("img:users/u/dataset/a.jpg");
  });
});

describe("geração com a persona Rápida (FLUX.1 + LoRA)", () => {
  const persona = { loraUrl: "https://s3/lora.safetensors", gatilho: "lila_nd123", base: "flux1" as const };
  it("sempre flux-lora (só texto), gatilho no prompt, ~1 MP, referências ignoradas", () => {
    const { endpoint, input } = inputFal({ modelo: "persona", tipo: "retrato", prompt: "na praia", imageUrls: ["u"], qualidade: "padrao", persona });
    expect(endpoint).toBe("fal-ai/flux-lora");
    expect(input.prompt).toBe("lila_nd123, na praia");
    expect(input.loras).toEqual([{ path: persona.loraUrl, scale: 1 }]);
    expect(input.image_urls).toBeUndefined();
    expect(input.image_size).toEqual({ width: 832, height: 1248 });
  });
});

describe("geração com a persona Pro (FLUX.2 + LoRA)", () => {
  const persona = { loraUrl: "https://s3/lora.safetensors", gatilho: "lila_nd123", base: "flux2" as const };
  it("sem referência: flux-2/lora, gatilho no início do prompt e o LoRA", () => {
    const { endpoint, input } = inputFal({ modelo: "persona", tipo: "retrato", prompt: "na praia", imageUrls: [], qualidade: "padrao", persona });
    expect(endpoint).toBe("fal-ai/flux-2/lora");
    expect(input.prompt).toBe("lila_nd123, na praia");
    expect(input.loras).toEqual([{ path: persona.loraUrl, scale: 1 }]);
  });
  it("com referência: flux-2/lora/edit", () => {
    expect(inputFal({ modelo: "persona", tipo: "retrato", prompt: "x", imageUrls: ["u"], qualidade: "padrao", persona }).endpoint).toBe(
      "fal-ai/flux-2/lora/edit"
    );
  });
  it("sem persona pronta, recusa", () => {
    expect(() => inputFal({ modelo: "persona", tipo: "retrato", prompt: "x", imageUrls: [], qualidade: "padrao" })).toThrow();
  });
});

describe("custos e planos", () => {
  it("treino, imagem com persona, falas", () => {
    expect(CREDITOS_TREINO).toEqual({ rapido: 250, pro: 650 });
    expect(creditosImagem("persona", "padrao")).toBe(5);
    expect(creditosFala(10)).toBe(3);
    expect(creditosFala(250)).toBe(9);
  });
  it("persona a partir do Creator; voz a partir do Starter", () => {
    expect(bloqueioPersona("starter")).not.toBeNull();
    expect(bloqueioPersona("creator")).toBeNull();
    // 1 treino Rápido grátis por mês só no Studio.
    expect([PLANOS.creator.treinosGratisMes, PLANOS.studio.treinosGratisMes]).toEqual([0, 1]);
    expect(bloqueioVoz("gratis")).not.toBeNull();
    expect(bloqueioVoz("starter")).toBeNull();
  });
});

describe("voz a partir da ficha", () => {
  it("descrição usa gênero, idade, timbre, ritmo e sotaque", () => {
    const c = emptyCharacter();
    c.identidade.genero = "feminino";
    c.identidade.idadeAparente = "28 anos";
    c.voz.vozTimbre = "rouco";
    c.voz.vozRitmo = "rápido";
    const d = descricaoDaFicha(c);
    expect(d).toContain("female");
    expect(d).toContain("28 anos");
    expect(d).toContain("rouco");
    expect(d).toContain("Brazilian Portuguese");
  });
  it("texto de amostra tem 100+ caracteres (exigência do Voice Design)", () => {
    const c = emptyCharacter();
    c.identidade.nome = "Lila";
    expect(textoAmostra(c).length).toBeGreaterThanOrEqual(100);
  });
});
