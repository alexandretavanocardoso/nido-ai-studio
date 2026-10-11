import { describe, expect, it } from "vitest";
import type { Rede } from "@/lib/social/redes";
import { SEM_TOTAIS } from "./badges";
import {
  chaveDaMarca,
  chaveDoPost,
  classificarPost,
  contasPeloPrimeiroLink,
  juntarPostsQueContam,
  leitura,
  marcasDaConta,
  marcasDoAutor,
  normalizarUsuario,
  resumir,
  saltoSuspeito,
  type MarcaMinha,
  type PostLido,
} from "./views";

describe("chaveDoPost", () => {
  it("dá a mesma chave para os vários links do mesmo post", () => {
    expect(chaveDoPost("YOUTUBE", "https://youtu.be/abc123XYZ_-")).toBe(
      "YOUTUBE:abc123XYZ_-",
    );
    expect(
      chaveDoPost("YOUTUBE", "https://www.youtube.com/shorts/abc123XYZ_-?feature=share"),
    ).toBe("YOUTUBE:abc123XYZ_-");
    expect(
      chaveDoPost("YOUTUBE", "https://youtube.com/watch?v=abc123XYZ_-&t=3"),
    ).toBe("YOUTUBE:abc123XYZ_-");

    expect(chaveDoPost("INSTAGRAM", "https://www.instagram.com/reel/Cabc_-1/")).toBe(
      "INSTAGRAM:Cabc_-1",
    );
    expect(
      chaveDoPost("INSTAGRAM", "https://instagram.com/lila/p/Cabc_-1/?igsh=xyz"),
    ).toBe("INSTAGRAM:Cabc_-1");

    expect(chaveDoPost("TWITTER", "https://x.com/lila/status/1234567890")).toBe(
      "TWITTER:1234567890",
    );
    expect(
      chaveDoPost("TWITTER", "https://twitter.com/outro/status/1234567890?s=20"),
    ).toBe("TWITTER:1234567890");

    expect(
      chaveDoPost("TIKTOK", "https://www.tiktok.com/@lila/video/7412345678901234567"),
    ).toBe("TIKTOK:7412345678901234567");

    expect(
      chaveDoPost(
        "LINKEDIN",
        "https://www.linkedin.com/posts/lila_tema-activity-7247000000000000000-abcd",
      ),
    ).toBe("LINKEDIN:7247000000000000000");
    expect(
      chaveDoPost(
        "LINKEDIN",
        "https://www.linkedin.com/feed/update/urn:li:activity:7247000000000000000/",
      ),
    ).toBe("LINKEDIN:7247000000000000000");
  });

  it("sem id reconhecível, vale o endereço sem rastreio", () => {
    expect(chaveDoPost("TIKTOK", "https://vm.tiktok.com/ZMabc/")).toBe(
      "TIKTOK:vm.tiktok.com/ZMabc",
    );
    expect(chaveDoPost("TIKTOK", "isto não é link")).toBe("TIKTOK:isto não é link");
  });

  it("posts diferentes e redes diferentes nunca dão a mesma chave", () => {
    expect(chaveDoPost("TWITTER", "https://x.com/a/status/1")).not.toBe(
      chaveDoPost("TWITTER", "https://x.com/a/status/2"),
    );
    expect(chaveDoPost("TWITTER", "https://x.com/a/status/1")).not.toBe(
      chaveDoPost("TIKTOK", "https://www.tiktok.com/@a/video/1"),
    );
  });
});

