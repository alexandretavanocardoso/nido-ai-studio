import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { FalClient } from "@fal-ai/client";
import { fracaoTransparente, personagemSemFundo } from "./troca";
import {
  enviarCriacaoWanReferencia,
  promptCriacaoWan,
  WAN_REFERENCIA,
} from "./wan";

describe("Criar vídeo no Wan 3.0 por referência", () => {
  it("o texto põe a pessoa da imagem na cena desde o primeiro quadro, sem o fundo branco", () => {
    const p = promptCriacaoWan("  luta numa floresta escura  ", true);
    expect(p).toMatch(/^The person from Image 1 \(Image 2 is a close-up/);
    expect(p).toMatch(/from the very first frame/);
    expect(p).toMatch(/never show that white background/);
    expect(p.endsWith("Scene: luta numa floresta escura")).toBe(true);
    expect(promptCriacaoWan("cena", false)).not.toMatch(/Image 2/);
  });

  it("texto longo é cortado no fim da cena, nunca nas instruções", () => {
    const p = promptCriacaoWan("x".repeat(2000), true);
    expect(p.length).toBe(1000);
    expect(p).toMatch(/^The person from Image 1/);
  });

  it("pede reference-to-video com a figura e o rosto, sem primeiro quadro", async () => {
    const submit = vi.fn(async () => ({ request_id: "req-1" }));
    const fal = { queue: { submit } } as unknown as FalClient;
    const id = await enviarCriacaoWanReferencia(fal, {
      jobId: "job-1",
      figuraUrl: "https://fal/figura.png",
      rostoUrl: "https://fal/rosto.png",
      promptText: "na floresta",
      vertical: true,
      duracao: 10,
      audio: false,
    });
    expect(id).toBe("req-1");
    const [endpoint, opcoes] = submit.mock.calls[0] as unknown as [
      string,
      { input: Record<string, unknown> },
    ];
    expect(endpoint).toBe(WAN_REFERENCIA);
    expect(opcoes.input).toMatchObject({
      reference_image_urls: ["https://fal/figura.png", "https://fal/rosto.png"],
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: 10,
      audio: false,
    });
    expect(opcoes.input).not.toHaveProperty("start_image_url");
  });

  it("sem close do rosto, vai só a figura", async () => {
    const submit = vi.fn(async () => ({ request_id: "req-2" }));
    const fal = { queue: { submit } } as unknown as FalClient;
    await enviarCriacaoWanReferencia(fal, {
      jobId: "job-2",
      figuraUrl: "https://fal/figura.png",
      rostoUrl: null,
      promptText: "na praia",
      vertical: false,
      duracao: 15,
      audio: true,
    });
    const [, opcoes] = submit.mock.calls[0] as unknown as [
      string,
      { input: Record<string, unknown> },
    ];
    expect(opcoes.input).toMatchObject({
      reference_image_urls: ["https://fal/figura.png"],
      aspect_ratio: "16:9",
    });
  });
});

/** Figura escura em pé, no meio de um fundo transparente (o que o recorte devolve). */
const recorteTransparente = () =>
  sharp({
    create: {
      width: 600,
      height: 1000,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: 300,
            height: 900,
            channels: 4,
            background: { r: 64, g: 32, b: 32, alpha: 1 },
          },
        },
        left: 150,
        top: 50,
      },
    ])
    .png()
    .toBuffer();

/** O "recorte" que não tirou nada: a foto inteira, opaca. */
const semRecorte = () =>
  sharp({
    create: { width: 600, height: 1000, channels: 3, background: "#b8b8b8" },
  })
    .png()
    .toBuffer();

/** fal falso: guarda os uploads e devolve o recorte pedido. */
function falFalso(recorte: () => Promise<Buffer> | Buffer, falha?: Error) {
  let n = 0;
  const fal = {
    storage: { upload: vi.fn(async () => `https://fal/arquivo-${++n}.png`) },
    subscribe: vi.fn(async () => {
      if (falha) throw falha;
      return { data: { image: { url: "https://fal/recorte.png" } } };
    }),
  } as unknown as FalClient;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(await recorte()))),
  );
  return fal;
}

describe("recorte do personagem no modo estrito (Criar vídeo)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mede a área transparente do recorte", async () => {
    expect(await fracaoTransparente(await recorteTransparente())).toBeCloseTo(
      0.55,
      2,
    );
    expect(await fracaoTransparente(await semRecorte())).toBe(0);
  });

  it("com o fundo tirado, devolve a figura sobre branco e o close do rosto", async () => {
    const fal = falFalso(recorteTransparente);
    const r = await personagemSemFundo(fal, await semRecorte(), true, true);
    // 1º upload: a original (para o recorte); depois a figura e o rosto.
    expect(r.url).not.toBe("https://fal/arquivo-1.png");
    expect(r.rostoUrl).not.toBeNull();
  });

  it("recorte que não tirou fundo nenhum: recusa no estrito", async () => {
    const fal = falFalso(semRecorte);
    await expect(
      personagemSemFundo(fal, await semRecorte(), true, true),
    ).rejects.toThrow(/não tirou o fundo/);
  });

  it("recorte que falha: o estrito lança, o normal segue com a original", async () => {
    const erro = new Error("fal fora do ar");
    await expect(
      personagemSemFundo(falFalso(semRecorte, erro), await semRecorte(), true, true),
    ).rejects.toThrow("fal fora do ar");
    const normal = await personagemSemFundo(
      falFalso(semRecorte, erro),
      await semRecorte(),
      true,
    );
    expect(normal).toEqual({ url: "https://fal/arquivo-1.png", rostoUrl: null });
  });
});
