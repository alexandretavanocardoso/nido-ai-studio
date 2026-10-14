import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { tokenLiveKit } from "./livekit";
import { creditosDoTempo, segundosNoAr } from "./tipos";
import { pedidoLive } from "@/lib/prompts/live";

const cfg = { url: "wss://x.livekit.cloud", apiKey: "APIabc", apiSecret: "segredo" };

function ler(token: string) {
  const [h, c, a] = token.split(".");
  const esperada = createHmac("sha256", cfg.apiSecret).update(`${h}.${c}`).digest("base64url");
  return {
    cabecalho: JSON.parse(Buffer.from(h, "base64url").toString()),
    corpo: JSON.parse(Buffer.from(c, "base64url").toString()),
    assinaturaOk: a === esperada,
  };
}

describe("token do LiveKit", () => {
  it("assina em HS256 com a identidade em sub e as permissões da sala", () => {
    const t = ler(
      tokenLiveKit(cfg, {
        identidade: "runway-avatar-agent",
        sala: "live-1",
        publicar: true,
        tipo: "agent",
        atributos: { "lk.publish_on_behalf": "nido-1" },
        validadeSegundos: 600,
      }),
    );
    expect(t.assinaturaOk).toBe(true);
    expect(t.cabecalho.alg).toBe("HS256");
    expect(t.corpo.iss).toBe("APIabc");
    expect(t.corpo.sub).toBe("runway-avatar-agent");
    expect(t.corpo.kind).toBe("agent");
    expect(t.corpo.attributes).toEqual({ "lk.publish_on_behalf": "nido-1" });
    expect(t.corpo.video).toMatchObject({
      room: "live-1",
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });
    expect(t.corpo.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(590);
  });

  it("o palco só assiste e fica invisível", () => {
    const t = ler(
      tokenLiveKit(cfg, {
        identidade: "palco-1",
        sala: "live-1",
        publicar: false,
        oculto: true,
        validadeSegundos: 60,
      }),
    );
    expect(t.corpo.video).toMatchObject({ canPublish: false, canPublishData: false, hidden: true });
    expect(t.corpo.kind).toBeUndefined();
  });
});

describe("tempo e créditos da live", () => {
  const agora = 1_000_000;
  it("soma as sessões: a duração do Runway quando existe, senão do início ao fim (ou até agora)", () => {
    expect(
      segundosNoAr(
        [
          { id: "a", inicio: agora - 600_000, fim: agora - 500_000, segundos: 90 },
          { id: "b", inicio: agora - 300_000, fim: agora - 240_000 },
          { id: "c", inicio: agora - 30_000 },
        ],
        agora,
        3600,
      ),
    ).toBe(90 + 60 + 30);
  });

  it("sessão que falhou não conta, e nunca passa da duração cobrada", () => {
    expect(segundosNoAr([{ id: "a", inicio: 0, fim: agora, segundos: 0 }], agora, 300)).toBe(0);
    expect(segundosNoAr([{ id: "a", inicio: 0 }], agora, 300)).toBe(300);
  });

  it("minuto começado conta inteiro", () => {
    expect(creditosDoTempo(0)).toBe(0);
    expect(creditosDoTempo(1)).toBe(35);
    expect(creditosDoTempo(60)).toBe(35);
    expect(creditosDoTempo(61)).toBe(70);
  });
});

describe("pedido da resposta ao vivo", () => {
  it("leva as trocas anteriores e quem mandou a mensagem", () => {
    const p = pedidoLive({ autor: "ana", texto: "qual seu filme favorito?" }, [
      { autor: "bia", texto: "oi!", resposta: "Oi, Bia!" },
    ]);
    expect(p).toContain("bia: oi!");
    expect(p).toContain("Você respondeu: Oi, Bia!");
    expect(p).toContain("de ana:");
    expect(p.trim().endsWith("Responda agora, ao vivo.")).toBe(true);
  });
});
