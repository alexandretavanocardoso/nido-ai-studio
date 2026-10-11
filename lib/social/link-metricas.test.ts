import { describe, expect, it } from "vitest";
import {
  detectarRedeDoLink,
  lerAutorDoItem,
  lerMetricasDoItem,
  lerPaginaLinkedIn,
  limparLink,
} from "./link-metricas";

describe("detectarRedeDoLink", () => {
  it("reconhece o link de post de cada rede", () => {
    expect(detectarRedeDoLink("https://www.tiktok.com/@a/video/123")).toBe("TIKTOK");
    expect(detectarRedeDoLink("https://vm.tiktok.com/ZM123/")).toBe("TIKTOK");
    expect(detectarRedeDoLink("https://www.instagram.com/reel/Cabc/")).toBe("INSTAGRAM");
    expect(detectarRedeDoLink("https://www.instagram.com/user/p/Cabc/")).toBe("INSTAGRAM");
    expect(detectarRedeDoLink("https://youtube.com/shorts/abc")).toBe("YOUTUBE");
    expect(detectarRedeDoLink("https://youtu.be/abc")).toBe("YOUTUBE");
    expect(detectarRedeDoLink("https://x.com/jack/status/20")).toBe("TWITTER");
    expect(detectarRedeDoLink("https://twitter.com/jack/status/20?s=20")).toBe("TWITTER");
    expect(
      detectarRedeDoLink("https://www.linkedin.com/posts/fulano_tema-activity-7247-abc"),
    ).toBe("LINKEDIN");
    expect(
      detectarRedeDoLink("https://www.linkedin.com/feed/update/urn:li:activity:7247/"),
    ).toBe("LINKEDIN");
  });

  it("recusa perfil, outro site e texto solto", () => {
    expect(detectarRedeDoLink("https://www.instagram.com/fulano/")).toBeNull();
    expect(detectarRedeDoLink("https://x.com/jack")).toBeNull();
    expect(detectarRedeDoLink("https://example.com/shorts/abc")).toBeNull();
    expect(detectarRedeDoLink("nada")).toBeNull();
  });
});

describe("limparLink", () => {
  it("tira o rastreio e mantém o ?v= do YouTube", () => {
    expect(limparLink("https://x.com/jack/status/20?s=20&t=abc#x")).toBe(
      "https://x.com/jack/status/20",
    );
    expect(limparLink("https://www.youtube.com/watch?v=abc&feature=share")).toBe(
      "https://www.youtube.com/watch?v=abc",
    );
  });
});

describe("lerMetricasDoItem", () => {
  it("lê um tweet (apidojo/tweet-scraper)", () => {
    const r = lerMetricasDoItem({
      text: "just setting up my twttr",
      retweetCount: 124669,
      replyCount: 18072,
      likeCount: 309485,
      quoteCount: 7283,
      bookmarkCount: 21921,
      viewCount: 5000,
      createdAt: "Tue Mar 21 20:50:14 +0000 2006",
    });
    expect(r.metricas).toEqual({
      views: 5000,
      curtidas: 309485,
      comentarios: 18072,
      reposts: 124669,
      quotes: 7283,
      salvos: 21921,
    });
    expect(r.quando?.getUTCFullYear()).toBe(2006);
    expect(r.texto).toBe("just setting up my twttr");
  });

  it("lê um vídeo do YouTube (streamers/youtube-scraper)", () => {
    const r = lerMetricasDoItem({
      title: "Never Gonna Give You Up",
      viewCount: 1824333135,
      likes: 19000000,
      commentsCount: 2458441,
      date: "2009-10-25T06:57:33.000Z",
    });
    expect(r.metricas.views).toBe(1824333135);
    expect(r.metricas.curtidas).toBe(19000000);
    expect(r.metricas.comentarios).toBe(2458441);
    expect(r.quando?.toISOString()).toBe("2009-10-25T06:57:33.000Z");
  });

  it("lê um TikTok e trata curtidas ocultas do Instagram", () => {
    const tt = lerMetricasDoItem({
      playCount: 900,
      diggCount: 80,
      commentCount: 7,
      shareCount: 3,
      collectCount: 5,
    });
    expect(tt.metricas).toEqual({
      views: 900,
      curtidas: 80,
      comentarios: 7,
      reposts: 3,
      quotes: 0,
      salvos: 5,
    });
    expect(tt.quando).toBeNull();
    const ig = lerMetricasDoItem({ videoPlayCount: 40, likesCount: -1, commentsCount: 2 });
    expect(ig.metricas.views).toBe(40);
    expect(ig.metricas.curtidas).toBe(0);
  });
});

describe("lerPaginaLinkedIn", () => {
  const pagina = (ld: unknown, extra = "") =>
    `<html><script type="application/ld+json">${JSON.stringify(ld)}</script>${extra}</html>`;

  it("lê reações, comentários e data da página pública", () => {
    const r = lerPaginaLinkedIn(
      pagina(
        {
          "@type": "VideoObject",
          datePublished: "2026-10-07T13:00:38.266Z",
          headline: "SOON -> NIDO AI STUDIO",
          commentCount: 2,
          interactionStatistic: [
            { interactionType: "http://schema.org/LikeAction", userInteractionCount: 1 },
            { interactionType: "https://schema.org/CommentAction", userInteractionCount: 0 },
          ],
        },
        '<a data-num-reactions="3" data-num-reposts="4"></a>',
      ),
    );
    expect(r?.metricas).toEqual({
      views: 0,
      curtidas: 3,
      comentarios: 2,
      reposts: 4,
      quotes: 0,
      salvos: 0,
    });
    expect(r?.quando?.toISOString()).toBe("2026-10-07T13:00:38.266Z");
    expect(r?.texto).toBe("SOON -> NIDO AI STUDIO");
  });

  it("devolve null quando a página não é de um post", () => {
    expect(lerPaginaLinkedIn("<html>Sign in</html>")).toBeNull();
    expect(lerPaginaLinkedIn(pagina({ "@type": "WebPage" }))).toBeNull();
  });

  it("aceita o link curto lnkd.in", () => {
    expect(detectarRedeDoLink("https://lnkd.in/p/djF-9YjC")).toBe("LINKEDIN");
  });
});

describe("lerAutorDoItem (quem publicou o post)", () => {
  it("lê o @ e o id do autor no formato de cada scraper", () => {
    // clockworks/tiktok-scraper
    expect(
      lerAutorDoItem({ authorMeta: { name: "LilaNova", id: "6812345" }, playCount: 10 }),
    ).toBe("lilanova id:6812345");
    // apify/instagram-scraper
    expect(lerAutorDoItem({ ownerUsername: "lila.nova", ownerId: "555" })).toBe(
      "lila.nova id:555",
    );
    // apidojo/tweet-scraper
    expect(lerAutorDoItem({ author: { userName: "@Lila", id: "42" } })).toBe(
      "lila id:42",
    );
    // streamers/youtube-scraper
    expect(
      lerAutorDoItem({
        channelName: "Lila Nova Oficial",
        channelUrl: "https://www.youtube.com/@LilaNova",
        channelId: "UCabc",
      }),
    ).toBe("lilanova id:UCabc");
  });

  it("sem autor no resultado, devolve vazio (o post não conta para os badges)", () => {
    expect(lerAutorDoItem({ viewCount: 10 })).toBe("");
    expect(lerAutorDoItem({ author: "texto solto com espaço" })).toBe("");
  });

  it("lerMetricasDoItem devolve o autor junto", () => {
    expect(lerMetricasDoItem({ ownerUsername: "lila", videoViewCount: 9 }).autor).toBe(
      "lila",
    );
  });
});
