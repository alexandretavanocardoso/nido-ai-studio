import { describe, expect, it } from "vitest";
import { emptyCharacter } from "@/lib/defaults";
import { creditosRadar } from "@/lib/planos";
import { lerRadar, pedidoRadar, perfilParaRadar } from "./gerar";
import { fontesDaResposta, textoDaResposta } from "./grok";
import { destaques, diaDeHoje, temasDoPersonagem } from "./tipos";

describe("temas do radar", () => {
  it("junta os temas digitados com o nicho da ficha, sem repetir, até 6", () => {
    const c = emptyCharacter();
    c.nicho.principal = "Música eletrônica";
    c.nicho.subnicho = "DJ de academia";
    c.radar = {
      ativo: true,
      comX: false,
      temas: ["IA", " música eletrônica ", "bancos"],
    };
    expect(temasDoPersonagem(c)).toEqual([
      "IA",
      "música eletrônica",
      "bancos",
      "DJ de academia",
    ]);
    c.radar.temas = ["a", "b", "c", "d", "e", "f", "g"];
    expect(temasDoPersonagem(c)).toHaveLength(6);
  });
  it("sem nicho e sem temas, não há o que procurar", () => {
    expect(temasDoPersonagem(emptyCharacter())).toEqual([]);
  });
  it("o dia é o de Brasília (23h de lá ainda é o mesmo dia, mesmo já sendo amanhã em UTC)", () => {
    expect(diaDeHoje(new Date("2026-10-08T01:30:00Z"))).toBe("2026-10-07");
  });
});

describe("ler a resposta do radar", () => {
  it("aceita texto antes do JSON, ordena por nota, limita a nota a 1–10 e descarta link inválido", () => {
    const r = lerRadar(
      'Pesquisei e achei isto:\n{"resumo": "dia calmo", "itens": [' +
        '{"titulo": "B", "nota": 4, "fonte": "noticia", "url": "javascript:alert(1)"},' +
        '{"titulo": "A", "nota": "12", "fonte": "x", "url": "https://x.com/a/status/1", "ideia": ["um", "dois"]},' +
        '{"titulo": "  ", "nota": 9}]}',
    );
    expect(r.resumo).toBe("dia calmo");
    expect(r.itens.map((i) => i.titulo)).toEqual(["A", "B"]);
    expect(r.itens[0]).toMatchObject({
      nota: 10,
      fonte: "x",
      url: "https://x.com/a/status/1",
      ideia: "um; dois",
    });
    expect(r.itens[1].url).toBeUndefined();
    expect(destaques(r).map((i) => i.titulo)).toEqual(["A"]);
  });
  it("resposta sem JSON vira erro claro", () => {
    expect(() => lerRadar("não achei nada hoje")).toThrow(/formato inesperado/);
  });
});

describe("pedido do radar", () => {
  it("leva o perfil, os temas, a data e — só quando existe — o bloco do X", () => {
    const c = emptyCharacter();
    c.identidade.nome = "Gru";
    c.nicho.principal = "Música eletrônica";
    const base = {
      perfil: perfilParaRadar(c),
      temas: ["IA"],
      hoje: "2026-10-07",
      idioma: "pt" as const,
    };
    const sem = pedidoRadar({ ...base, noX: null });
    expect(sem).toMatch(/Hoje é 2026-10-07/);
    expect(sem).toMatch(/- Nome: Gru/);
    expect(sem).not.toMatch(/EM ALTA NO X/);
    expect(pedidoRadar({ ...base, noX: "post sobre IA" })).toMatch(
      /EM ALTA NO X HOJE[\s\S]*post sobre IA/,
    );
    expect(pedidoRadar({ ...base, noX: null, idioma: "en" })).toMatch(
      /Write everything in English/,
    );
  });
});

describe("resposta do Grok", () => {
  it("lê o texto e as fontes nos dois formatos da API", () => {
    expect(textoDaResposta({ output_text: " oi " })).toBe("oi");
    const data = {
      output: [
        { type: "reasoning" },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "em alta",
              annotations: [{ url: "https://x.com/a" }],
            },
          ],
        },
      ],
      citations: ["https://x.com/b", { url: "https://x.com/a" }, "nada"],
    };
    expect(textoDaResposta(data)).toBe("em alta");
    expect(fontesDaResposta(data).sort()).toEqual([
      "https://x.com/a",
      "https://x.com/b",
    ]);
    expect(textoDaResposta(null)).toBe("");
  });
});

