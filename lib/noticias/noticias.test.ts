import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Notícias do admin: a leitura da resposta do agente e, contra um Postgres de
 * verdade (PGlite, com todas as migrations), o que é gravado. A leitura do X e
 * a pesquisa na web em si não rodam aqui.
 */
const e = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/lib/db", () => ({ getPool: () => e.pool }));

import { lerNoticias, pedidoNoticias } from "./pesquisar";
import {
  agentesPendentes,
  desdeQuando,
  listarNoticias,
  salvarNoticias,
} from "./server";
import { ALVOS, alvosLidos, chaveNoticia, type NoticiaAchada } from "./tipos";

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

const noticia = (o: Partial<NoticiaAchada>): NoticiaAchada => ({
  alvo: "higgsfield",
  titulo: "Higgsfield lança modelo novo",
  resumo: "Saiu hoje.",
  impacto: "Vale testar.",
  fonte: "x",
  url: "https://x.com/higgsfield_ai/status/1977000000000000000",
  publicadoEm: null,
  nota: 7,
  ...o,
});

describe("chave da notícia", () => {
  it("post do X vale pelo id; página, pelo endereço sem parâmetros", () => {
    expect(
      chaveNoticia("a", "https://twitter.com/OpenAI/status/123456?s=20"),
    ).toBe(chaveNoticia("b", "https://x.com/OpenAI/status/123456"));
    expect(chaveNoticia("a", "https://www.OpenAI.com/News/Novo/?utm=x#topo")).toBe(
      "openai.com/news/novo",
    );
    expect(chaveNoticia("Preço Novo!", null)).toBe("preconovo");
  });
});

describe("leitura da resposta do agente", () => {
  const alvos = alvosLidos("ias");

  it("aceita o alvo pelo id ou pelo nome e descarta o que não é de ninguém", () => {
    const lidas = lerNoticias(
      "Pesquisei.\n" +
        JSON.stringify({
          itens: [
            { alvo: "grok", titulo: "A", nota: "4", url: "sem-esquema" },
            {
              alvo: "ChatGPT",
              titulo: "B",
              nota: 11,
              fonte: "site",
              url: "https://x.com/OpenAI/status/1977000000000000000",
              publicadoEm: "ontem",
            },
            { alvo: "Midjourney", titulo: "C" },
            { alvo: "", titulo: "D" },
          ],
        }),
      alvos,
    );
    expect(lidas.map((n) => [n.alvo, n.titulo])).toEqual([
      ["chatgpt", "B"],
      ["grok", "A"],
    ]);
    // O link é do X: a fonte é o X, diga o modelo o que disser.
    expect(lidas[0]).toMatchObject({ nota: 10, fonte: "x", publicadoEm: null });
    expect(lidas[1]).toMatchObject({ nota: 4, url: null });
  });

  it("dia sem novidade é resposta válida; texto sem JSON, não", () => {
    expect(lerNoticias('Nada hoje. {"itens": []}', alvos)).toEqual([]);
    expect(() => lerNoticias("nada", alvos)).toThrow();
  });

  it("o pedido leva os perfis, o que veio do X e o que já foi registrado", () => {
    const pedido = pedidoNoticias({
      agente: "concorrentes",
      alvos: alvosLidos("concorrentes"),
      desde: "2026-10-12",
      hoje: "2026-10-13",
      noX: "@higgsfield_ai anunciou X",
      conhecidas: ["Notícia antiga"],
    });
    expect(pedido).toContain('id "higgsfield"');
    expect(pedido).toContain("@higgsfield_ai anunciou X");
    expect(pedido).toContain("Notícia antiga");
    expect(pedido).toContain("de 2026-10-12 para cá");
  });

  it("alvo sem perfil nem site não entra na leitura", () => {
    for (const a of alvosLidos("concorrentes"))
      expect(a.x.length + a.sites.length).toBeGreaterThan(0);
    expect(ALVOS.ias.flatMap((a) => a.x).length).toBeLessThanOrEqual(10);
  });
});

describe("período da leitura", () => {
  const agora = Date.parse("2026-10-13T12:00:00Z");
  it("primeira vez: a última semana; depois, da véspera da última leitura", () => {
    expect(desdeQuando(null, agora)).toBe("2026-10-06");
    expect(desdeQuando(new Date("2026-10-12T10:30:00Z"), agora)).toBe("2026-10-11");
    expect(desdeQuando(new Date("2026-09-01T00:00:00Z"), agora)).toBe("2026-10-06");
  });
});

describe("no banco", () => {
  it("não grava a mesma notícia duas vezes e separa os agentes", async () => {
    expect(
      await salvarNoticias("concorrentes", [
        noticia({}),
        noticia({ titulo: "Outra", url: null, nota: 9 }),
      ]),
    ).toBe(2);
    // O mesmo post volta no dia seguinte, com outro título.
    expect(
      await salvarNoticias("concorrentes", [
        noticia({
          titulo: "Título diferente",
          url: "https://twitter.com/higgsfield_ai/status/1977000000000000000?s=20",
        }),
      ]),
    ).toBe(0);

    const lista = await listarNoticias("concorrentes");
    expect(lista.itens.map((n) => n.titulo)).toEqual([
      "Outra",
      "Higgsfield lança modelo novo",
    ]);
    expect(lista.ultimaBusca).toBeNull();
    expect((await listarNoticias("ias")).itens).toEqual([]);
  });

  it("notícia nova com nota 9 ou 10 vai para o sino dos admins, uma vez só", async () => {
    const pool = e.pool as {
      query: (s: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
    };
    process.env.ADMIN_EMAILS = "Chefe@Exemplo.com";
    await pool.query(
      `insert into "user" (id, name, email, "emailVerified") values
         ('adm', 'Chefe', 'chefe@exemplo.com', true),
         ('comum', 'Comum', 'comum@exemplo.com', true)`,
    );
    const urgente = noticia({
      alvo: "fal",
      titulo: "fal.ai sobe o preço do Kling",
      url: "https://fal.ai/blog/preco",
      nota: 9,
    });
    expect(
      await salvarNoticias("ias", [
        urgente,
        noticia({ alvo: "grok", titulo: "Morna", url: null, nota: 8 }),
      ]),
    ).toBe(2);
    expect(await salvarNoticias("ias", [urgente])).toBe(0);

    const { rows } = await pool.query(
      "select user_id, rotulo, href from avisos where chave like 'noticia:%'",
    );
    expect(rows).toEqual([
      {
        user_id: "adm",
        rotulo: "fal.ai: fal.ai sobe o preço do Kling",
        href: "/app/admin?aba=noticias&agente=ias",
      },
    ]);
  });

  it("o cron só repete o agente que não deu certo hoje", async () => {
    const pool = e.pool as { query: (s: string, p?: unknown[]) => Promise<unknown> };
    expect(await agentesPendentes()).toEqual(["concorrentes", "ias"]);
    await pool.query(
      `insert into noticias_admin_buscas (id, agente, erro, created_at) values
         ('n1', 'concorrentes', null, now() - interval '2 hours'),
         ('n2', 'ias', 'falhou', now())`,
    );
    expect(await agentesPendentes()).toEqual(["ias"]);
    expect((await listarNoticias("concorrentes")).ultimaBusca).not.toBeNull();
    expect((await listarNoticias("ias")).ultimaBusca).toBeNull();
  });
});
