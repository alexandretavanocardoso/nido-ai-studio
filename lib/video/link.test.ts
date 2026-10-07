import { describe, expect, it } from "vitest";
import { detectarPlataforma, lerItem } from "./link";

describe("detectarPlataforma", () => {
  it("reconhece redes e arquivo direto", () => {
    expect(detectarPlataforma("https://www.tiktok.com/@x/video/123")).toBe(
      "tiktok",
    );
    expect(detectarPlataforma("https://vm.tiktok.com/ZMabc/")).toBe("tiktok");
    expect(detectarPlataforma("https://www.instagram.com/reel/Cxyz/")).toBe(
      "instagram",
    );
    expect(detectarPlataforma("https://instagram.com/p/Cxyz/")).toBe(
      "instagram",
    );
    expect(detectarPlataforma("https://www.youtube.com/shorts/abc")).toBe(
      "youtube",
    );
    expect(detectarPlataforma("https://youtu.be/abc")).toBe("youtube");
    expect(detectarPlataforma("https://cdn.site.com/a/b.mp4")).toBe("direto");
  });
  it("recusa perfis, outros sites e protocolos estranhos", () => {
    expect(detectarPlataforma("https://www.instagram.com/perfil/")).toBeNull();
    expect(detectarPlataforma("https://example.com/pagina")).toBeNull();
    expect(detectarPlataforma("ftp://x.com/a.mp4")).toBeNull();
    expect(detectarPlataforma("não é link")).toBeNull();
  });
});

describe("lerItem", () => {
  it("TikTok: mediaUrls + videoMeta", () => {
    const v = lerItem("tiktok", {
      text: "dança",
      mediaUrls: ["https://api.apify.com/v2/key-value-stores/k/records/v.mp4"],
      videoMeta: { duration: 12, coverUrl: "https://c/x.jpg" },
      authorMeta: { name: "fulana" },
    });
    expect(v).toMatchObject({
      videoUrl: expect.stringContaining("apify"),
      duracao: 12,
      autor: "fulana",
      titulo: "dança",
    });
  });
  it("Instagram e YouTube Shorts", () => {
    expect(
      lerItem("instagram", {
        videoUrl: "https://ig/v.mp4",
        videoDuration: 8.5,
        ownerUsername: "a",
      }),
    ).toMatchObject({
      videoUrl: "https://ig/v.mp4",
      duracao: 8.5,
      autor: "a",
    });
    expect(
      lerItem("youtube", {
        bestDownloadUrl: "https://yt/v.mp4",
        durationSeconds: 30,
        title: "t",
      }),
    ).toMatchObject({
      videoUrl: "https://yt/v.mp4",
      duracao: 30,
    });
  });
  it("actor diferente: acha o campo com cara de vídeo; sem vídeo → null", () => {
    expect(
      lerItem("tiktok", { foo: 1, downloadLink: "https://x/y" })?.videoUrl,
    ).toBe("https://x/y");
    expect(
      lerItem("instagram", { displayUrl: "https://ig/foto.jpg" }),
    ).toBeNull();
  });
});

describe("YouTube com áudio separado", () => {
  it("pega o áudio só quando o melhor formato não tem som", () => {
    const base = {
      bestDownloadUrl: "https://yt/v",
      audioDownloadUrl: "https://yt/a",
      durationSeconds: 25,
    };
    expect(
      lerItem("youtube", { ...base, bestFormat: { audioCodec: null } })
        ?.audioUrl,
    ).toBe("https://yt/a");
    expect(
      lerItem("youtube", { ...base, bestFormat: { audioCodec: "mp4a.40.2" } })
        ?.audioUrl,
    ).toBeNull();
  });
});
