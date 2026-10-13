import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Pontos contra um Postgres de verdade (PGlite, com todas as migrations): o
 * check-in, os créditos gastos e estornados, os primeiros passos, os posts e a
 * indicação rodam como em produção.
 */
const e = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/lib/db", () => ({ getPool: () => e.pool }));

import {
  carregarConta,
  debitar,
  estornar,
  estornarParcial,
} from "@/lib/creditos";
import {
  checkinLiberado,
  pontosDoCheckin,
  proximaSequencia,
} from "@/lib/pontos";
import {
  fazerCheckin,
  missaoCumprida,
  pontosPorIndicacao,
  pontosPorPost,
  resumoPontos,
} from "@/lib/pontos-server";

interface Resultado<T> {
  rows: T[];
  rowCount: number;
}
interface Pool {
  query<T = Record<string, unknown>>(
    sql: string,
    p?: unknown[],
  ): Promise<Resultado<T>>;
  connect(): Promise<{ query: Pool["query"]; release: () => void }>;
}

/** Uma consulta por vez, como uma conexão só (quem pega `connect` segura até soltar). */
function criarPool(db: PGlite): Pool {
  let fila: Promise<unknown> = Promise.resolve();
  const exclusivo = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = fila.then(fn, fn);
    fila = r.catch(() => {});
    return r;
  };
  const rodar = async <T>(sql: string, p?: unknown[]): Promise<Resultado<T>> => {
    const r = await db.query<T>(sql, p);
    return { rows: r.rows, rowCount: r.rows.length || (r.affectedRows ?? 0) };
  };
  return {
    query: (sql, p) => exclusivo(() => rodar(sql, p)),
    connect: () =>
      new Promise((pronto) => {
        void exclusivo(
          () =>
            new Promise<void>((soltar) =>
              pronto({ query: rodar, release: soltar }),
            ),
        );
      }),
  };
}

let pool: Pool;
const sql = <T = Record<string, unknown>>(texto: string, p?: unknown[]) =>
  pool.query<T>(texto, p).then((r) => r.rows);

beforeAll(async () => {
  const db = new PGlite();
  for (const f of readdirSync("db/migrations").sort())
    await db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
  pool = criarPool(db);
  e.pool = pool;
  Object.assign(process.env, {
    DATABASE_URL: "postgres://teste",
    BETTER_AUTH_SECRET: "segredo",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "segredo",
  });
}, 60_000);

let n = 0;
/** Conta nova com 300 créditos do plano. */
async function conta() {
  const id = `u${++n}`;
  await sql(
    `insert into "user" (id, name, email, "emailVerified") values ($1, $1, $2, true)`,
    [id, `${id}@exemplo.com`],
  );
  await carregarConta(id);
  await sql(
    `update creditos_conta set plano = 'starter', plano_expira_em = now() + interval '30 days',
       proxima_recarga_em = now() + interval '30 days', creditos_plano = 300, creditos_avulsos = 0
     where user_id = $1`,
    [id],
  );
  return id;
}
const saldo = async (id: string) => (await resumoPontos(id)).saldo;

describe("regras do check-in", () => {
  it("libera 24 horas depois do último; a sequência vale até 48 horas", () => {
    expect(checkinLiberado(null)).toBe(true);
    expect(checkinLiberado(23.9)).toBe(false);
    expect(checkinLiberado(24)).toBe(true);
    expect(proximaSequencia(3, 30)).toBe(4);
    expect(proximaSequencia(3, 48)).toBe(1);
    expect(proximaSequencia(0, null)).toBe(1);
  });

  it("o ciclo de 7 dias recomeça no oitavo", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(pontosDoCheckin)).toEqual([
      5, 5, 10, 10, 15, 15, 40, 5,
    ]);
  });
});

