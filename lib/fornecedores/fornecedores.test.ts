import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Radar de fornecedores: a leitura da resposta do agente e, contra um Postgres
 * de verdade (PGlite, com todas as migrations), o que é gravado e o que o
 * admin muda. A pesquisa na web em si não roda aqui.
 */
const e = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/lib/db", () => ({ getPool: () => e.pool }));

import { lerEmpresas, pedidoFornecedores } from "./pesquisar";
import {
  atualizarFornecedor,
  categoriasPendentes,
  listarFornecedores,
  salvarAchados,
} from "./server";
import { chaveFornecedor, type EmpresaAchada } from "./tipos";

beforeAll(async () => {
  const db = new PGlite();
  for (const f of readdirSync("db/migrations").sort())
    await db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
  e.pool = {
    query: async (sql: string, p?: unknown[]) => {
      const r = await db.query(sql, p);
      return { rows: r.rows, rowCount: r.rows.length || (r.affectedRows ?? 0) };
    },
  };
}, 60_000);

const empresa = (o: Partial<EmpresaAchada>): EmpresaAchada => ({
  nome: "Exemplo AI",
  pais: "China",
  categorias: ["video"],
  oferece: "Texto para vídeo por API.",
  api: "sim",
  preco: null,
  site: "https://www.exemplo.ai",
  linkedin: null,
  pessoas: null,
  porque: "Mais barato.",
  nota: 7,
  fontes: [{ titulo: "Docs", url: "https://docs.exemplo.ai" }],
  ...o,
});

describe("chave do fornecedor", () => {
  it("usa o domínio do site, sem subdomínio", () => {
    expect(chaveFornecedor("BytePlus", "https://docs.byteplus.com/en/api")).toBe(
      "byteplus.com",
    );
    expect(chaveFornecedor("BytePlus", "https://www.byteplus.com")).toBe(
      "byteplus.com",
    );
    expect(chaveFornecedor("Zhipu", "https://open.bigmodel.com.cn/dev")).toBe(
      "bigmodel.com.cn",
    );
  });

  it("sem site, usa o nome só com letras e números", () => {
    expect(chaveFornecedor("Shengshu (生数科技)", null)).toBe("shengshu生数科技");
    expect(chaveFornecedor("Exemplo AI", "não é um endereço")).toBe("exemploai");
  });
});

describe("leitura da resposta do agente", () => {
  it("lê o JSON depois do texto, limpa os campos e ordena pela nota", () => {
    const resposta =
      'Achei estas empresas {"rascunho": 1}.\n```json\n' +
      JSON.stringify({
        empresas: [
          { nome: "Fraca", nota: "3", categorias: ["voz"], site: "sem-esquema.com" },
          {
            nome: "Forte",
            nota: 12,
            api: "talvez",
            categorias: ["video", "robôs"],
            linkedin: "https://exemplo.com/nao-e-linkedin",
            fontes: [{ titulo: "", url: "https://a.com" }, { url: "javascript:x" }],
          },
          { nome: "  " },
        ],
      }) +
      "\n```";
    const lidas = lerEmpresas(resposta, "imagem");
    expect(lidas.map((x) => x.nome)).toEqual(["Forte", "Fraca"]);
    expect(lidas[0]).toMatchObject({
      nota: 10,
      api: "incerto",
      categorias: ["video", "imagem"],
      linkedin: null,
      fontes: [{ titulo: "https://a.com", url: "https://a.com" }],
    });
    expect(lidas[1]).toMatchObject({ nota: 3, site: null });
  });

  it("recusa resposta sem a lista de empresas", () => {
    expect(() => lerEmpresas("não achei nada", "voz")).toThrow();
  });

  it("o pedido leva as empresas já conhecidas e a prioridade para a China", () => {
    const pedido = pedidoFornecedores({
      categoria: "voz",
      conhecidas: ["Exemplo AI"],
      hoje: "2026-10-13",
    });
    expect(pedido).toContain("Exemplo AI");
    expect(pedido).toContain("Prioridade para a China");
    expect(pedido).toContain("语音合成");
  });
});

describe("no banco", () => {
  it("não grava a mesma empresa duas vezes nem apaga o que o admin fez", async () => {
    expect(await salvarAchados([empresa({}), empresa({ nome: "Outra", site: null })])).toBe(2);

    const [a] = (await listarFornecedores("nova")).itens;
    await atualizarFornecedor(a.id, { status: "contatada" });
    await atualizarFornecedor(a.id, { anotacoes: "  falei com a Li  " });

    // A mesma empresa volta numa pesquisa nova, por outro subdomínio e com outra ficha.
    expect(
      await salvarAchados([
        empresa({ site: "https://api.exemplo.ai/docs", oferece: "Outra coisa.", nota: 2 }),
      ]),
    ).toBe(0);

    const tudo = await listarFornecedores();
    expect(tudo.itens).toHaveLength(2);
    expect(tudo.itens.find((f) => f.id === a.id)).toMatchObject({
      status: "contatada",
      anotacoes: "falei com a Li",
      oferece: "Texto para vídeo por API.",
      categorias: ["video"],
      fontes: [{ titulo: "Docs", url: "https://docs.exemplo.ai" }],
    });
    expect(tudo.totais).toEqual(
      expect.arrayContaining([
        { status: "contatada", n: 1 },
        { status: "nova", n: 1 },
      ]),
    );
    expect((await listarFornecedores("contatada")).itens).toHaveLength(1);
  });

  it("o cron só repete a categoria que não deu certo na semana", async () => {
    const pool = e.pool as { query: (s: string, p?: unknown[]) => Promise<unknown> };
    expect(await categoriasPendentes()).toEqual(["video", "imagem", "voz"]);
    await pool.query(
      `insert into fornecedores_ia_buscas (id, categoria, erro, created_at) values
         ('b1', 'video', null, now()),
         ('b2', 'imagem', 'falhou', now()),
         ('b3', 'voz', null, now() - interval '8 days')`,
    );
    expect(await categoriasPendentes()).toEqual(["imagem", "voz"]);
    expect((await listarFornecedores()).ultimaBusca).not.toBeNull();
  });

  it("recusa fornecedor que não existe", async () => {
    await expect(
      atualizarFornecedor("nao-existe", { status: "descartada" }),
    ).rejects.toThrow("Fornecedor não encontrado.");
  });
});