describe("marcas de conta e de autor", () => {
  it("normaliza o @", () => {
    expect(normalizarUsuario(" @Lila.Nova ")).toBe("lila.nova");
    expect(normalizarUsuario(null)).toBe("");
  });

  it("a conta conectada é reconhecida pelo id na rede e pelo @, sempre na mesma ordem", () => {
    expect(marcasDaConta({ usuario: "Lila", idExterno: "123" })).toEqual(["id:123", "lila"]);
    expect(marcasDaConta({ usuario: "@Lila", idExterno: null })).toEqual(["lila"]);
    expect(marcasDaConta({ usuario: null, idExterno: null })).toEqual([]);
  });

  it("o autor lido de um post vira as mesmas marcas, sem repetição e em ordem fixa", () => {
    expect(marcasDoAutor("lila id:123")).toEqual(["id:123", "lila"]);
    expect(marcasDoAutor("id:123  lila lila")).toEqual(["id:123", "lila"]);
    expect(marcasDoAutor("")).toEqual([]);
    expect(marcasDoAutor(null)).toEqual([]);
    // conta conectada e autor do scraper batem
    expect(marcasDoAutor("lila id:123")).toEqual(marcasDaConta({ usuario: "Lila", idExterno: "123" }));
  });

  it("limpa as leituras: inteiro entre zero e o teto, senão zero", () => {
    expect(leitura("1234")).toBe(1234);
    expect(leitura(12.6)).toBe(13);
    expect(leitura(null)).toBe(0);
    expect(leitura(-5)).toBe(0);
    expect(leitura("abc")).toBe(0);
    expect(leitura(999_999_999_999_999)).toBe(0);
  });
});

/* ---------- a regra: uma conta por rede, só os posts dela contam ---------- */

let n = 0;
function post(p: Partial<PostLido> & { views?: number }): PostLido {
  const { views, ...resto } = p;
  return {
    id: `p${++n}`,
    manual: true,
    bundle_post_id: null,
    links: { TIKTOK: `https://www.tiktok.com/@x/video/${1000 + n}` },
    autor: "lila id:1",
    rede: "TIKTOK",
    criado: n,
    metricas: { ...SEM_TOTAIS, views: views ?? 1_000 },
    ...resto,
  };
}
const minha = (marca: string, origem: MarcaMinha["origem"] = "link", rede: Rede = "TIKTOK"): MarcaMinha => ({
  rede,
  marca,
  origem,
});
const ninguem = new Set<string>();
const semConexao = new Set<Rede>();

describe("contasPeloPrimeiroLink", () => {
  it("o autor do primeiro post por link de cada rede vira a conta", () => {
    const posts = [
      post({ autor: "segundo id:2", criado: 20 }),
      post({ autor: "primeiro id:1", criado: 10 }),
      post({ rede: "TWITTER", autor: "nox", criado: 30 }),
    ];
    expect(contasPeloPrimeiroLink(posts, [], ninguem)).toEqual([
      { rede: "TIKTOK", marcas: ["id:1", "primeiro"] },
      { rede: "TWITTER", marcas: ["nox"] },
    ]);
  });

  it("rede em que o personagem já tem conta não ganha outra", () => {
    const posts = [post({ autor: "outra id:9" })];
    expect(contasPeloPrimeiroLink(posts, [minha("lila")], ninguem)).toEqual([]);
  });

  it("o primeiro é pela ordem de cadastro: link mais antigo esperando a leitura do autor segura a conta da rede", () => {
    const posts = [
      post({ autor: null, autorPendente: true, criado: 1 }),
      post({ autor: "lido_antes id:9", criado: 2 }),
      post({ rede: "TWITTER", autor: "nox", criado: 3 }),
    ];
    // TikTok espera o post 1; o X, que não tem ninguém na frente, já tem conta.
    expect(contasPeloPrimeiroLink(posts, [], ninguem)).toEqual([
      { rede: "TWITTER", marcas: ["nox"] },
    ]);
    // lido o primeiro, a conta é a dele — não a do que foi lido antes
    posts[0] = { ...posts[0], autor: "primeiro id:1", autorPendente: false };
    expect(contasPeloPrimeiroLink(posts, [], ninguem)).toEqual([
      { rede: "TIKTOK", marcas: ["id:1", "primeiro"] },
      { rede: "TWITTER", marcas: ["nox"] },
    ]);
    // e se a leitura dele não saiu (desistiu), vale o seguinte
    posts[0] = { ...posts[0], autor: "", autorPendente: false };
    expect(contasPeloPrimeiroLink(posts, [], ninguem)[0]).toEqual({
      rede: "TIKTOK",
      marcas: ["id:9", "lido_antes"],
    });
  });

  it("pula post sem autor lido, post do app e conta que já é de outro personagem", () => {
    const posts = [
      post({ autor: null, criado: 1 }),
      post({ autor: "", criado: 2 }),
      post({ manual: false, bundle_post_id: "b", autor: null, criado: 3 }),
      post({ autor: "tomada id:7", criado: 4 }),
      post({ autor: "livre id:8", criado: 5 }),
    ];
    const deOutros = new Set([chaveDaMarca("TIKTOK", "id:7")]);
    expect(contasPeloPrimeiroLink(posts, [], deOutros)).toEqual([
      { rede: "TIKTOK", marcas: ["id:8", "livre"] },
    ]);
  });
});