describe("check-in", () => {
  it("vale uma vez a cada 24 horas, mesmo com dois cliques juntos", async () => {
    const id = await conta();
    expect(await resumoPontos(id)).toMatchObject({
      saldo: 0,
      sequencia: 0,
      checkinHoje: false,
      dia: 0,
    });
    const r = await Promise.allSettled([fazerCheckin(id), fazerCheckin(id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(fazerCheckin(id)).rejects.toThrow(
      "Você já fez o check-in. O próximo libera 24 horas depois do último.",
    );
    const r2 = await resumoPontos(id);
    expect(r2).toMatchObject({
      saldo: 5,
      sequencia: 1,
      checkinHoje: true,
      dia: 0,
    });
    // O próximo libera 24 horas depois do clique (não à meia-noite).
    const falta = new Date(r2.proximoEm!).getTime() - Date.now();
    expect(falta).toBeGreaterThan(23.9 * 3_600_000);
    expect(falta).toBeLessThanOrEqual(24 * 3_600_000);
  });

  it("depois de 24 horas continua a sequência; passadas 48, volta ao dia 1", async () => {
    const id = await conta();
    await fazerCheckin(id);
    // Empurra os check-ins feitos para trás no tempo.
    const recuar = (horas: number) =>
      sql(
        `update pontos_mov set created_at = created_at - make_interval(hours => $2::int),
                chave = 'checkin:antigo-' || id
          where user_id = $1 and motivo = 'checkin'`,
        [id, horas],
      );
    await recuar(23);
    expect(await resumoPontos(id)).toMatchObject({ checkinHoje: true });
    await expect(fazerCheckin(id)).rejects.toThrow("Você já fez o check-in.");
    await recuar(2);
    expect(await resumoPontos(id)).toMatchObject({
      sequencia: 1,
      checkinHoje: false,
      proximoEm: null,
      dia: 1,
    });
    expect(await fazerCheckin(id)).toMatchObject({ pontos: 5, sequencia: 2 });
    await recuar(49);
    expect(await resumoPontos(id)).toMatchObject({ sequencia: 0, dia: 0 });
    expect(await fazerCheckin(id)).toMatchObject({ pontos: 5, sequencia: 1 });
    expect(await saldo(id)).toBe(15);
  });
});

describe("créditos gastos", () => {
  it("rendem 1 ponto por crédito; o estorno tira só o que aquela cobrança rendeu", async () => {
    const id = await conta();
    const a = (await debitar(id, 100, "video_troca"))!;
    const b = (await debitar(id, 20, "imagem"))!;
    expect(await saldo(id)).toBe(120);
    await estornarParcial(a, 30);
    expect(await saldo(id)).toBe(90);
    await estornar(a);
    // Só restavam 70 pontos desta cobrança: não tira 100.
    expect(await saldo(id)).toBe(20);
    await estornar(b);
    expect(await saldo(id)).toBe(0);
  });

  it("estorno de cobrança de antes dos pontos não tira nada", async () => {
    const id = await conta();
    await fazerCheckin(id);
    await estornar({ id: "antiga", userId: id, total: 50, doPlano: 50, doAvulso: 0 });
    expect(await saldo(id)).toBe(5);
  });
});

describe("primeiros passos, posts e indicação", () => {
  it("cada primeiro passo pontua uma vez", async () => {
    const id = await conta();
    await missaoCumprida(id, "primeira_imagem");
    await missaoCumprida(id, "primeira_imagem");
    await missaoCumprida(id, "plano");
    const r = await resumoPontos(id);
    expect(r.saldo).toBe(530);
    expect([...r.missoesFeitas].sort()).toEqual(["plano", "primeira_imagem"]);
  });

  it("post: 10 pontos, no máximo 3 por dia, mais o primeiro post", async () => {
    const id = await conta();
    for (const p of ["a", "b", "b", "c", "d"]) await pontosPorPost(id, p);
    // 3 posts × 10 + 100 do primeiro post; o repetido e o quarto não contam.
    expect(await saldo(id)).toBe(130);
  });

  it("indicação: uma vez por indicado", async () => {
    const quem = await conta();
    const indicado = await conta();
    await pontosPorIndicacao(quem, indicado);
    await pontosPorIndicacao(quem, indicado);
    expect(await saldo(quem)).toBe(1000);
  });

  it("sem a conta no banco, quem pontua não lança", async () => {
    await expect(missaoCumprida("nao-existe", "voz")).resolves.toBeUndefined();
  });
});