describe("custo do radar", () => {
  it("o X soma créditos ao radar de notícias", () => {
    expect(creditosRadar(false)).toBe(8);
    expect(creditosRadar(true)).toBe(26);
  });
});

describe("revisão das notas", () => {
  const item = (titulo: string, nota: number) =>
    ({
      titulo,
      resumo: "",
      porque: "",
      ideia: "",
      fonte: "noticia",
      nota,
    }) as const;

  it("usa a nota do revisor, rebaixa o promocional para no máximo 4 e reordena", async () => {
    const { aplicarRevisao } = await import("./gerar");
    const r = aplicarRevisao(
      [item("A", 9), item("B", 9), item("C", 6)],
      [
        { i: 0, nota: 6 },
        { i: 1, nota: 9, promocional: true },
        { i: 2, nota: 9 },
      ],
    );
    expect(r.map((x) => [x.titulo, x.nota, !!x.promocional])).toEqual([
      ["C", 9, false],
      ["A", 6, false],
      ["B", 4, true],
    ]);
  });

  it("sem revisão (falhou ou faltou o item), ninguém passa de 8 — não vira aviso", async () => {
    const { aplicarRevisao } = await import("./gerar");
    expect(
      aplicarRevisao([item("A", 10), item("B", 5)], null).map((x) => x.nota),
    ).toEqual([8, 5]);
    expect(
      aplicarRevisao([item("A", 10), item("B", 10)], [{ i: 0, nota: 9 }]).map(
        (x) => x.nota,
      ),
    ).toEqual([9, 8]);
  });

  it("o pedido de revisão leva os itens numerados e a régua de notas", async () => {
    const { pedidoRevisao } = await import("./gerar");
    const p = pedidoRevisao({
      perfil: "- Nome: Gru",
      itens: [item("Notícia X", 9)],
      hoje: "2026-10-07",
      idioma: "pt",
    });
    expect(p).toMatch(/"i": 0/);
    expect(p).toMatch(/Notícia X/);
    expect(p).toMatch(/Item promocional nunca passa de 4/);
  });
});

describe("resumo do radar", () => {
  it("o revisor também escreve o resumo, com base nas notas dele", async () => {
    const { pedidoRevisao } = await import("./gerar");
    const itens = [
      {
        titulo: "A",
        resumo: "",
        porque: "",
        ideia: "",
        fonte: "noticia" as const,
        nota: 9,
      },
    ];
    const pt = pedidoRevisao({
      perfil: "",
      itens,
      hoje: "2026-10-07",
      idioma: "pt",
    });
    expect(pt).toMatch(/resumo do dia em 2–3 frases/);
    expect(pt).toMatch(/Nunca destaque um item que você deu nota baixa/);
    expect(pt).toMatch(/\{"resumo": "\.\.\.", "itens"/);
    expect(
      pedidoRevisao({ perfil: "", itens, hoje: "2026-10-07", idioma: "en" }),
    ).toMatch(/quiet day for this character/);
  });
});

describe("JSON em qualquer lugar do texto", () => {
  it("acha o objeto com cercas de Markdown, texto antes e depois, e chaves dentro de textos", async () => {
    const { lerRadar, objetosJsonNoTexto } = await import("./gerar");
    const texto =
      'Pesquisei. Veja {isto não é json}.\n```json\n{"resumo": "calmo {hoje}", "itens": [{"titulo": "A \\"citado\\" }", "nota": 7}]}\n```\nEspero que ajude! {"outra": 1}';
    expect(objetosJsonNoTexto(texto)).toHaveLength(2);
    const r = lerRadar(texto);
    expect(r.resumo).toBe("calmo {hoje}");
    expect(r.itens[0].titulo).toBe('A "citado" }');
  });
  it("fica com o ÚLTIMO objeto que tem itens (o modelo às vezes rascunha antes)", async () => {
    const { lerRadar } = await import("./gerar");
    const r = lerRadar(
      '{"itens": [{"titulo": "rascunho", "nota": 5}]} ... versão final: {"resumo": "ok", "itens": [{"titulo": "final", "nota": 8}]}',
    );
    expect(r.itens.map((i) => i.titulo)).toEqual(["final"]);
  });
  it("JSON cortado no meio não é aceito", async () => {
    const { lerRadar } = await import("./gerar");
    expect(() => lerRadar('{"resumo": "x", "itens": [{"titulo": "A"')).toThrow(
      /formato inesperado/,
    );
  });
});
