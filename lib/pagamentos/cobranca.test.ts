import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { Keypair } from "@solana/web3.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Compra } from "./aplicar";
import { criarPagamentoUsdc, transacaoDoPagamento } from "./usdc";

/**
 * A criação da cobrança em USDC contra um Postgres de verdade (PGlite, em
 * memória, com todas as migrations): o valor único de cada cobrança em aberto
 * e o reuso da cobrança quando o modal é reaberto.
 */
const e = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/lib/db", () => ({ getPool: () => e.pool }));

type Resultado<T> = { rows: T[]; rowCount: number };
interface Pool {
  query<T = Record<string, unknown>>(sql: string, p?: unknown[]): Promise<Resultado<T>>;
  connect(): Promise<{ query: Pool["query"]; release(): void }>;
}

/**
 * Pool sobre a conexão única do PGlite. Quem pega um cliente (transação) fica
 * com a conexão até soltar — as outras consultas esperam, como num pool real.
 */
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
    SOLANA_MERCHANT_WALLET: Keypair.generate().publicKey.toBase58(),
    // O RPC do .env recusa tudo (allowlist), como o da Ankr.
    SOLANA_RPC_URL: "https://rpc.exemplo/chave",
    EVM_MERCHANT_WALLET: "0x1111111111111111111111111111111111111111",
  });
}, 60_000);

let n = 0;
async function conta() {
  const id = `u${++n}`;
  await sql(
    `insert into "user" (id, name, email, "emailVerified") values ($1, $1, $2, true)`,
    [id, `${id}@teste.dev`],
  );
  return id;
}

/** Cada teste usa um pacote de tamanho próprio: o preço não esbarra no dos outros. */
let creditos = 1000;
const compraNova = (): Compra => ({ tipo: "avulso", creditos: (creditos += 100) });
const criar = (userId: string, compra: Compra, rede: "solana" | "base" = "solana") =>
  criarPagamentoUsdc(userId, compra, "teste", rede);
const abertas = (userId: string) =>
  sql<{ id: string }>(
    "select id from pagamentos where user_id = $1 and status = 'pendente'",
    [userId],
  );

describe("cobrança em USDC", () => {
  it("dois pedidos da mesma conta no mesmo instante devolvem a mesma cobrança, sem erro", async () => {
    // É o que o modal faz em desenvolvimento (o React monta o efeito duas vezes).
    const u = await conta();
    const compra = compraNova();
    const [a, b] = await Promise.all([criar(u, compra), criar(u, compra)]);
    expect(b.id).toBe(a.id);
    expect(b.valorTexto).toBe(a.valorTexto);
    expect(b.link).toBe(a.link);
    expect(await abertas(u)).toHaveLength(1);
  });

  it("contas diferentes no mesmo instante ficam com valores diferentes", async () => {
    const compra = compraNova();
    const contas = [await conta(), await conta(), await conta()];
    const [a, b, c] = await Promise.all(contas.map((u) => criar(u, compra)));
    const base = compra.tipo === "avulso" ? compra.creditos * 0.03 : 0;
    expect([a.valor, b.valor, c.valor].sort()).toEqual(
      [0, 0.01, 0.02].map((extra) => Number((base + extra).toFixed(2))),
    );
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
  });

  it("reabrir o modal devolve a cobrança em aberto; paga ou antiga, cria outra", async () => {
    const u = await conta();
    const compra = compraNova();
    const primeira = await criar(u, compra);
    expect((await criar(u, compra)).id).toBe(primeira.id);
    // Outra rede, outra compra: cobranças próprias.
    expect((await criar(u, compra, "base")).id).not.toBe(primeira.id);
    expect((await criar(u, compraNova())).id).not.toBe(primeira.id);

    await sql("update pagamentos set status = 'pago' where id = $1", [primeira.id]);
    const segunda = await criar(u, compra);
    expect(segunda.id).not.toBe(primeira.id);
    // O valor da paga ficou livre: a nova volta ao preço cheio.
    expect(segunda.valorTexto).toBe(primeira.valorTexto);

    await sql(
      "update pagamentos set created_at = now() - interval '13 hours' where id = $1",
      [segunda.id],
    );
    const terceira = await criar(u, compra);
    expect(terceira.id).not.toBe(segunda.id);
    // A antiga ainda pode ser paga (vale 24h): o valor dela continua reservado.
    expect(terceira.valor).toBeCloseTo(segunda.valor + 0.01, 2);
  });

  it("a cobrança reaproveitada traz o mesmo link e a mesma transferência", async () => {
    const u = await conta();
    const compra = compraNova();
    const sol = await criar(u, compra);
    expect(sol.link).toContain(`amount=${sol.valorTexto}`);
    expect((await criar(u, compra)).link).toBe(sol.link);

    const base = await criar(u, compra, "base");
    expect(base.evm?.chainId).toBe(8453);
    expect(BigInt("0x" + base.evm!.dados.slice(-64))).toBe(
      BigInt(Math.round(base.valor * 1e6)),
    );
    expect((await criar(u, compra, "base")).evm).toEqual(base.evm);
  });
});

