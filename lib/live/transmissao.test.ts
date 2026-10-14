import { afterEach, describe, expect, it, vi } from "vitest";
import { promptPersonaAvulsa } from "@/lib/prompts/live";
import {
  destinosValidos,
  estadoDaTransmissao,
  iniciarTransmissao,
} from "./transmissao";
import { urlDoDestino } from "./tipos";

const cfg = { url: "wss://x.livekit.cloud", apiKey: "APIabc", apiSecret: "segredo" };

describe("destinos da transmissão", () => {
  it("monta a URL com a chave e aceita rtmp e rtmps", () => {
    expect(urlDoDestino({ servidor: "rtmp://a.rtmp.youtube.com/live2/", chave: " abc-123 " })).toBe(
      "rtmp://a.rtmp.youtube.com/live2/abc-123",
    );
    expect(
      destinosValidos([
        { rede: "youtube", servidor: "rtmp://a.rtmp.youtube.com/live2", chave: "k1" },
        { rede: "kick", servidor: "rtmps://x.global-contribute.live-video.net/app", chave: "k2" },
      ]),
    ).toBeNull();
  });

  it("recusa rede repetida, servidor sem rtmp e chave vazia", () => {
    expect(destinosValidos([])).toBe("Escolha pelo menos uma rede.");
    expect(
      destinosValidos([
        { rede: "twitch", servidor: "rtmp://live.twitch.tv/app", chave: "a" },
        { rede: "twitch", servidor: "rtmp://live.twitch.tv/app", chave: "b" },
      ]),
    ).toMatch(/duas vezes/);
    expect(destinosValidos([{ rede: "tiktok", servidor: "https://tiktok.com", chave: "a" }])).toMatch(
      /Servidor do TikTok/,
    );
    expect(destinosValidos([{ rede: "kick", servidor: "rtmps://k/app", chave: "" }])).toMatch(/chave/);
  });
});

describe("transmissão pelo LiveKit", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("abre um envio deitado e outro em pé (TikTok), com o avatar e o áudio da sala", async () => {
    const pedidos: Array<{ url: string; corpo: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        pedidos.push({ url, corpo: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ egress_id: `EG_${pedidos.length}` }));
      }),
    );
    const t = await iniciarTransmissao(cfg, "live-1", [
      { rede: "youtube", servidor: "rtmp://yt/live2", chave: "y" },
      { rede: "tiktok", servidor: "rtmp://tt/game", chave: "t" },
      { rede: "twitch", servidor: "rtmp://tw/app", chave: "w" },
    ]);
    expect(pedidos.map((p) => p.url)).toEqual([
      "https://x.livekit.cloud/twirp/livekit.Egress/StartEgress",
      "https://x.livekit.cloud/twirp/livekit.Egress/StartEgress",
    ]);
    expect(pedidos[0].corpo).toMatchObject({
      room_name: "live-1",
      media: { participant_video: { identity: "runway-avatar-agent" }, audio: { capture_all: true } },
      preset: "H264_720P_30",
      outputs: [{ stream: { protocol: "RTMP", urls: ["rtmp://yt/live2/y", "rtmp://tw/app/w"] } }],
    });
    expect(pedidos[1].corpo).toMatchObject({
      preset: "PORTRAIT_H264_720P_30",
      outputs: [{ stream: { urls: ["rtmp://tt/game/t"] } }],
    });
    expect(t.envios).toEqual([
      { id: "EG_1", redes: ["youtube", "twitch"], vertical: false },
      { id: "EG_2", redes: ["tiktok"], vertical: true },
    ]);
  });

  it("se o segundo envio falha, para o primeiro", async () => {
    const metodos: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const metodo = url.split("/").pop()!;
        metodos.push(metodo);
        if (metodo === "StartEgress" && metodos.length === 2)
          return new Response(JSON.stringify({ msg: "chave inválida" }), { status: 400 });
        return new Response(JSON.stringify({ egress_id: "EG_1" }));
      }),
    );
    await expect(
      iniciarTransmissao(cfg, "live-1", [
        { rede: "youtube", servidor: "rtmp://yt/live2", chave: "y" },
        { rede: "tiktok", servidor: "rtmp://tt/game", chave: "t" },
      ]),
    ).rejects.toThrow(/chave inválida/);
    expect(metodos).toEqual(["StartEgress", "StartEgress", "StopEgress"]);
  });

  it("lê o estado de cada rede: ativa, falhou com o motivo, e terminou quando some da lista", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                egress_id: "EG_1",
                status: "EGRESS_ACTIVE",
                stream_results: [{ status: "ACTIVE" }, { status: "FAILED", error: "conexão recusada" }],
              },
            ],
          }),
        ),
      ),
    );
    const estados = await estadoDaTransmissao(cfg, "live-1", {
      inicio: 0,
      envios: [
        { id: "EG_1", redes: ["youtube", "kick"], vertical: false },
        { id: "EG_2", redes: ["tiktok"], vertical: true },
      ],
    });
    expect(estados).toEqual([
      { rede: "youtube", estado: "ativa" },
      { rede: "kick", estado: "falhou", erro: "conexão recusada" },
      { rede: "tiktok", estado: "terminou" },
    ]);
  });
});

describe("live sem personagem", () => {
  it("a descrição escrita vira quem fala, com a regra de transparência", () => {
    const p = promptPersonaAvulsa({ nome: "Caio", descricao: "Barista, fala com humor." });
    expect(p).toContain("Você é Caio.");
    expect(p).toContain("Barista, fala com humor.");
    expect(p).toMatch(/persona virtual feita com IA/);
  });
});
