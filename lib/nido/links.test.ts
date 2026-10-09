import { describe, expect, it } from "vitest";
import { chaveDoLink, personagemDaCampanha } from "./links";

describe("chaveDoLink", () => {
  it("o mesmo post em endereços diferentes dá a mesma chave", () => {
    expect(chaveDoLink("https://youtu.be/GahG5ShAbcd?si=xyz")).toBe("youtube:GahG5ShAbcd");
    expect(chaveDoLink("https://www.youtube.com/shorts/GahG5ShAbcd")).toBe("youtube:GahG5ShAbcd");
    expect(chaveDoLink("https://m.youtube.com/watch?v=GahG5ShAbcd&t=3s")).toBe("youtube:GahG5ShAbcd");
    expect(chaveDoLink("https://www.tiktok.com/@alguem/video/7412345678901234567?is_from_webapp=1")).toBe(
      "tiktok:7412345678901234567",
    );
    expect(chaveDoLink("https://www.instagram.com/reels/DeNydRTsNgz/")).toBe("instagram:DeNydRTsNgz");
    expect(chaveDoLink("https://instagram.com/reel/DeNydRTsNgz/?igsh=abc")).toBe("instagram:DeNydRTsNgz");
    expect(chaveDoLink("https://twitter.com/user/status/1790000000000000000?s=20")).toBe("x:1790000000000000000");
    expect(chaveDoLink("https://x.com/outro/status/1790000000000000000")).toBe("x:1790000000000000000");
  });

  it("rede desconhecida: o endereço sem parâmetros nem barra no fim", () => {
    expect(chaveDoLink("HTTPS://Www.Exemplo.com/Post/123/?utm=1#topo")).toBe("exemplo.com/post/123");
    expect(chaveDoLink("exemplo.com/a")).toBe("exemplo.com/a");
  });

  it("vazio ou inválido: null", () => {
    expect(chaveDoLink("")).toBeNull();
    expect(chaveDoLink(null)).toBeNull();
    expect(chaveDoLink("http://")).toBeNull();
  });
});

describe("personagemDaCampanha", () => {
  const posts = new Map([
    ["youtube:AAA", "lila"],
    ["tiktok:111", "lila"],
    ["instagram:BBB", "tanjirao"],
  ]);

  it("liga pelo link do post registrado no Studio", () => {
    expect(
      personagemDaCampanha({ links: ["https://youtu.be/AAA"], posts }),
    ).toEqual({ characterId: "lila", vinculo: "link" });
  });

  it("vários personagens na mesma campanha: fica o que tem mais posts", () => {
    expect(
      personagemDaCampanha({
        links: [
          "https://www.instagram.com/reel/BBB/",
          "https://youtu.be/AAA",
          "https://www.tiktok.com/@x/video/111",
        ],
        posts,
      }).characterId,
    ).toBe("lila");
  });

  it("a escolha manual manda, mesmo com link de outro personagem", () => {
    expect(
      personagemDaCampanha({ links: ["https://youtu.be/AAA"], posts, manual: "tanjirao" }),
    ).toEqual({ characterId: "tanjirao", vinculo: "manual" });
  });

  it("sem post reconhecido: sem personagem", () => {
    expect(
      personagemDaCampanha({ links: ["https://youtu.be/ZZZ"], posts }),
    ).toEqual({ characterId: null, vinculo: null });
  });

  it("personagem apagado não conta (nem o manual, nem o do link)", () => {
    const existentes = new Set(["tanjirao"]);
    expect(
      personagemDaCampanha({ links: ["https://youtu.be/AAA"], posts, manual: "lila", existentes }),
    ).toEqual({ characterId: null, vinculo: null });
  });
});