describe("pagar pela carteira conectada (Solana)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** O RPC do .env responde 403; o público responde `publico(método)`. */
  function rede(publico: (metodo: string) => object) {
    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      async (url: string, init: { body: string }) => {
        const { method } = JSON.parse(init.body) as { method: string };
        chamadas.push(`${new URL(url).host} ${method}`);
        return url.includes("rpc.exemplo")
          ? Response.json(
              { error: { code: -32079, message: "Origin not allowed" } },
              { status: 403 },
            )
          : Response.json({ jsonrpc: "2.0", id: 1, ...publico(method) });
      },
    );
    return chamadas;
  }
  const bloco = {
    result: {
      value: {
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 1,
      },
    },
  };

  it("com o RPC do .env recusando (allowlist), monta a transação pelo RPC público", async () => {
    const u = await conta();
    const cobranca = await criar(u, compraNova());
    const chamadas = rede((metodo) =>
      metodo === "getTokenAccountBalance"
        ? { result: { value: { amount: "900000000" } } }
        : bloco,
    );
    const r = await transacaoDoPagamento(
      cobranca.id,
      u,
      Keypair.generate().publicKey.toBase58(),
    );
    expect(r).toMatchObject({ cadeia: "solana:mainnet" });
    expect("transacao" in r && r.transacao.length).toBeGreaterThan(100);
    // Depois da primeira recusa, o RPC do .env é pulado.
    expect(chamadas).toEqual([
      "rpc.exemplo getTokenAccountBalance",
      "api.mainnet-beta.solana.com getTokenAccountBalance",
      "api.mainnet-beta.solana.com getLatestBlockhash",
    ]);
  });

  it("carteira sem USDC: avisa o saldo em vez de mandar para a carteira", async () => {
    const u = await conta();
    const cobranca = await criar(u, compraNova());
    rede((metodo) =>
      metodo === "getTokenAccountBalance"
        ? { error: { code: -32602, message: "Invalid param: could not find account" } }
        : bloco,
    );
    expect(
      await transacaoDoPagamento(
        cobranca.id,
        u,
        Keypair.generate().publicKey.toBase58(),
      ),
    ).toEqual({
      erro: `Esta carteira tem 0.00 USDC na Solana. A cobrança é de ${cobranca.valorTexto} USDC.`,
    });
  });

  it("cobrança de outra conta ou de outra rede não vira transação", async () => {
    const u = await conta();
    const compra = compraNova();
    const pagador = Keypair.generate().publicKey.toBase58();
    rede(() => bloco);
    const sol = await criar(u, compra);
    await expect(
      transacaoDoPagamento(sol.id, await conta(), pagador),
    ).rejects.toThrow("Pagamento não encontrado.");
    const base = await criar(u, compra, "base");
    expect(await transacaoDoPagamento(base.id, u, pagador)).toEqual({
      erro: "Esta cobrança não está mais em aberto. Feche e gere outra.",
    });
  });
});
