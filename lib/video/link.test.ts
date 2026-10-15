import { describe, expect, it } from "vitest";
import { detectarPlataforma, lerItem, linkLimpoDoYouTube } from "./link";

describe("linkLimpoDoYouTube", () => {
  it("tira playlist, Mix, tempo e rastreio, e mantém o vídeo", () => {
    expect(
      linkLimpoDoYouTube(
        "https://www.youtube.com/watch?v=pz6caqaqbfE&list=RDpz6caqaqbfE&start_radio=1",
      ),
    ).toBe("https://www.youtube.com/watch?v=pz6caqaqbfE");
    expect(linkLimpoDoYouTube("https://youtu.be/pz6caqaqbfE?si=abc&t=42")).toBe(
      "https://www.youtube.com/watch?v=pz6caqaqbfE",
    );
    expect(
      linkLimpoDoYouTube("https://music.youtube.com/watch?v=pz6caqaqbfE&feature=share"),
    ).toBe("https://www.youtube.com/watch?v=pz6caqaqbfE");
    expect(linkLimpoDoYouTube("https://m.youtube.com/shorts/-DuWGX8xbmQ?si=x")).toBe(
      "https://www.youtube.com/shorts/-DuWGX8xbmQ",
    );
  });
  it("sem id de vídeo, devolve como veio", () => {
    expect(linkLimpoDoYouTube("https://www.youtube.com/watch?list=RDx")).toBe(
      "https://www.youtube.com/watch?list=RDx",
    );
  });
});

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
    expect(
      detectarPlataforma("https://x.com/alguem/status/2108344428255686694"),
    ).toBe("x");
    expect(
      detectarPlataforma("https://twitter.com/alguem/status/123456789?s=20"),
    ).toBe("x");
  });
  it("recusa perfis, outros sites e protocolos estranhos", () => {
    expect(detectarPlataforma("https://www.instagram.com/perfil/")).toBeNull();
    expect(detectarPlataforma("https://example.com/pagina")).toBeNull();
    expect(detectarPlataforma("https://x.com/alguem")).toBeNull();
    expect(detectarPlataforma("ftp://x.com/a.mp4")).toBeNull();
    expect(detectarPlataforma("não é link")).toBeNull();
  });
});

describe("lerItem", () => {
  it("X: fica com o .mp4 de maior bitrate e tira o link curto do título", () => {
    const v = lerItem("x", {
      text: "olha isso https://t.co/9EHDz5fFbt",
      author: { userName: "alguem" },
      extendedEntities: {
        media: [
          {
            type: "video",
            media_url_https: "https://pbs.twimg.com/thumb.jpg",
            video_info: {
              duration_millis: 7894,
              variants: [
                { content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
                { bitrate: 832000, content_type: "video/mp4", url: "https://video.twimg.com/480.mp4" },
                { bitrate: 10368000, content_type: "video/mp4", url: "https://video.twimg.com/1080.mp4" },
              ],
            },
          },
        ],
      },
    });
    expect(v).toMatchObject({
      plataforma: "x",
      videoUrl: "https://video.twimg.com/1080.mp4",
      duracao: 7.894,
      titulo: "olha isso",
      autor: "alguem",
      thumb: "https://pbs.twimg.com/thumb.jpg",
    });
    // Post só com texto e link: não tem vídeo (nada de "procura genérica").
    expect(
      lerItem("x", { text: "sem vídeo", url: "https://x.com/a/status/1", entities: {} }),
    ).toBeNull();
  });

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

describe("YouTube com o arquivo guardado no Apify", () => {
  it("usa o arquivo guardado (já com áudio) e monta a capa pelo id", () => {
    const v = lerItem("youtube", {
      id: "-DuWGX8xbmQ",
      downloadedFileUrl:
        "https://api.apify.com/v2/key-value-stores/abc/records/v.mp4",
      // Links diretos do YouTube: presos ao IP do Apify, não servem daqui.
      videoOnlyUrl: "https://manifest.googlevideo.com/api/manifest/hls",
      audioOnlyUrl: "https://manifest.googlevideo.com/api/manifest/hls-a",
      durationSeconds: 38,
    });
    expect(v).toMatchObject({
      videoUrl: "https://api.apify.com/v2/key-value-stores/abc/records/v.mp4",
      audioUrl: null,
      duracao: 38,
      thumb: "https://i.ytimg.com/vi/-DuWGX8xbmQ/hqdefault.jpg",
    });
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

describe("Instagram com som separado", () => {
  it("lê o audioUrl do Reel (o videoUrl vem só com a imagem)", async () => {
    const { lerItem } = await import("./link");
    const v = lerItem("instagram", {
      videoUrl: "https://cdn.example/v.mp4",
      audioUrl: "https://cdn.example/a.mp4",
      videoDuration: 11,
      ownerUsername: "alguem",
    });
    expect(v?.audioUrl).toBe("https://cdn.example/a.mp4");
    expect(lerItem("instagram", { videoUrl: "https://cdn.example/v.mp4" })?.audioUrl).toBeNull();
  });
});
