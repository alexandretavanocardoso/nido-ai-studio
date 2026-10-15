import { describe, expect, it, vi } from "vitest";

const ia = vi.hoisted(() => ({ resposta: "", falha: false }));
vi.mock("@/lib/ai/anthropic", () => ({
  askClaude: async () => {
    if (ia.falha) throw new Error("sem créditos");
    return ia.resposta;
  },
}));

const decart = vi.hoisted(() => ({ status: "pending" as string, falha: false }));
vi.mock("@decartai/sdk", () => ({
  createDecartClient: () => ({
    queue: {
      status: async () => {
        if (decart.falha) throw new Error("rede");
        return { status: decart.status };
      },
    },
  }),
  models: { video: (m: string) => m, realtime: (m: string) => m },
}));

const voz = vi.hoisted(() => ({ pedacos: [] as number[], taxas: [] as number[], limpo: [] as boolean[] }));
vi.mock("@/lib/voz/elevenlabs", () => ({
  getEleven: () => ({}),
  pcmParaWav: (b: Buffer) => b,
  trocarVoz: async (_el: unknown, _voz: string, pcm: Buffer, taxa: number, limparFundo: boolean) => {
    voz.pedacos.push(pcm.length);
    voz.taxas.push(taxa);
    voz.limpo.push(limparFundo);
    // Devolve o pedaço marcado com o tamanho, para conferir a ordem.
    return Buffer.from(`[${pcm.length}]`);
  },
}));

import { cenaParaLucy } from "./cena";
import { consultarDecart, pedidoDaSombra } from "./decart";
import { ehSombraVideo, TAXA_VOZ_VIDEO, trocarVozDoAudio } from "./sombra-video";
import { CREDITOS_POR_MINUTO, creditosDoTempo, ehSessaoSombra } from "./tipos";
import {
  creditosSombraAoVivo,
  creditosSombraVideo,
  SOMBRA_VIDEO_DIRETO_MAX_SEGUNDOS,
  SOMBRA_VIDEO_MAX_SEGUNDOS,
} from "@/lib/planos";

describe("pedido do Lucy (Sombra)", () => {
  it("troca a pessoa primeiro e só depois o fundo e o item (com o fundo antes, o Lucy ignora)", () => {
    const p = pedidoDaSombra({ fundo: "a gamer bedroom with RGB lights", item: "over-ear headphones" });
    expect(p.indexOf("Replace the person in the video, including their clothes,")).toBe(0);
    expect(p).toContain("Change the background to a gamer bedroom with RGB lights.");
    expect(p.endsWith("The person is wearing over-ear headphones.")).toBe(true);
    expect(p.indexOf("Replace")).toBeLessThan(p.indexOf("Change the background"));
  });

  it("sem cenário, uma edição só: trocar a pessoa", () => {
    expect(pedidoDaSombra(null)).toBe(
      "Replace the person in the video, including their clothes, with the person from the reference image, keeping the same pose, head movement, facial expression and mouth movement.",
    );
  });

  it("cabe no limite do Lucy (~750 caracteres) mesmo com o cenário mais longo", () => {
    expect(pedidoDaSombra({ fundo: "x".repeat(300), item: "y".repeat(120) }).length).toBeLessThan(750);
  });
});

describe("cenário curto para o Lucy", () => {
  it("a IA devolve o fundo e, se pedido, o item na pessoa", async () => {
    ia.falha = false;
    ia.resposta = "1. A cozy gamer bedroom with purple RGB lights.\n2. over-ear gaming headphones.\n";
    expect(await cenaParaLucy("quarto gamer, com fone")).toEqual({
      fundo: "a cozy gamer bedroom with purple RGB lights",
      item: "over-ear gaming headphones",
    });
  });

  it("sem item, só o fundo; se a IA falhar, o texto como veio", async () => {
    ia.resposta = "A sunny beach at sunset";
    expect(await cenaParaLucy("praia")).toEqual({ fundo: "a sunny beach at sunset", item: null });
    ia.resposta = "RGB-lit studio";
    expect((await cenaParaLucy("estúdio")).fundo).toBe("RGB-lit studio");
    ia.falha = true;
    expect(await cenaParaLucy("na praia")).toEqual({ fundo: "na praia", item: null });
  });
});

describe("job da Decart (Sombra de vídeo gravado)", () => {
  it("traduz o estado da fila para o dos outros vídeos", async () => {
    process.env.DECART_API_KEY = "teste";
    decart.falha = false;
    decart.status = "pending";
    expect(await consultarDecart("j1")).toEqual({ estado: "na_fila" });
    decart.status = "processing";
    expect(await consultarDecart("j1")).toEqual({ estado: "processando" });
    decart.status = "completed";
    expect(await consultarDecart("j1")).toEqual({ estado: "concluido", videoUrl: "decart:j1" });
    decart.status = "failed";
    expect((await consultarDecart("j1")).estado).toBe("erro");
  });

  it("falha passageira na consulta não vira erro: tenta de novo na próxima", async () => {
    decart.falha = true;
    expect(await consultarDecart("j1")).toEqual({ estado: "processando" });
  });

  it("reconhece o job da Sombra de vídeo pelo input", () => {
    expect(ehSombraVideo({ origemDoJob: "sombra_video", origem: { key: "k" } })).toBe(true);
    expect(ehSombraVideo({ origemDoJob: "outro" })).toBe(false);
    expect(ehSombraVideo(null)).toBe(false);
  });
});

describe("voz trocada do vídeo gravado", () => {
  it("vai em pedaços de até 1 min, na ordem, em 24 kHz", async () => {
    voz.pedacos = [];
    voz.taxas = [];
    const umMinuto = 16_000 * 2 * 60;
    const pcm = Buffer.alloc(umMinuto * 4 + 1000);
    const saida = await trocarVozDoAudio("v1", pcm);
    expect(voz.pedacos).toEqual([umMinuto, umMinuto, umMinuto, umMinuto, 1000]);
    expect(saida.toString()).toBe(`[${umMinuto}][${umMinuto}][${umMinuto}][${umMinuto}][1000]`);
    expect(new Set(voz.taxas)).toEqual(new Set([TAXA_VOZ_VIDEO]));
    expect(TAXA_VOZ_VIDEO).toBe(24_000);
    expect(voz.limpo.every(Boolean)).toBe(true);
  });
});

describe("créditos da Sombra", () => {
  it("ao vivo: por minuto, mais caro que o avatar; o que sobrar volta pelo tempo usado", () => {
    expect(creditosSombraAoVivo(10)).toBe(10 * CREDITOS_POR_MINUTO.sombra);
    expect(CREDITOS_POR_MINUTO.sombra).toBeGreaterThan(CREDITOS_POR_MINUTO.avatar);
    expect(creditosDoTempo(61, CREDITOS_POR_MINUTO.sombra)).toBe(2 * CREDITOS_POR_MINUTO.sombra);
    expect(ehSessaoSombra("sombra-abc123")).toBe(true);
    expect(ehSessaoSombra("rs_abc")).toBe(false);
  });

  it("vídeo gravado: por segundo começado do trecho, até 12 h; até 3 min o app faz sozinho", () => {
    expect(creditosSombraVideo(4)).toBe(20);
    expect(creditosSombraVideo(4.2)).toBe(25);
    expect(SOMBRA_VIDEO_MAX_SEGUNDOS).toBe(12 * 3600);
    expect(SOMBRA_VIDEO_DIRETO_MAX_SEGUNDOS).toBe(180);
    expect(creditosSombraVideo(30 * 60)).toBe(9000); // 30 min de uma live de 2 h
  });
});
