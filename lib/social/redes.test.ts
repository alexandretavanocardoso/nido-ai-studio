import { describe, expect, it } from "vitest";
import { problemasDoPost } from "./redes";
import { dadosPorRede } from "./bundle";
import { bloqueioPublicar } from "@/lib/planos";

describe("regras de cada rede", () => {
  it("X: limite de 280; YouTube: só vídeo e com título; Instagram/TikTok precisam de mídia", () => {
    expect(problemasDoPost({ redes: ["TWITTER"], texto: "a".repeat(281), midiaTipo: null })[0]).toMatch(/280/);
    expect(problemasDoPost({ redes: ["YOUTUBE"], texto: "", titulo: "", midiaTipo: "imagem" }).join(" ")).toMatch(/só vídeo.*título/);
    expect(problemasDoPost({ redes: ["INSTAGRAM"], texto: "oi", midiaTipo: null })[0]).toMatch(/precisa de um vídeo/);
    expect(problemasDoPost({ redes: ["INSTAGRAM", "TIKTOK", "YOUTUBE"], texto: "oi", titulo: "t", midiaTipo: "video" })).toEqual([]);
    expect(problemasDoPost({ redes: ["LINKEDIN"], texto: "", midiaTipo: "imagem" })[0]).toMatch(/LinkedIn precisa de texto/);
  });
  it("monta o post por rede e sempre marca conteúdo de IA", () => {
    const d = dadosPorRede({ redes: ["INSTAGRAM", "TIKTOK", "YOUTUBE", "TWITTER", "LINKEDIN"], texto: "oi", titulo: "T", uploadId: "u1", midiaTipo: "video" }) as Record<string, Record<string, unknown>>;
    expect(d.INSTAGRAM).toMatchObject({ type: "REEL", uploadIds: ["u1"], isAiGenerated: true });
    expect(d.TIKTOK).toMatchObject({ type: "VIDEO", privacy: "PUBLIC_TO_EVERYONE", isAiGenerated: true });
    expect(d.YOUTUBE).toMatchObject({ type: "SHORT", text: "T", description: "oi", madeForKids: false, containsSyntheticMedia: true });
    expect(d.TWITTER).toMatchObject({ text: "oi", isAiGenerated: true });
    expect(d.LINKEDIN).toMatchObject({ text: "oi", privacy: "PUBLIC" });
    const img = dadosPorRede({ redes: ["INSTAGRAM", "TIKTOK"], texto: "", uploadId: "u", midiaTipo: "imagem" }) as Record<string, Record<string, unknown>>;
    expect([img.INSTAGRAM.type, img.TIKTOK.type]).toEqual(["POST", "IMAGE"]);
  });
  it("publicar a partir do Starter", () => {
    expect(bloqueioPublicar("gratis")).not.toBeNull();
    expect(bloqueioPublicar("starter")).toBeNull();
  });
});