describe("classificarPost", () => {
  const minhas = [minha("lila"), minha("id:1")];

  it("post por link da conta do influencer conta; conta só pelo link não é prova forte", () => {
    expect(classificarPost(post({}), minhas, ninguem, semConexao)).toMatchObject({
      situacao: "conta",
      verificada: false,
    });
    expect(
      classificarPost(post({}), [minha("lila", "conectada")], ninguem, semConexao),
    ).toMatchObject({ situacao: "conta", verificada: true });
  });

  it("basta uma marca bater (o @ mudou mas o id é o mesmo)", () => {
    expect(
      classificarPost(post({ autor: "lila_novo id:1" }), minhas, ninguem, semConexao).situacao,
    ).toBe("conta");
  });

  it("post de outra conta, de conta de outro personagem, sem autor ou com autor oculto: não conta", () => {
    const de = (autor: string | null, deOutros = ninguem) =>
      classificarPost(post({ autor }), minhas, deOutros, semConexao).situacao;
    expect(de("mrbeast id:99")).toBe("outra_conta");
    expect(de("lila_ id:2")).toBe("outra_conta");
    expect(de("")).toBe("autor_oculto");
    // autor não lido: espera enquanto o app ainda vai tentar; senão, não deu para saber
    expect(
      classificarPost(post({ autor: null, autorPendente: true }), minhas, ninguem, semConexao)
        .situacao,
    ).toBe("sem_autor");
    expect(de(null)).toBe("autor_oculto");
    expect(
      classificarPost(post({ rede: "LINKEDIN", autor: null }), minhas, ninguem, semConexao)
        .situacao,
    ).toBe("autor_oculto");
    expect(de("lila id:1", new Set([chaveDaMarca("TIKTOK", "id:1")]))).toBe("outro_personagem");
  });

  it("a conta de uma rede não vale para outra: sem conta na rede, o post espera o primeiro link dela", () => {
    expect(
      classificarPost(post({ rede: "INSTAGRAM" }), minhas, ninguem, semConexao).situacao,
    ).toBe("sem_autor");
    // com conta definida no Instagram, e não é a deste post: outra conta
    expect(
      classificarPost(
        post({ rede: "INSTAGRAM" }),
        [...minhas, minha("outra_ig", "link", "INSTAGRAM")],
        ninguem,
        semConexao,
      ).situacao,
    ).toBe("outra_conta");
  });

  it("post do app conta só na rede em que há conta conectada do personagem", () => {
    const doApp = post({ manual: false, bundle_post_id: "b1", autor: null });
    expect(classificarPost(doApp, [], ninguem, semConexao).situacao).toBe("sem_conta");
    expect(classificarPost(doApp, [], ninguem, new Set<Rede>(["TIKTOK"]))).toMatchObject({
      situacao: "conta",
      verificada: true,
    });
    expect(
      classificarPost(doApp, [], ninguem, new Set<Rede>(["INSTAGRAM"])).situacao,
    ).toBe("sem_conta");
  });

  it("post sem nenhum número lido da rede fica de fora", () => {
    expect(
      classificarPost(post({ views: 0 }), minhas, ninguem, semConexao).situacao,
    ).toBe("sem_leitura");
    // curtidas sem views (LinkedIn) é leitura
    const soCurtidas = post({ views: 0 });
    soCurtidas.metricas.curtidas = 12;
    expect(classificarPost(soCurtidas, minhas, ninguem, semConexao).situacao).toBe("conta");
  });
});

describe("juntarPostsQueContam", () => {
  const conta = (p: PostLido, verificada = false) => ({ post: p, situacao: "conta" as const, verificada });

  it("o mesmo post pelo app e pelo link entra uma vez, com a maior leitura de cada métrica", () => {
    const link = { TIKTOK: "https://www.tiktok.com/@lila/video/42" };
    const peloApp = post({ id: "app", manual: false, bundle_post_id: "b", links: { TIKTOK: `${link.TIKTOK}?lang=pt` }, views: 4_000 });
    peloApp.metricas.curtidas = 300;
    const peloLink = post({ id: "link", links: link, views: 4_200 });
    peloLink.metricas.curtidas = 250;
    const m = juntarPostsQueContam([conta(peloApp, true), conta(peloLink)]);
    expect([...m.keys()]).toEqual(["TIKTOK:42"]);
    expect(m.get("TIKTOK:42")).toMatchObject({
      verificada: true,
      metricas: { views: 4_200, curtidas: 300 },
      legado: "APP:app:TIKTOK",
    });
  });

  it("post do app sem link usa uma chave própria, que depois vira a do link", () => {
    const semLink = post({ id: "x", manual: false, bundle_post_id: "b", links: null });
    expect([...juntarPostsQueContam([conta(semLink, true)]).keys()]).toEqual(["APP:x:TIKTOK"]);
  });

  it("só entra o que foi classificado como conta", () => {
    const fora = { post: post({}), situacao: "outra_conta" as const, verificada: false };
    expect(juntarPostsQueContam([fora]).size).toBe(0);
  });
});

describe("resumir", () => {
  it("conta os posts por situação e mostra a conta de cada rede pelo @", () => {
    const c = (situacao: Parameters<typeof resumir>[0][number]["situacao"]) => ({
      post: post({}),
      situacao,
      verificada: false,
    });
    const r = resumir(
      [c("conta"), c("conta"), c("sem_autor"), c("outra_conta"), c("outro_personagem"), c("autor_oculto"), c("sem_conta"), c("sem_leitura")],
      [minha("id:1"), minha("lila"), minha("id:77", "conectada", "TWITTER")],
    );
    expect(r).toEqual({
      posts: 8,
      contam: 2,
      semAutor: 1,
      autorOculto: 1,
      outraConta: 1,
      outroPersonagem: 1,
      semConta: 1,
      contas: [
        { rede: "TIKTOK", usuario: "lila", origem: "link" },
        { rede: "TWITTER", usuario: "id:77", origem: "conectada" },
      ],
    });
  });
});

describe("saltoSuspeito", () => {
  it("acusa a leitura que cresce 100 vezes e mais de 100 mil views", () => {
    expect(saltoSuspeito(1_000, 1_760_000_000)).toBe(true);
    expect(saltoSuspeito(2_000, 300_000)).toBe(true);
  });
  it("não acusa crescimento normal nem a primeira leitura", () => {
    expect(saltoSuspeito(0, 5_000_000)).toBe(false); // primeira leitura
    expect(saltoSuspeito(50_000, 400_000)).toBe(false); // 8 vezes
    expect(saltoSuspeito(10, 5_000)).toBe(false); // 500 vezes, mas pouca view
    expect(saltoSuspeito(1_000_000, 1_500_000)).toBe(false);
  });
  it("nas outras métricas o salto mínimo é o da escada delas", () => {
    expect(saltoSuspeito(10, 5_000, 2_000)).toBe(true); // curtidas: 500 vezes e 2 mil a mais
    expect(saltoSuspeito(10, 1_500, 2_000)).toBe(false);
    expect(saltoSuspeito(10, 5_000_000, Infinity)).toBe(false); // métrica sem escada
  });
});
