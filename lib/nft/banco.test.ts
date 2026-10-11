import { generateKeyPairSync, sign } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PublicKey } from "@solana/web3.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O NFT do influencer contra um Postgres de verdade (PGlite, em memória, com
 * TODAS as migrations aplicadas): o SQL de lib/nft, os créditos e os avisos
 * rodam como em produção. Só a rede (Solana, bundle.social) e o S3 são
 * simulados. É aqui que se confere, com banco, que nenhum caminho deixa
 * cobrança sem NFT, estorno em dobro, badge por viral alheio ou capa apagada.
 */
type Situacao = "finalizada" | "pendente" | "revertida" | "sem_registro";

const e = vi.hoisted(() => ({
  pool: null as unknown,
  simulacao: null as string | null,
  situacao: "finalizada" as Situacao,
  altura: 0,
  contaExiste: false,
  saldoSol: 1,
  /** Saldo da carteira do usuário (null = a rede não respondeu). */
  saldoCarteira: 1.5 as number | null,
  /** Keys lidas do S3 (a imagem que virou a capa do NFT). */
  lidas: [] as string[],
  transmitidas: 0,
  escritas: [] as Array<{ asset: string; badges: string[] }>,
  naRede: null as null | {
    dono: string;
    nome: string;
    uri: string;
    dados: { v: number; ficha: string; badges: string[] } | null;
  },
  contas: {} as Record<string, unknown[]>,
  proximo: 0,
  /** O que o leitor de links devolve para cada endereço (sem entrada = a leitura falha). */
  leituras: {} as Record<string, unknown>,
  /** Conta "logada" nas rotas (null = sem sessão). */
  sessao: null as string | null,
  /** O que as rotas agendaram para depois da resposta (after). */
  depois: [] as Array<() => unknown>,
  /** O RPC está apontando para outra rede (conferirAmbienteNft lança). */
  rpcErrado: false,
}));

vi.mock("@/lib/db", () => ({ getPool: () => e.pool }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    e.depois.push(fn);
  },
}));
vi.mock("./server", async () => {
  const { NextResponse } = await import("next/server");
  return {
    contextoNft: async () =>
      e.sessao
        ? { userId: e.sessao }
        : NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }),
  };
});
vi.mock("@/lib/social/metricas", async (original) => ({
  ...(await original<typeof import("@/lib/social/metricas")>()),
  atualizarMetricas: async () => null,
}));
vi.mock("./config", async (original) => {
  const real = await original<typeof import("./config")>();
  return {
    ...real,
    conferirAmbienteNft: async () => {
      if (e.rpcErrado)
        throw new real.ConfigNftError("O RPC do NFT não está na devnet.");
    },
    redeNft: () => "devnet",
    baseUrlNft: () => "https://app.exemplo",
    nftConfigurado: () => true,
  };
});
vi.mock("./core", () => ({
  montarMint: async () => {
    const n = ++e.proximo;
    return {
      asset: `ASSET${n}`,
      assinatura: `SIG${n}`,
      bytes: new Uint8Array([n]),
      validoAteBloco: 1_000,
    };
  },
  montarEscritaDeBadges: async (o: {
    asset: string;
    badges: Array<{ id: string }>;
  }) => {
    e.escritas.push({ asset: o.asset, badges: o.badges.map((b) => b.id) });
    return {
      assinatura: `ESCRITA${e.escritas.length}`,
      bytes: new Uint8Array([9]),
      validoAteBloco: 1_000,
    };
  },
  lerNftNaRede: async () => e.naRede,
}));
vi.mock("./rede", () => ({
  simular: async () => e.simulacao,
  transmitirEAcompanhar: async () => {
    e.transmitidas++;
    return e.situacao;
  },
  situacaoDaTransacao: async () => e.situacao,
  alturaFinalizada: async () => e.altura,
  contaExiste: async () => e.contaExiste,
  saldoDaChaveDeMint: async () => e.saldoSol,
  saldoDaCarteira: async () => e.saldoCarteira,
  chaveDeMintComSaldo: async () => e.saldoSol >= 0.02,
}));
vi.mock("@/lib/storage/s3", () => ({
  ownsKey: (u: string, k: string) => k.startsWith(`users/${u}/`),
  getObjectBuffer: async (_s3: unknown, key: string) => {
    e.lidas.push(key);
    return Buffer.from("imagem");
  },
  putObject: async () => {},
  getBucket: () => "balde",
  getS3: () => ({}),
}));
vi.mock("sharp", () => {
  const cadeia = {
    rotate: () => cadeia,
    resize: () => cadeia,
    jpeg: () => cadeia,
    toBuffer: async () => Buffer.from("jpeg"),
  };
  return { default: () => cadeia };
});
vi.mock("@/lib/social/link-apify", async () => {
  const { LinkError } = await import("@/lib/video/link");
  return {
    metricasDoLink: async (url: string) => {
      const lido = e.leituras[url];
      if (!lido) throw new LinkError("Não achei o post nesse link.");
      return lido;
    },
  };
});
vi.mock("@/lib/social/bundle", () => ({
  getBundle: () => ({}),
  contasDoTime: async (_b: unknown, teamId: string) => e.contas[teamId] ?? [],
}));

import { NextResponse } from "next/server";
import { definirEmTeste } from "@/lib/admin/em-teste-server";
import { emptyCharacter } from "@/lib/defaults";
import { debitar, carregarConta } from "@/lib/creditos";
import { limparUsuario } from "@/lib/storage/cleanup";
import type { ContaSocial } from "@/lib/social/bundle";
import { decidirBadge, painelNft } from "./admin";
import {
  conferirNaRede,
  gravarBadges,
  mintsComBadgesPendentes,
} from "./badges-server";
import { montarMensagem } from "./carteira";
import {
  carteiraDaConta,
  criarDesafio,
  desvincularCarteira,
  verificarDesafio,
} from "./carteira-server";
import { FOLGA_BLOCOS } from "./decisao";
import { estadoNft } from "./estado";
import { conferirMint, conferirMintsPendentes, mintar } from "./mint";
import {
  atualizarViewsDaConta,
  atualizarViewsDoPersonagem,
  autoresPendentes,
  concederPendentes,
  lerAutoresPendentes,
  MAX_TENTATIVAS_AUTOR,
  MOTIVOS,
} from "./views-server";

/* ------------------------------------------------------------------ */
/* Banco                                                                */
/* ------------------------------------------------------------------ */

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
  // O NFT nasce "só admin" (lib/em-teste.ts). Aqui fica liberado para todos; o
  // teste do recurso fechado fecha e reabre.
  await db.exec("insert into recursos_em_teste (recurso, so_admin) values ('nft', false)");
  pool = criarPool(db);
  e.pool = pool;
  // Login "configurado": os créditos passam a valer (lib/creditos.ts).
  Object.assign(process.env, {
    DATABASE_URL: "postgres://teste",
    BETTER_AUTH_SECRET: "segredo",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "segredo",
    // Leitura de posts por link "configurada" (o leitor em si é simulado acima).
    APIFY_TOKEN: "token-de-teste",
  });
}, 60_000);

let n = 0;
/** Conta nova, no plano Starter, com `creditos` créditos do plano. */
async function conta(creditos = 100, plano = "starter") {
  const id = `u${++n}`;
  await sql(`insert into "user" (id, name, email, "emailVerified") values ($1, $1, $2, true)`, [
    id,
    `${id}@exemplo.com`,
  ]);
  await carregarConta(id);
  await sql(
    `update creditos_conta set plano = $2, plano_expira_em = now() + interval '30 days',
       proxima_recarga_em = now() + interval '30 days', creditos_plano = $3, creditos_avulsos = 0
     where user_id = $1`,
    [id, plano, creditos],
  );
  return id;
}

/** Personagem completo (nome + referência salva) na conta, com o retrato gerado. */
async function personagem(userId: string, nome = "Lila Nova", o: { retrato?: boolean } = {}) {
  const c = emptyCharacter();
  c.id = `c${++n}`;
  c.identidade.nome = nome;
  c.identidade.bio = "Bio pública.";
  c.visual.referencias = [
    { id: "r", name: "r.jpg", dataUrl: "", size: 1, key: `users/${userId}/refs/r.jpg` },
  ];
  if (o.retrato !== false)
    c.geradas = [
      {
        id: "g",
        key: `users/${userId}/generated/retrato.jpg`,
        tipo: "retrato",
        estilo: "3d",
        qualidade: "padrao",
        size: 1,
        createdAt: 1,
      },
    ];
  await sql("insert into characters (id, user_id, data) values ($1, $2, $3)", [
    c.id,
    userId,
    JSON.stringify(c),
  ]);
  return c.id;
}

function carteiraDeTeste() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const bruto = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return {
    endereco: new PublicKey(bruto).toBase58(),
    assinar: (m: string) => new Uint8Array(sign(null, Buffer.from(m, "utf8"), privateKey)),
  };
}

async function vincular(userId: string, c = carteiraDeTeste()) {
  const d = await criarDesafio(userId, c.endereco);
  const r = await verificarDesafio(userId, d!.nonce, c.assinar(d!.mensagem));
  expect(r).toEqual({ endereco: c.endereco });
  return c;
}

const saldo = async (userId: string) => (await carregarConta(userId)).total;
const mints = (characterId: string) =>
  sql<{ id: string; status: string; estornado: boolean; asset: string; capa_key: string }>(
    "select id, status, estornado, asset, capa_key from nft_mints where character_id = $1 order by created_at",
    [characterId],
  );
const pedir = (userId: string, characterId: string) =>
  mintar({ userId, characterId, ip: "1.2.3.4", s3: {} as never });

async function codigo(r: unknown) {
  expect(r).toBeInstanceOf(NextResponse);
  const res = r as NextResponse;
  return { status: res.status, ...((await res.json()) as { code?: string }) };
}

beforeEach(() => {
  Object.assign(e, {
    simulacao: null,
    situacao: "finalizada",
    altura: 0,
    contaExiste: false,
    saldoSol: 1,
    saldoCarteira: 1.5,
    lidas: [],
    transmitidas: 0,
    escritas: [],
    naRede: null,
    contas: {},
    sessao: null,
    depois: [],
    leituras: {},
    rpcErrado: false,
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/* ------------------------------------------------------------------ */
/* Carteira                                                             */
/* ------------------------------------------------------------------ */

describe("carteira vinculada à conta", () => {
  it("vincula com a assinatura do desafio, e o desafio não serve duas vezes", async () => {
    const u = await conta();
    const c = carteiraDeTeste();
    const d = (await criarDesafio(u, c.endereco))!;
    const assinatura = c.assinar(d.mensagem);
    expect(await verificarDesafio(u, d.nonce, assinatura)).toEqual({ endereco: c.endereco });
    expect(await carteiraDaConta(u)).toBe(c.endereco);
    // a mesma assinatura, de novo: o código já foi gasto
    expect(await verificarDesafio(u, d.nonce, assinatura)).toHaveProperty("erro");
  });

  it("recusa assinatura de outra carteira, e o desafio é gasto mesmo assim", async () => {
    const u = await conta();
    const vitima = carteiraDeTeste();
    const atacante = carteiraDeTeste();
    const d = (await criarDesafio(u, vitima.endereco))!;
    expect(await verificarDesafio(u, d.nonce, atacante.assinar(d.mensagem))).toHaveProperty("erro");
    expect(await carteiraDaConta(u)).toBeNull();
    expect(await verificarDesafio(u, d.nonce, vitima.assinar(d.mensagem))).toHaveProperty("erro");
  });

  it("o desafio de uma conta não serve para outra, nem depois de vencido", async () => {
    const a = await conta();
    const b = await conta();
    const c = carteiraDeTeste();
    const d = (await criarDesafio(a, c.endereco))!;
    expect(await verificarDesafio(b, d.nonce, c.assinar(d.mensagem))).toHaveProperty("erro");
    const vencido = (await criarDesafio(a, c.endereco))!;
    await sql("update carteira_desafios set expira_em = now() - interval '1 second' where nonce = $1", [
      vencido.nonce,
    ]);
    expect(await verificarDesafio(a, vencido.nonce, c.assinar(vencido.mensagem))).toHaveProperty("erro");
    expect(await carteiraDaConta(a)).toBeNull();
  });

  it("assinatura sobre outra mensagem (mesma carteira) não vincula", async () => {
    const u = await conta();
    const c = carteiraDeTeste();
    const d = (await criarDesafio(u, c.endereco))!;
    const outra = montarMensagem({
      site: "site-falso.exemplo",
      endereco: c.endereco,
      nonce: d.nonce,
      emitidoEm: new Date(),
    });
    expect(await verificarDesafio(u, d.nonce, c.assinar(outra))).toHaveProperty("erro");
  });

  it("endereço que não é de carteira não ganha desafio", async () => {
    const u = await conta();
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("x")],
      new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"),
    );
    expect(await criarDesafio(u, pda.toBase58())).toBeNull();
    expect(await criarDesafio(u, "não é endereço")).toBeNull();
  });

  it("a mesma carteira não fica em duas contas: vale a última prova", async () => {
    const a = await conta();
    const b = await conta();
    const c = await vincular(a);
    await vincular(b, c);
    expect(await carteiraDaConta(b)).toBe(c.endereco);
    expect(await carteiraDaConta(a)).toBeNull();
    // trocar de carteira e desvincular
    const nova = await vincular(b);
    expect(await carteiraDaConta(b)).toBe(nova.endereco);
    await desvincularCarteira(b);
    expect(await carteiraDaConta(b)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Mint                                                                 */
/* ------------------------------------------------------------------ */

describe("mint, com créditos de verdade", () => {
  it("minta: cobra 10 créditos, registra a declaração, guarda a capa e avisa", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    const c = await vincular(u);
    const r = (await pedir(u, p)) as { mint: { status: string; carteira: string; asset: string } };
    expect(r.mint.status).toBe("confirmado");
    expect(r.mint.carteira).toBe(c.endereco);
    expect(await saldo(u)).toBe(90);
    const [m] = await mints(p);
    expect(m.capa_key).toBe(`users/${u}/nft/${m.id}.jpg`);
    expect(
      await sql("select tipo, ip from consentimentos where user_id = $1 and character_id = $2", [u, p]),
    ).toEqual([{ tipo: "nft_mint", ip: "1.2.3.4" }]);
    expect(await sql("select motivo, delta, ref from creditos_mov where user_id = $1 and motivo = 'nft_mint'", [u])).toEqual([
      { motivo: "nft_mint", delta: -10, ref: m.id },
    ]);
    expect(await sql("select erro, chave from avisos where user_id = $1", [u])).toEqual([
      { erro: false, chave: `nft:${m.id}` },
    ]);
  });

  it("plano grátis não minta; sem créditos não minta e nada é enviado", async () => {
    const gratis = await conta(0, "gratis");
    const pg = await personagem(gratis);
    await vincular(gratis);
    expect(await codigo(await pedir(gratis, pg))).toMatchObject({ status: 403, code: "PLANO" });

    const pobre = await conta(9);
    const pp = await personagem(pobre);
    await vincular(pobre);
    expect(await codigo(await pedir(pobre, pp))).toMatchObject({ status: 402, code: "SEM_CREDITOS" });
    expect(e.transmitidas).toBe(0);
    expect(await saldo(pobre)).toBe(9);
    expect((await mints(pp)).map((m) => m.status)).toEqual(["falhou"]);
  });

  it("sem retrato gerado não minta: a referência enviada nunca vira a imagem pública", async () => {
    const u = await conta(100);
    const p = await personagem(u, "Sem Retrato", { retrato: false });
    await vincular(u);
    expect(await codigo(await pedir(u, p))).toMatchObject({ status: 400, code: "SEM_RETRATO" });
    expect(await mints(p)).toEqual([]);
    expect(e.lidas).toEqual([]);
    expect(await saldo(u)).toBe(100);
  });

  it("a cobrança e o lançamento no extrato saem juntos; sem saldo, nenhum dos dois", async () => {
    const u = await conta(15);
    const extrato = (ref: string) =>
      sql(
        "select delta, do_plano, do_avulso from creditos_mov where user_id = $1 and motivo = 'nft_mint' and ref = $2",
        [u, ref],
      );
    expect(await debitar(u, 10, "nft_mint", "ref_1")).toMatchObject({
      userId: u,
      total: 10,
      doPlano: 10,
      doAvulso: 0,
    });
    expect(await saldo(u)).toBe(5);
    expect(await extrato("ref_1")).toEqual([{ delta: -10, do_plano: -10, do_avulso: 0 }]);
    expect(await debitar(u, 10, "nft_mint", "ref_2")).toBeNull();
    expect(await saldo(u)).toBe(5);
    expect(await extrato("ref_2")).toEqual([]);
    // plano e avulsos: gasta o plano primeiro, e o extrato diz de onde saiu
    await sql(
      "update creditos_conta set creditos_avulsos = 20, avulsos_expira_em = now() + interval '30 days' where user_id = $1",
      [u],
    );
    const misto = (await debitar(u, 12, "nft_mint"))!;
    expect(misto).toMatchObject({ total: 12, doPlano: 5, doAvulso: 7 });
    expect(await saldo(u)).toBe(13);
    expect(await extrato(misto.id)).toEqual([{ delta: -12, do_plano: -5, do_avulso: -7 }]);
  });

  it("personagem de outra conta não minta", async () => {
    const dono = await conta();
    const p = await personagem(dono);
    const outro = await conta();
    await vincular(outro);
    expect(await codigo(await pedir(outro, p))).toMatchObject({ status: 404 });
    expect(await mints(p)).toEqual([]);
  });

  it("um NFT por personagem: o segundo pedido é recusado, e o índice único barra a corrida", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    await pedir(u, p);
    expect(await codigo(await pedir(u, p))).toMatchObject({ status: 409, code: "JA_MINTADO" });
    expect(await saldo(u)).toBe(90);
    // direto no banco: um segundo mint vivo para o mesmo personagem não entra
    await expect(
      sql(
        `insert into nft_mints (id, user_id, character_id, carteira, asset, rede, nome, ficha_hash)
         values ('nft_x', $1, $2, 'c', 'OUTRO', 'devnet', 'n', 'h')`,
        [u, p],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("vinte pedidos ao mesmo tempo: um NFT, uma cobrança", async () => {
    const u = await conta(1_000);
    const p = await personagem(u);
    await vincular(u);
    const respostas = await Promise.all(Array.from({ length: 20 }, () => pedir(u, p)));
    expect(respostas.filter((r) => !(r instanceof NextResponse))).toHaveLength(1);
    expect(await saldo(u)).toBe(990);
    expect(e.transmitidas).toBe(1);
    expect((await mints(p)).filter((m) => m.status !== "falhou")).toHaveLength(1);
  });

  it("a simulação recusa: nada cobrado, nada enviado", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    e.simulacao = "erro da rede";
    expect(await codigo(await pedir(u, p))).toMatchObject({ status: 502 });
    expect(await saldo(u)).toBe(100);
    expect(e.transmitidas).toBe(0);
  });

  it("enviado e nunca registrado: espera dentro do prazo; depois falha e devolve UMA vez", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    e.situacao = "sem_registro";
    const r = (await pedir(u, p)) as { mint: { id: string; status: string } };
    expect(r.mint.status).toBe("enviado");
    expect(await saldo(u)).toBe(90);

    e.altura = 1_000 + FOLGA_BLOCOS; // ainda dentro da folga
    expect((await conferirMint(r.mint.id))?.status).toBe("enviado");
    expect(await saldo(u)).toBe(90);

    e.altura = 1_000 + FOLGA_BLOCOS + 1;
    expect((await conferirMint(r.mint.id))?.status).toBe("falhou");
    await conferirMint(r.mint.id);
    await Promise.all([conferirMint(r.mint.id), conferirMintsPendentes()]);
    expect(await saldo(u)).toBe(100);
    expect(
      await sql("select count(*)::int as n from creditos_mov where user_id = $1 and motivo like 'estorno%'", [u]),
    ).toEqual([{ n: 1 }]);
    expect((await mints(p))[0]).toMatchObject({ status: "falhou", estornado: true });
    // e pode tentar de novo
    e.situacao = "finalizada";
    expect(((await pedir(u, p)) as { mint: { status: string } }).mint.status).toBe("confirmado");
    expect(await saldo(u)).toBe(90);
  });

  it("estorno que parou no meio (lançado no extrato, linha sem a marca) não sai de novo", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    e.situacao = "sem_registro";
    const r = (await pedir(u, p)) as { mint: { id: string } };
    expect(await saldo(u)).toBe(90);
    // estado deixado por uma queda antiga: o estorno já está no extrato e no saldo
    const [{ cobranca }] = await sql<{ cobranca: { id: string } }>(
      "select cobranca from nft_mints where id = $1",
      [r.mint.id],
    );
    await sql(
      `insert into creditos_mov (id, user_id, delta, do_plano, do_avulso, motivo, ref)
       values ($1, $2, 10, 10, 0, 'estorno', $3)`,
      [`mov_${r.mint.id}`, u, cobranca.id],
    );
    await sql("update creditos_conta set creditos_plano = creditos_plano + 10 where user_id = $1", [u]);
    e.altura = 1_000 + FOLGA_BLOCOS + 1;
    expect((await conferirMint(r.mint.id))?.status).toBe("falhou");
    await conferirMintsPendentes();
    expect(await saldo(u)).toBe(100);
    expect((await mints(p))[0]).toMatchObject({ status: "falhou", estornado: true });
    expect(
      await sql("select count(*)::int as n from creditos_mov where user_id = $1 and motivo like 'estorno%'", [u]),
    ).toEqual([{ n: 1 }]);
  });

  it("mint de outra rede no mesmo banco: não é julgado, não trava o personagem e não entra na fila de badges", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    // o mesmo personagem tem um mint em andamento na mainnet (este app está em devnet)
    const outro = `nft_main_${p}`;
    await sql(
      `insert into nft_mints (id, user_id, character_id, carteira, asset, rede, nome, ficha_hash, status, assinatura, valido_ate_bloco, cobranca)
       values ($1, $2, $3, 'c', $4, 'mainnet', 'Lila', 'h', 'enviado', $5, 1000, $6)`,
      [
        outro,
        u,
        p,
        `ASSET_MAIN_${p}`,
        `SIG_MAIN_${p}`,
        JSON.stringify({ id: `cob_${p}`, userId: u, total: 10, doPlano: 10, doAvulso: 0 }),
      ],
    );
    const daOutra = () =>
      sql("select status, estornado from nft_mints where id = $1", [outro]).then((l) => l[0]);
    // nesta rede a assinatura é desconhecida e o prazo "passou": sem olhar a rede da linha, viraria falha com estorno
    e.situacao = "sem_registro";
    e.altura = 99_999_999;
    expect((await conferirMint(outro))?.status).toBe("enviado");
    await conferirMintsPendentes();
    expect(await daOutra()).toEqual({ status: "enviado", estornado: false });
    expect(await saldo(u)).toBe(100);

    // o personagem minta normalmente nesta rede
    e.situacao = "finalizada";
    e.altura = 0;
    const r = (await pedir(u, p)) as { mint: { id: string; status: string; rede: string } };
    expect(r.mint).toMatchObject({ status: "confirmado", rede: "devnet" });
    expect((await estadoNft(u, p)).mint).toMatchObject({ id: r.mint.id, rede: "devnet" });

    // badges: o NFT da outra rede não entra na fila nem é escrito daqui
    await sql("update nft_mints set status = 'confirmado' where id = $1", [outro]);
    await sql(
      "insert into nft_badges (character_id, badge, user_id, views, status) values ($1, 'views_5k', $2, 5000, 'concedido')",
      [p, u],
    );
    const fila = await mintsComBadgesPendentes(500);
    expect(fila).toContain(r.mint.id);
    expect(fila).not.toContain(outro);
    expect(await gravarBadges(outro)).toBe("ocupado");
    expect(e.escritas).toEqual([]);
  });

  it("prazo vencido mas a conta do NFT existe: confirma e não devolve", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    e.situacao = "sem_registro";
    const r = (await pedir(u, p)) as { mint: { id: string } };
    e.altura = 99_999;
    e.contaExiste = true;
    expect((await conferirMint(r.mint.id))?.status).toBe("confirmado");
    expect(await saldo(u)).toBe(90);
  });

  it("cobrado mas o servidor caiu antes de gravar: o cron acha a cobrança no extrato e devolve", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    // estado deixado pela queda: linha "preparando" antiga, sem cobrança gravada, com o débito no extrato
    await sql(
      `insert into nft_mints (id, user_id, character_id, carteira, asset, rede, nome, ficha_hash, created_at)
       values ('nft_caiu', $1, $2, 'c', 'ASSET_CAIU', 'devnet', 'Lila', 'h', now() - interval '11 minutes')`,
      [u, p],
    );
    await debitar(u, 10, "nft_mint", "nft_caiu");
    expect(await saldo(u)).toBe(90);
    await conferirMintsPendentes();
    expect(await saldo(u)).toBe(100);
    expect((await mints(p))[0]).toMatchObject({ status: "falhou", estornado: true });
    await conferirMintsPendentes();
    expect(await saldo(u)).toBe(100);
  });

  it("mint recém-começado não é dado como falho pelo cron", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await sql(
      `insert into nft_mints (id, user_id, character_id, carteira, asset, rede, nome, ficha_hash)
       values ('nft_novo', $1, $2, 'c', 'ASSET_NOVO', 'devnet', 'Lila', 'h')`,
      [u, p],
    );
    await conferirMintsPendentes();
    expect((await mints(p))[0].status).toBe("preparando");
  });

  it("conta apagada: o registro do NFT fica, sem dono", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    await pedir(u, p);
    await sql(`delete from "user" where id = $1`, [u]);
    expect(await sql("select user_id, status from nft_mints where character_id = $1", [p])).toEqual([
      { user_id: null, status: "confirmado" },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Números que contam e badges                                          */
/* ------------------------------------------------------------------ */

const contaRede = (rede: ContaSocial["rede"], usuario: string, idExterno: string | null = null): ContaSocial => ({
  rede,
  usuario,
  nome: null,
  avatar: null,
  idExterno,
});

let np = 0;
/**
 * Post publicado, com as leituras da rede gravadas. A ordem de cadastro (quem é
 * o "primeiro link") segue a ordem das chamadas. `autor` não informado = ainda
 * não lido.
 */
async function post(
  userId: string,
  characterId: string,
  o: {
    rede?: string;
    views?: number;
    link?: string;
    manual?: boolean;
    autor?: string | null;
    viewsManual?: number;
    curtidas?: number;
    comentarios?: number;
    reposts?: number;
    quotes?: number;
    salvos?: number;
  },
) {
  const id = `p${++np}`;
  const rede = o.rede ?? "TIKTOK";
  await sql(
    `insert into posts_agendados (id, user_id, character_id, bundle_post_id, redes, post_date, status, links, manual, autor, created_at)
     values ($1, $2, $3, $4, $5, now(), 'POSTED', $6, $7, $8, to_timestamp($9))`,
    [
      id,
      userId,
      characterId,
      o.manual ? null : `b_${id}`,
      [rede],
      o.link ? JSON.stringify({ [rede]: o.link }) : null,
      !!o.manual,
      o.autor ?? null,
      1_700_000_000 + np,
    ],
  );
  await sql(
    `insert into posts_metricas (post_id, rede, views, curtidas, comentarios, reposts, quotes, salvos, views_manual)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      rede,
      o.views ?? 0,
      o.curtidas ?? 0,
      o.comentarios ?? 0,
      o.reposts ?? 0,
      o.quotes ?? 0,
      o.salvos ?? 0,
      o.viewsManual ?? null,
    ],
  );
  return id;
}
const lerViews = async (id: string, views: number) =>
  sql("update posts_metricas set views = $2 where post_id = $1", [id, views]);
const badges = (characterId: string) =>
  sql<{ badge: string; status: string }>(
    "select badge, status from nft_badges where character_id = $1 order by views, badge",
    [characterId],
  ).then((l) => Object.fromEntries(l.map((b) => [b.badge, b.status])));
const motivos = (characterId: string) =>
  sql<{ badge: string; motivo: string | null }>(
    "select badge, motivo from nft_badges where character_id = $1",
    [characterId],
  ).then((l) => Object.fromEntries(l.map((b) => [b.badge, b.motivo])));

let nc = 0;
/** Conta de rede nova: cada conta serve a um personagem só, então cada teste usa a sua. */
function novaConta(rede: ContaSocial["rede"] = "TIKTOK") {
  const i = ++nc;
  return {
    /** Como o bundle.social a devolve quando está conectada. */
    conectada: [contaRede(rede, `lila${i}`, `77${i}`)],
    /** Como o scraper a devolve como autor de um post. */
    autor: `lila${i} id:77${i}`,
    arroba: `lila${i}`,
    link: (post: number) => `https://www.tiktok.com/@lila${i}/video/${i}000${post}`,
  };
}
const contar = (u: string, p: string, conectadas: ContaSocial[] = []) =>
  atualizarViewsDoPersonagem(pool as never, u, p, conectadas);
const total = (u: string, p: string, conectadas: ContaSocial[] = []) =>
  contar(u, p, conectadas).then((r) => r.totais.views);

describe("números que contam e badges", () => {
  it("post do app conta pela conta conectada, e o badge sai na marca exata", async () => {
    const u = await conta();
    const p = await personagem(u);
    const { conectada } = novaConta();
    const a = await post(u, p, { views: 3_000 });
    await post(u, p, { views: 1_999 });
    expect(await total(u, p, conectada)).toBe(4_999);
    expect(await badges(p)).toEqual({});
    await lerViews(a, 3_001);
    expect(await total(u, p, conectada)).toBe(5_000);
    expect(await badges(p)).toEqual({ views_5k: "concedido" });
    expect(await sql("select chave from avisos where user_id = $1", [u])).toEqual([
      { chave: `badge:${p}:views_5k` },
    ]);
  });

  it("recurso fechado para a conta: o badge é concedido, mas o sino não anuncia a tela que ela não abre", async () => {
    await definirEmTeste("nft", true, "teste");
    try {
      const u = await conta();
      const p = await personagem(u);
      const { conectada } = novaConta();
      await post(u, p, { views: 6_000 });
      expect(await total(u, p, conectada)).toBe(6_000);
      expect(await badges(p)).toEqual({ views_5k: "concedido" });
      expect(await sql("select chave from avisos where user_id = $1", [u])).toEqual([]);
    } finally {
      await definirEmTeste("nft", false, "teste");
    }
  });

  it("post do app numa rede sem conta conectada não conta, e a tela fica sabendo por quê", async () => {
    const u = await conta();
    const p = await personagem(u);
    await post(u, p, { views: 80_000 });
    const r = await contar(u, p);
    expect(r.totais.views).toBe(0);
    expect(r.resumo).toMatchObject({ posts: 1, contam: 0, semConta: 1, contas: [] });
    expect(await badges(p)).toEqual({});
  });

  it("o autor do primeiro link vira a conta do influencer; link de outra conta não conta", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    const outra = novaConta();
    await post(u, p, { manual: true, views: 3_000, link: minha.link(1), autor: minha.autor });
    await post(u, p, { manual: true, views: 900_000, link: outra.link(1), autor: outra.autor });
    let r = await contar(u, p);
    expect(r.totais.views).toBe(3_000);
    expect(r.resumo).toMatchObject({
      posts: 2,
      contam: 1,
      outraConta: 1,
      contas: [{ rede: "TIKTOK", usuario: minha.arroba, origem: "link" }],
    });
    expect(await badges(p)).toEqual({});
    // outro post da MESMA conta soma
    await post(u, p, { manual: true, views: 2_500, link: minha.link(2), autor: minha.autor });
    r = await contar(u, p);
    expect(r.totais.views).toBe(5_500);
    expect(await badges(p)).toEqual({ views_5k: "concedido" });
  });

  it("cada rede tem a sua conta: o primeiro link de cada uma", async () => {
    const u = await conta();
    const p = await personagem(u);
    const tk = novaConta("TIKTOK");
    await post(u, p, { rede: "TIKTOK", manual: true, views: 1_000, link: tk.link(1), autor: tk.autor });
    await post(u, p, {
      rede: "TWITTER",
      manual: true,
      views: 2_000,
      link: `https://x.com/dev_${p}/status/1${np}`,
      autor: `dev_${p.toLowerCase()} id:x${p}`,
    });
    const r = await contar(u, p);
    expect(r.totais.views).toBe(3_000);
    expect(r.resumo.contas.map((c) => c.rede).sort()).toEqual(["TIKTOK", "TWITTER"]);
  });

  it("viral alheio colado como primeiro link vira a conta, mas só rende as marcas baixas sem conferência", async () => {
    const u = await conta();
    const p = await personagem(u);
    const famoso = novaConta();
    await post(u, p, { manual: true, views: 250_000_000, link: famoso.link(1), autor: famoso.autor });
    expect(await total(u, p)).toBe(250_000_000);
    expect(await badges(p)).toEqual({
      views_5k: "concedido",
      views_10k: "concedido",
      views_50k: "concedido",
      views_100k: "aguardando",
      views_500k: "aguardando",
      views_1m: "aguardando",
      views_5m: "aguardando",
      views_10m: "aguardando",
      views_50m: "aguardando",
      views_100m: "aguardando",
    });
    const m = await motivos(p);
    expect(m.views_100k).toBe(MOTIVOS.semConexao);
    expect(m.views_1m).toBe(MOTIVOS.marcaAlta);
    // o dono de verdade, colando só um link, não ganha a conta: link contra link, vale quem chegou primeiro
    const dono = await conta();
    const dele = await personagem(dono, "Dono de verdade");
    await post(dono, dele, { manual: true, views: 40_000, link: famoso.link(2), autor: famoso.autor });
    let r = await contar(dono, dele);
    expect(r.totais.views).toBe(0);
    expect(r.resumo).toMatchObject({ outroPersonagem: 1, contas: [] });
    // mas conectando a conta (login na rede) ela é dele: o que o outro ganhou com ela sai
    r = await contar(dono, dele, famoso.conectada);
    expect(r.totais.views).toBe(40_000);
    expect(r.resumo.contas).toEqual([{ rede: "TIKTOK", usuario: famoso.arroba, origem: "conectada" }]);
    expect(await badges(p)).toEqual({});
    expect((await contar(u, p)).resumo).toMatchObject({ contam: 0, outroPersonagem: 1, contas: [] });
  });

  it("conta só pelo link: de 100 mil para cima espera conferência; conectando a conta, sai sozinho", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    await post(u, p, { manual: true, views: 150_000, link: minha.link(1), autor: minha.autor });
    expect(await total(u, p)).toBe(150_000);
    expect(await badges(p)).toEqual({
      views_5k: "concedido",
      views_10k: "concedido",
      views_50k: "concedido",
      views_100k: "aguardando",
    });
    // o dono conecta a mesma conta (login na rede): a prova passa a ser forte
    const r = await contar(u, p, minha.conectada);
    expect(r.resumo.contas).toEqual([{ rede: "TIKTOK", usuario: minha.arroba, origem: "conectada" }]);
    expect(await badges(p)).toMatchObject({ views_100k: "concedido" });
    expect((await motivos(p)).views_100k).toBeNull();
  });

  const NADA_A_LER = { agora: 0, depois: 0, rodada: false };
  /** O que o leitor de links (Apify) devolve para um post. */
  const lido = (views: number, autor?: string) => ({
    rede: "TIKTOK",
    metricas: { views, curtidas: 10, comentarios: 1, reposts: 0, quotes: 0, salvos: 0 },
    quando: null,
    texto: "",
    autor,
  });

  it("post por link sem autor lido não conta; lido o autor na rede, conta", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    const a = await post(u, p, { manual: true, views: 4_000, link: minha.link(1) });
    const b = await post(u, p, { manual: true, views: 3_000, link: minha.link(2) });
    let r = await contar(u, p);
    expect(r.totais.views).toBe(0);
    expect(r.resumo).toMatchObject({ semAutor: 2, contas: [] });
    expect(await autoresPendentes(pool as never, u, p)).toEqual({ agora: 2, depois: 0, rodada: false });
    expect((await estadoNft(u, p)).lendoAutores).toBe(true);

    e.leituras[minha.link(1)] = lido(4_200, minha.autor);
    // o segundo: a rede não informou quem publicou
    e.leituras[minha.link(2)] = lido(3_000, "");
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(2);
    expect(
      await sql(
        "select id, autor, autor_tentativas::int as tentativas from posts_agendados where id = any($1) order by created_at",
        [[a, b]],
      ),
    ).toEqual([
      { id: a, autor: minha.autor, tentativas: 1 },
      { id: b, autor: "", tentativas: 1 },
    ]);
    r = await contar(u, p);
    expect(r.totais).toMatchObject({ views: 4_200, curtidas: 10, comentarios: 1 });
    expect(r.resumo).toMatchObject({ contam: 1, semAutor: 0, autorOculto: 1 });
    expect(await autoresPendentes(pool as never, u, p)).toEqual(NADA_A_LER);
    expect(await estadoNft(u, p)).toMatchObject({ lendoAutores: false, autoresDepois: 0 });

    // a vez é liberada no fim da rodada: um link novo é lido em seguida
    const c = await post(u, p, { manual: true, views: 900, link: minha.link(3) });
    e.leituras[minha.link(3)] = lido(900, minha.autor);
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(1);
    expect(await sql("select autor from posts_agendados where id = $1", [c])).toEqual([{ autor: minha.autor }]);

    // duas rodadas ao mesmo tempo não acontecem: enquanto uma lê, a outra não começa
    await post(u, p, { manual: true, views: 100, link: minha.link(4) });
    await sql("update nft_views set autores_em = now() where character_id = $1", [p]);
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(0);
    expect(await autoresPendentes(pool as never, u, p)).toEqual({ agora: 1, depois: 0, rodada: true });
    // rodada que não terminou (a função foi derrubada no meio) libera a vez sozinha
    await sql("update nft_views set autores_em = now() - interval '4 minutes' where character_id = $1", [p]);
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(1);
  });

  it("leitura que falha: tenta de novo mais tarde, no máximo três vezes, e aí desiste", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    const a = await post(u, p, { manual: true, views: 4_000, link: minha.link(1) });
    const doPost = async () =>
      (
        await sql<{ autor: string | null; tentativas: number }>(
          "select autor, autor_tentativas::int as tentativas from posts_agendados where id = $1",
          [a],
        )
      )[0];
    const passarDezMinutos = () =>
      sql("update posts_agendados set autor_tentado_em = now() - interval '11 minutes' where id = $1", [a]);

    // sem leitura cadastrada: o leitor simulado falha como o Apify falharia
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(1);
    expect(await doPost()).toEqual({ autor: null, tentativas: 1 });
    // logo em seguida não tenta de novo: cada tentativa é uma execução paga
    expect(await autoresPendentes(pool as never, u, p)).toEqual({ agora: 0, depois: 1, rodada: false });
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(0);
    expect((await doPost()).tentativas).toBe(1);
    expect((await contar(u, p)).resumo).toMatchObject({ semAutor: 1, autorOculto: 0 });
    // a tela não fica "lendo": sabe que há uma tentativa para depois
    expect(await estadoNft(u, p)).toMatchObject({ lendoAutores: false, autoresDepois: 1 });

    await passarDezMinutos();
    expect(await autoresPendentes(pool as never, u, p)).toEqual({ agora: 1, depois: 0, rodada: false });
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(1);
    expect(await doPost()).toEqual({ autor: null, tentativas: 2 });

    await passarDezMinutos();
    // terceira e última: desiste, e o post para de ser tentado
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(1);
    expect(await doPost()).toEqual({ autor: "", tentativas: MAX_TENTATIVAS_AUTOR });
    expect(await autoresPendentes(pool as never, u, p)).toEqual(NADA_A_LER);
    await passarDezMinutos();
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(0);
    expect((await doPost()).tentativas).toBe(MAX_TENTATIVAS_AUTOR);
    expect((await contar(u, p)).resumo).toMatchObject({ semAutor: 0, autorOculto: 1 });
    expect(await estadoNft(u, p)).toMatchObject({ lendoAutores: false, autoresDepois: 0 });
  });

  it("leitura que dá certo na segunda tentativa: o post passa a contar", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    const a = await post(u, p, { manual: true, views: 5_100, link: minha.link(1) });
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(1); // falha
    await sql("update posts_agendados set autor_tentado_em = now() - interval '11 minutes' where id = $1", [a]);
    e.leituras[minha.link(1)] = lido(5_300, minha.autor);
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(1);
    expect(await total(u, p)).toBe(5_300);
    expect(await badges(p)).toEqual({ views_5k: "concedido" });
  });

  it("post do LinkedIn por link nunca tem autor: não conta, e a tela não fica esperando", async () => {
    const u = await conta();
    const p = await personagem(u);
    await post(u, p, {
      rede: "LINKEDIN",
      manual: true,
      views: 0,
      curtidas: 12,
      link: `https://www.linkedin.com/posts/lila_y-activity-72480000000000${np}-cd`,
    });
    const r = await contar(u, p);
    expect(r.totais.curtidas).toBe(0);
    expect(r.resumo).toMatchObject({ posts: 1, contam: 0, semAutor: 0, autorOculto: 1 });
    expect(await autoresPendentes(pool as never, u, p)).toEqual(NADA_A_LER);
    expect(await estadoNft(u, p)).toMatchObject({ lendoAutores: false, autoresDepois: 0 });
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(0);
  });

  it("o primeiro link é o primeiro CADASTRADO: enquanto o autor dele não é lido, a rede fica sem conta", async () => {
    const u = await conta();
    const p = await personagem(u);
    const primeira = novaConta();
    const segunda = novaConta();
    await post(u, p, { manual: true, views: 2_000, link: primeira.link(1) }); // autor ainda não lido
    await post(u, p, { manual: true, views: 90_000, link: segunda.link(1), autor: segunda.autor });
    let r = await contar(u, p);
    expect(r.totais.views).toBe(0);
    expect(r.resumo).toMatchObject({ contam: 0, semAutor: 2, outraConta: 0, contas: [] });
    expect(await badges(p)).toEqual({});

    e.leituras[primeira.link(1)] = lido(2_000, primeira.autor);
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(1);
    r = await contar(u, p);
    expect(r.totais.views).toBe(2_000);
    expect(r.resumo).toMatchObject({
      contam: 1,
      semAutor: 0,
      outraConta: 1,
      contas: [{ rede: "TIKTOK", usuario: primeira.arroba, origem: "link" }],
    });
    expect(await badges(p)).toEqual({});
  });

  it("os autores são lidos na ordem em que os links foram cadastrados, seis por rodada", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    const ids: string[] = [];
    for (let i = 1; i <= 8; i++) {
      // os últimos têm mais views: não passam na frente
      ids.push(await post(u, p, { manual: true, views: i * 1_000, link: minha.link(i) }));
      e.leituras[minha.link(i)] = lido(i * 1_000, minha.autor);
    }
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(6);
    const lidos = await sql<{ id: string }>(
      "select id from posts_agendados where id = any($1) and autor is not null order by created_at",
      [ids],
    );
    expect(lidos.map((l) => l.id)).toEqual(ids.slice(0, 6));
    expect(await autoresPendentes(pool as never, u, p)).toEqual({ agora: 2, depois: 0, rodada: false });
    expect(await lerAutoresPendentes(pool as never, u, p)).toBe(2);
    expect(await total(u, p)).toBe(36_000);
  });

  it("views digitadas à mão não contam", async () => {
    const u = await conta();
    const p = await personagem(u);
    await post(u, p, {
      rede: "LINKEDIN",
      manual: true,
      views: 0,
      viewsManual: 90_000_000,
      link: `https://www.linkedin.com/posts/lila_x-activity-72470000000000${np}-ab`,
      autor: `linkedin_${p.toLowerCase()}`,
    });
    expect(await total(u, p)).toBe(0);
    expect(await badges(p)).toEqual({});
  });

  it("o mesmo post pelo app e pelo link soma uma vez", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    await post(u, p, { views: 4_000, link: `${minha.link(1)}?lang=pt` });
    await post(u, p, { manual: true, views: 4_100, link: minha.link(1), autor: minha.autor });
    expect(await total(u, p, minha.conectada)).toBe(4_100);
    expect(await sql("select count(*)::int as n from nft_views_post where character_id = $1", [p])).toEqual([{ n: 1 }]);
  });

  it("a mesma conta conectada não dá badge a dois personagens", async () => {
    const u = await conta();
    const primeiro = await personagem(u, "Primeiro");
    const segundo = await personagem(u, "Segundo");
    const { conectada } = novaConta();
    await post(u, primeiro, { views: 6_000 });
    await post(u, segundo, { views: 60_000 });
    expect(await total(u, primeiro, conectada)).toBe(6_000);
    expect(await total(u, segundo, conectada)).toBe(0);
    expect(await badges(segundo)).toEqual({});
    // nem em outra conta do app
    const outra = await conta();
    const terceiro = await personagem(outra, "Terceiro");
    await post(outra, terceiro, { views: 700_000 });
    expect(await total(outra, terceiro, conectada)).toBe(0);
    // e o vínculo não se desfaz se o primeiro desconectar a conta
    expect(await total(u, primeiro, [])).toBe(6_000);
    expect(await total(u, segundo, conectada)).toBe(0);
  });

  it("conexão ganha do link: a conta que um personagem pegou pelo primeiro link passa para quem a conecta", async () => {
    const u = await conta();
    const primeiro = await personagem(u, "Primeiro");
    const dela = novaConta();
    const noX = { link: (i: number) => `https://x.com/x_${primeiro}/status/77${i}`, autor: `x_${primeiro.toLowerCase()}` };
    await post(u, primeiro, { manual: true, views: 7_000, link: dela.link(1), autor: dela.autor });
    // números de outra rede, de uma conta que é dele mesmo: continuam contando
    await post(u, primeiro, { rede: "TWITTER", manual: true, views: 500, link: noX.link(1), autor: noX.autor });
    expect(await total(u, primeiro)).toBe(7_500);
    expect(await badges(primeiro)).toEqual({ views_5k: "concedido" });

    // o dono de verdade conecta a conta (login na rede), em outra conta do app
    const dono = await conta();
    const segundo = await personagem(dono, "Segundo");
    await post(dono, segundo, { views: 50_000 });
    expect(await total(dono, segundo, dela.conectada)).toBe(50_000);
    expect(
      await sql("select distinct character_id, origem from nft_contas_rede where rede = 'TIKTOK' and usuario = $1", [
        dela.arroba,
      ]),
    ).toEqual([{ character_id: segundo, origem: "conectada" }]);

    // quem perdeu: os posts daquela conta deixam de contar, e o badge que dependia deles sai
    expect(await sql("select total::int as total from nft_views where character_id = $1", [primeiro])).toEqual([
      { total: 500 },
    ]);
    expect(await badges(primeiro)).toEqual({});
    const r = await contar(u, primeiro);
    expect(r.totais.views).toBe(500);
    expect(r.resumo).toMatchObject({ contam: 1, outroPersonagem: 1 });
    expect(r.resumo.contas.map((c) => c.rede)).toEqual(["TWITTER"]);
    expect(await sql("select erro, chave from avisos where user_id = $1 and chave like 'nft-conta:%'", [u])).toEqual([
      { erro: true, chave: `nft-conta:${primeiro}:TIKTOK:${segundo}` },
    ]);
    // e conectar de novo não refaz nada (nem avisa outra vez)
    expect(await total(dono, segundo, dela.conectada)).toBe(50_000);
    expect(await sql("select count(*)::int as n from avisos where user_id = $1 and chave like 'nft-conta:%'", [u])).toEqual([
      { n: 1 },
    ]);

    // o badge pode ser conquistado de novo, com os números dele mesmo
    await post(u, primeiro, { rede: "TWITTER", manual: true, views: 6_000, link: noX.link(2), autor: noX.autor });
    expect(await total(u, primeiro)).toBe(6_500);
    expect(await badges(primeiro)).toEqual({ views_5k: "concedido" });

    // conexão contra conexão: fica com quem chegou primeiro
    const terceiroDono = await conta();
    const terceiro = await personagem(terceiroDono, "Terceiro");
    await post(terceiroDono, terceiro, { views: 9_000 });
    expect(await total(terceiroDono, terceiro, dela.conectada)).toBe(0);
    expect(await total(dono, segundo, dela.conectada)).toBe(50_000);
  });

  it("o total nunca diminui, e o badge não é retirado", async () => {
    const u = await conta();
    const p = await personagem(u);
    const { conectada } = novaConta();
    const a = await post(u, p, { views: 11_000 });
    expect(await total(u, p, conectada)).toBe(11_000);
    await lerViews(a, 200); // o scraper leu menos, ou o post perdeu views
    expect(await total(u, p, conectada)).toBe(11_000);
    await sql("delete from posts_agendados where id = $1", [a]); // post apagado no app
    expect(await total(u, p, conectada)).toBe(11_000);
    expect(await badges(p)).toEqual({ views_5k: "concedido", views_10k: "concedido" });
  });

  it("quando o link do post do app chega, a leitura antiga migra de chave sem contar duas vezes", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    const a = await post(u, p, { views: 7_000 });
    expect(await total(u, p, minha.conectada)).toBe(7_000);
    await sql("update posts_agendados set links = $2 where id = $1", [a, JSON.stringify({ TIKTOK: minha.link(8) })]);
    await lerViews(a, 6_500);
    expect(await total(u, p, minha.conectada)).toBe(7_000);
    expect(await sql("select views::int as views, verificada from nft_views_post where character_id = $1", [p])).toEqual([
      { views: 7_000, verificada: true },
    ]);
  });

  it("de 1 milhão para cima o badge sempre espera o admin; aprovado vale, recusado não volta", async () => {
    const u = await conta();
    const p = await personagem(u);
    const { conectada } = novaConta();
    await post(u, p, { views: 6_000_000 });
    expect(await total(u, p, conectada)).toBe(6_000_000);
    expect(await badges(p)).toEqual({
      views_5k: "concedido",
      views_10k: "concedido",
      views_50k: "concedido",
      views_100k: "concedido",
      views_500k: "concedido",
      views_1m: "aguardando",
      views_5m: "aguardando",
    });
    const painel = await painelNft();
    expect(painel.aguardando.filter((b) => b.characterId === p).map((b) => b.badge).sort()).toEqual([
      "views_1m",
      "views_5m",
    ]);
    expect(await decidirBadge(p, "views_1m", true, "admin@nido")).toBe(true);
    expect(await decidirBadge(p, "views_1m", true, "admin@nido")).toBe(false); // já decidido
    expect(await decidirBadge(p, "views_5m", false, "admin@nido")).toBe(true);
    await total(u, p, conectada);
    expect(await badges(p)).toMatchObject({ views_1m: "concedido", views_5m: "recusado" });
  });

  it("leitura que salta fora do normal segura os badges da rodada para o admin", async () => {
    const u = await conta();
    const p = await personagem(u);
    const { conectada } = novaConta();
    const a = await post(u, p, { views: 1_000 });
    expect(await total(u, p, conectada)).toBe(1_000);
    await lerViews(a, 400_000); // 400 vezes de uma leitura para a outra
    expect(await total(u, p, conectada)).toBe(400_000);
    expect(await badges(p)).toEqual({
      views_5k: "aguardando",
      views_10k: "aguardando",
      views_50k: "aguardando",
      views_100k: "aguardando",
    });
    expect((await motivos(p)).views_5k).toBe(MOTIVOS.salto);
  });

  it("soma todas as métricas do post, cada uma pela maior leitura", async () => {
    const u = await conta();
    const p = await personagem(u);
    const { conectada } = novaConta();
    const a = await post(u, p, { views: 1_000, curtidas: 80, comentarios: 7, reposts: 3, quotes: 1, salvos: 12 });
    await post(u, p, { views: 500, curtidas: 20, salvos: 4 });
    let r = await contar(u, p, conectada);
    expect(r.totais).toEqual({ views: 1_500, curtidas: 100, comentarios: 7, reposts: 3, quotes: 1, salvos: 16 });
    // curtidas caem (descurtiram), comentários sobem: vale a maior leitura de cada uma
    await sql("update posts_metricas set curtidas = 60, comentarios = 9 where post_id = $1", [a]);
    r = await contar(u, p, conectada);
    expect(r.totais).toMatchObject({ curtidas: 100, comentarios: 9 });
    expect(await sql("select totais, total::int as total from nft_views where character_id = $1", [p])).toEqual([
      { totais: { views: 1_500, curtidas: 100, comentarios: 9, reposts: 3, quotes: 1, salvos: 16 }, total: 1_500 },
    ]);
  });

  it("cada métrica dá os seus badges, na marca exata, e avisa", async () => {
    const u = await conta();
    const p = await personagem(u);
    const { conectada } = novaConta();
    const a = await post(u, p, { views: 900, curtidas: 99, comentarios: 9, reposts: 9, quotes: 9, salvos: 9 });
    expect((await contar(u, p, conectada)).totais).toEqual({
      views: 900,
      curtidas: 99,
      comentarios: 9,
      reposts: 9,
      quotes: 9,
      salvos: 9,
    });
    expect(await badges(p)).toEqual({});
    // uma a mais em cada uma: bate a primeira marca de cinco escadas (views ainda não)
    await sql(
      "update posts_metricas set curtidas = 100, comentarios = 10, reposts = 10, quotes = 10, salvos = 10 where post_id = $1",
      [a],
    );
    await contar(u, p, conectada);
    expect(await badges(p)).toEqual({
      likes_100: "concedido",
      comments_10: "concedido",
      reposts_10: "concedido",
      quotes_10: "concedido",
      saves_10: "concedido",
    });
    expect(
      await sql("select badge, metrica, views::int as valor from nft_badges where character_id = $1 order by badge", [p]),
    ).toEqual([
      { badge: "comments_10", metrica: "comentarios", valor: 10 },
      { badge: "likes_100", metrica: "curtidas", valor: 100 },
      { badge: "quotes_10", metrica: "quotes", valor: 10 },
      { badge: "reposts_10", metrica: "reposts", valor: 10 },
      { badge: "saves_10", metrica: "salvos", valor: 10 },
    ]);
    const avisos = await sql<{ rotulo: string }>("select rotulo from avisos where user_id = $1 order by rotulo", [u]);
    expect(avisos.map((x) => x.rotulo).sort()).toEqual(
      [
        "Badge 10 comentários · Lila Nova",
        "Badge 10 quotes · Lila Nova",
        "Badge 10 reposts · Lila Nova",
        "Badge 10 salvamentos · Lila Nova",
        "Badge 100 curtidas · Lila Nova",
      ].sort(),
    );
  });

  it("nas outras métricas a conferência segue a escada de cada uma (conta só pelo link, marca alta, salto)", async () => {
    // conta só pelo primeiro link: curtidas até 1 mil saem sozinhas; de 2 mil para cima esperam
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    await post(u, p, { manual: true, views: 1_000, curtidas: 2_500, comentarios: 120, link: minha.link(1), autor: minha.autor });
    await contar(u, p);
    expect(await badges(p)).toMatchObject({
      likes_100: "concedido",
      likes_200: "concedido",
      likes_1k: "concedido",
      likes_2k: "aguardando",
      comments_50: "concedido",
      comments_100: "aguardando",
    });
    expect((await motivos(p)).likes_2k).toBe(MOTIVOS.semConexao);
    // conectou a conta: os que esperavam só por isso saem
    await contar(u, p, minha.conectada);
    expect(await badges(p)).toMatchObject({ likes_2k: "concedido", comments_100: "concedido" });

    // marca alta (o degrau gêmeo de 1 milhão de views) sempre passa pelo admin, e o painel diz de que métrica é
    const v = await conta();
    const q = await personagem(v, "Marca Alta");
    const { conectada } = novaConta();
    const b = await post(v, q, { views: 3_000, curtidas: 25_000, salvos: 1_999 });
    await contar(v, q, conectada);
    expect(await badges(q)).toMatchObject({ likes_10k: "concedido", likes_20k: "aguardando", saves_1k: "concedido" });
    expect((await motivos(q)).likes_20k).toBe(MOTIVOS.marcaAlta);
    const esperando = (await painelNft()).aguardando.filter((x) => x.characterId === q);
    expect(esperando).toHaveLength(1);
    expect(esperando[0]).toMatchObject({
      badge: "likes_20k",
      nomeBadge: "20 mil curtidas",
      metrica: "curtidas",
      unidade: "curtidas",
      valor: 25_000,
      valorAgora: 25_000,
    });

    // salto: os salvos do post pulam 100 vezes e mais que a marca de conferência da escada (200)
    await sql("update posts_metricas set salvos = 19, curtidas = 25_000 where post_id = $1", [b]); // leitura menor não muda nada
    const w = await conta();
    const s = await personagem(w, "Salto");
    const outra = novaConta();
    const c = await post(w, s, { views: 500, salvos: 3 });
    await contar(w, s, outra.conectada);
    await sql("update posts_metricas set salvos = 400 where post_id = $1", [c]);
    await contar(w, s, outra.conectada);
    expect(await badges(s)).toEqual({
      saves_10: "aguardando",
      saves_20: "aguardando",
      saves_100: "aguardando",
      saves_200: "aguardando",
    });
    expect((await motivos(s)).saves_10).toBe(MOTIVOS.salto);
  });

  it("catálogo que cresce: marca que os totais guardados já batiam vira badge sem refazer a conta", async () => {
    const u = await conta();
    const p = await personagem(u);
    const { conectada } = novaConta();
    await post(u, p, { views: 6_000, curtidas: 104, comentarios: 4 });
    await contar(u, p, conectada);
    // como era antes de as escadas das outras métricas existirem: só o badge de views
    await sql("delete from nft_badges where character_id = $1 and metrica <> 'views'", [p]);
    await sql("delete from avisos where user_id = $1", [u]);
    expect(await badges(p)).toEqual({ views_5k: "concedido" });

    await concederPendentes(pool as never, u, p);
    expect(await badges(p)).toEqual({ views_5k: "concedido", likes_100: "concedido" });
    expect(await sql("select chave from avisos where user_id = $1", [u])).toEqual([
      { chave: `badge:${p}:likes_100` },
    ]);
    // de novo, nada muda; badge recusado pelo admin não volta; personagem sem conta nenhuma não quebra
    await sql("update nft_badges set status = 'recusado' where character_id = $1 and badge = 'likes_100'", [p]);
    await concederPendentes(pool as never, u, p);
    expect(await badges(p)).toEqual({ views_5k: "concedido", likes_100: "recusado" });
    await concederPendentes(pool as never, u, await personagem(u, "Sem posts"));
  });

  it("atualizarViewsDaConta lê as contas do time de cada personagem e respeita o intervalo", async () => {
    const u = await conta();
    const p = await personagem(u);
    await sql("insert into social_times (user_id, character_id, team_id) values ($1, $2, $3)", [u, p, `time_${p}`]);
    e.contas[`time_${p}`] = novaConta().conectada;
    const a = await post(u, p, { views: 5_500 });
    await atualizarViewsDaConta(pool as never, {} as never, u);
    expect(await badges(p)).toEqual({ views_5k: "concedido" });
    await lerViews(a, 10_500);
    await atualizarViewsDaConta(pool as never, {} as never, u); // menos de 10 min: pula
    expect(await badges(p)).toEqual({ views_5k: "concedido" });
    await atualizarViewsDaConta(pool as never, {} as never, u, { forcar: true });
    expect(await badges(p)).toEqual({ views_5k: "concedido", views_10k: "concedido" });
  });

  it("sem bundle.social configurado, os posts por link contam do mesmo jeito", async () => {
    const u = await conta();
    const p = await personagem(u);
    const minha = novaConta();
    await post(u, p, { manual: true, views: 5_200, link: minha.link(1), autor: minha.autor });
    await atualizarViewsDaConta(pool as never, null, u);
    expect(await badges(p)).toEqual({ views_5k: "concedido" });
  });
});

/* ------------------------------------------------------------------ */
/* Badges no NFT                                                        */
/* ------------------------------------------------------------------ */

describe("badges gravados no NFT", () => {
  async function mintado(views: number) {
    const u = await conta(100);
    const p = await personagem(u);
    const c = await vincular(u);
    const conta1 = [contaRede("YOUTUBE", `canal_${p}`, `UC${p}`)];
    if (views) await post(u, p, { rede: "YOUTUBE", views });
    await atualizarViewsDoPersonagem(pool as never, u, p, conta1);
    const r = (await pedir(u, p)) as { mint: { id: string; asset: string } };
    return { u, p, c, mint: r.mint, conta1 };
  }

  it("badge ganho antes do mint entra no NFT; lista igual não é reescrita", async () => {
    const { u, p, mint } = await mintado(12_000);
    expect(await mintsComBadgesPendentes(500)).toContain(mint.id);
    e.situacao = "pendente";
    expect(await gravarBadges(mint.id)).toBe("gravado");
    expect(e.escritas.at(-1)).toEqual({ asset: mint.asset, badges: expect.arrayContaining(["views_5k", "views_10k"]) });
    expect(await mintsComBadgesPendentes(500)).not.toContain(mint.id);
    expect(await gravarBadges(mint.id)).toBe("igual");
    expect(e.escritas).toHaveLength(1);
    const estado = await estadoNft(u, p);
    expect(estado.views).toBe(12_000);
    expect(estado.mint?.status).toBe("confirmado");
    expect(estado.badges.filter((b) => b.naRede).map((b) => b.id)).toEqual(["views_5k", "views_10k"]);
    expect(estado.badges.find((b) => b.id === "views_50k")?.status).toBe("bloqueado");
  });

  it("badges de várias métricas vão juntos para o NFT e aparecem nos metadados públicos", async () => {
    const { GET } = await import("@/app/api/nft/meta/[asset]/route");
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    const ig = [contaRede("INSTAGRAM", `ig_${p}`, `ig${p}`)];
    await post(u, p, { rede: "INSTAGRAM", views: 12_000, curtidas: 250, comentarios: 11, salvos: 25 });
    await atualizarViewsDoPersonagem(pool as never, u, p, ig);
    const r = (await pedir(u, p)) as { mint: { id: string } };
    const asset = carteiraDeTeste().endereco;
    await sql("update nft_mints set asset = $2 where id = $1", [r.mint.id, asset]);
    e.situacao = "pendente";
    expect(await gravarBadges(r.mint.id)).toBe("gravado");
    expect([...(e.escritas.at(-1)?.badges ?? [])].sort()).toEqual(
      ["comments_10", "likes_100", "likes_200", "saves_10", "saves_20", "views_10k", "views_5k"].sort(),
    );
    const estado = await estadoNft(u, p);
    expect(estado.totais).toMatchObject({ views: 12_000, curtidas: 250, comentarios: 11, salvos: 25 });
    expect(estado.badges.filter((b) => b.naRede).map((b) => b.id)).toEqual([
      "views_5k",
      "views_10k",
      "likes_100",
      "likes_200",
      "comments_10",
      "saves_10",
      "saves_20",
    ]);
    const m = (await (
      await GET(new Request(`https://app.exemplo/api/nft/meta/${asset}`), { params: Promise.resolve({ asset }) })
    ).json()) as { attributes: Array<{ trait_type: string; value: string | number }> };
    const tracos = Object.fromEntries(m.attributes.map((a) => [a.trait_type, a.value]));
    expect(tracos).toMatchObject({
      Views: 12_000,
      "Views badge": "10K",
      Likes: 250,
      "Likes badge": "200",
      Comments: 11,
      "Comments badge": "10",
      Saves: 25,
      "Saves badge": "20",
      Badges: 7,
    });
    expect(tracos).not.toHaveProperty("Quotes badge");
  });

  it("badge aguardando aprovação NÃO vai para o NFT; depois de aprovado, vai", async () => {
    const { p, mint } = await mintado(1_500_000);
    e.situacao = "pendente";
    await gravarBadges(mint.id);
    expect(e.escritas.at(-1)?.badges).not.toContain("views_1m");
    expect(e.escritas.at(-1)?.badges).toHaveLength(5);
    await decidirBadge(p, "views_1m", true, "admin@nido");
    expect(await mintsComBadgesPendentes(500)).toContain(mint.id);
    await gravarBadges(mint.id);
    expect(e.escritas.at(-1)?.badges).toContain("views_1m");
  });

  it("escrita que a rede não confirma fica pendente e é refeita; duas ao mesmo tempo não acontecem", async () => {
    const { mint } = await mintado(6_000);
    e.situacao = "sem_registro";
    expect(await gravarBadges(mint.id)).toBe("falhou");
    expect(await mintsComBadgesPendentes(500)).toContain(mint.id);
    e.situacao = "finalizada";
    const [a, b] = await Promise.all([gravarBadges(mint.id), gravarBadges(mint.id)]);
    expect([a, b].sort()).toEqual(["gravado", "ocupado"]);
  });

  it("sem saldo na chave, não tenta gravar", async () => {
    const { mint } = await mintado(6_000);
    e.saldoSol = 0;
    expect(await gravarBadges(mint.id)).toBe("sem_saldo");
    expect(e.escritas).toHaveLength(0);
  });

  it("conferência rede × banco: badge falso na rede é detectado e reescrito", async () => {
    const { c, mint } = await mintado(6_000);
    e.situacao = "pendente";
    await gravarBadges(mint.id);
    const [{ ficha_hash }] = await sql<{ ficha_hash: string }>("select ficha_hash from nft_mints where id = $1", [mint.id]);
    // alguém com a chave de badges vazada gravou 100 milhões
    e.naRede = {
      dono: c.endereco,
      nome: "Lila Nova",
      uri: "u",
      dados: { v: 2, ficha: ficha_hash, badges: ["views_5k", "views_100m"] },
    };
    await sql("update nft_mints set conferido_em = null");
    const r = await conferirNaRede(500);
    expect(r.dados_diferentes).toBeGreaterThanOrEqual(1);
    expect(await mintsComBadgesPendentes(500)).toContain(mint.id);
    await gravarBadges(mint.id);
    expect(e.escritas.at(-1)?.badges).toEqual(["views_5k"]);
    // rede igual ao banco: nada a fazer
    e.naRede = { dono: c.endereco, nome: "Lila Nova", uri: "u", dados: { v: 2, ficha: ficha_hash, badges: ["views_5k"] } };
    await sql("update nft_mints set conferido_em = null where id = $1", [mint.id]);
    await conferirNaRede(500);
    expect(await mintsComBadgesPendentes(500)).not.toContain(mint.id);
  });
});

/* ------------------------------------------------------------------ */
/* Metadados públicos e limpeza do S3                                   */
/* ------------------------------------------------------------------ */

describe("metadados públicos e capa", () => {
  it("a rota pública mostra o personagem; apagado no app, vira arquivado e a capa para de sair", async () => {
    const { GET } = await import("@/app/api/nft/meta/[asset]/route");
    const { GET: imagem } = await import("@/app/api/nft/meta/[asset]/imagem/route");
    const u = await conta(100);
    const p = await personagem(u, "Lila Nova");
    await vincular(u);
    // endereço em base58 de verdade (a rota confere o formato)
    const asset = carteiraDeTeste().endereco;
    await pedir(u, p);
    await sql("update nft_mints set asset = $2 where character_id = $1", [p, asset]);
    const pedido = (caminho = "") => new Request(`https://app.exemplo/api/nft/meta/${asset}${caminho}`);
    const params = { params: Promise.resolve({ asset }) };

    const res = await GET(pedido(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const m = (await res.json()) as { name: string; image?: string; description: string };
    expect(m.name).toBe("Lila Nova");
    expect(m.description).toBe("Bio pública.");
    expect(m.image).toBe(`https://app.exemplo/api/nft/meta/${asset}/imagem`);
    expect(JSON.stringify(m)).not.toContain(`users/${u}`);
    const img = await imagem(pedido("/imagem"), params);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");

    await sql("delete from characters where id = $1", [p]);
    const arquivado = (await (await GET(pedido(), params)).json()) as { image?: string; description: string };
    expect(arquivado.image).toBeUndefined();
    expect(arquivado.description).toMatch(/arquivado/i);
    expect((await imagem(pedido("/imagem"), params)).status).toBe(404);
  });

  it("endereço desconhecido ou malformado: 404; `colecao` devolve a coleção", async () => {
    const { GET } = await import("@/app/api/nft/meta/[asset]/route");
    const chamar = (asset: string) =>
      GET(new Request(`https://app.exemplo/api/nft/meta/${asset}`), { params: Promise.resolve({ asset }) });
    expect((await chamar(carteiraDeTeste().endereco)).status).toBe(404);
    expect((await chamar("../../etc/passwd")).status).toBe(404);
    expect(((await (await chamar("colecao")).json()) as { name: string }).name).toBe("NIDO Influencers");
  });

  it("a limpeza do S3 poupa a capa do NFT e apaga o resto que ninguém usa", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    await pedir(u, p);
    const [m] = await mints(p);
    const velho = new Date(Date.now() - 48 * 3600_000);
    const arquivos = [m.capa_key, `users/${u}/refs/r.jpg`, `users/${u}/generated/orfao.jpg`];
    const apagados: string[] = [];
    const s3 = {
      send: async (cmd: { constructor: { name: string }; input: { Delete?: { Objects: Array<{ Key: string }> } } }) => {
        if (cmd.constructor.name === "ListObjectsV2Command")
          return { Contents: arquivos.map((Key) => ({ Key, LastModified: velho, Size: 10 })) };
        apagados.push(...cmd.input.Delete!.Objects.map((o) => o.Key));
        return {};
      },
    };
    await limparUsuario(s3 as never, pool as never, u, 24 * 3600_000);
    expect(apagados).toEqual([`users/${u}/generated/orfao.jpg`]);
    // trocar a capa ou apagar o personagem não muda isso
    apagados.length = 0;
    await sql("delete from characters where id = $1", [p]);
    await limparUsuario(s3 as never, pool as never, u, 24 * 3600_000);
    expect(apagados).not.toContain(m.capa_key);
  });
});

/* ------------------------------------------------------------------ */
/* Rotas                                                                */
/* ------------------------------------------------------------------ */

const json = (url: string, corpo?: unknown) =>
  new Request(`https://app.exemplo${url}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
/** Roda o que as rotas deixaram para depois da resposta. */
const rodarDepois = async () => {
  for (const fn of e.depois.splice(0)) await fn();
};

describe("rotas", () => {
  it("carteira: desafio → assinatura → vinculada; ler e desvincular; sem sessão, 401", async () => {
    const desafio = await import("@/app/api/carteira/desafio/route");
    const verificar = await import("@/app/api/carteira/verificar/route");
    const carteira = await import("@/app/api/carteira/route");
    const c = carteiraDeTeste();

    expect((await desafio.POST(json("/api/carteira/desafio", { endereco: c.endereco }))).status).toBe(401);

    e.sessao = await conta();
    expect((await desafio.POST(json("/api/carteira/desafio", { endereco: "lixo" }))).status).toBe(400);
    const d = (await (
      await desafio.POST(json("/api/carteira/desafio", { endereco: c.endereco }))
    ).json()) as { nonce: string; mensagem: string };
    expect(d.mensagem).toContain(c.endereco);
    const assinatura = Buffer.from(c.assinar(d.mensagem)).toString("base64");

    const d2 = (await (
      await desafio.POST(json("/api/carteira/desafio", { endereco: c.endereco }))
    ).json()) as { nonce: string; mensagem: string };
    const errada = Buffer.from(carteiraDeTeste().assinar(d2.mensagem)).toString("base64");
    expect(
      (await verificar.POST(json("/api/carteira/verificar", { nonce: d2.nonce, assinatura: errada }))).status,
    ).toBe(400);

    const ok = await verificar.POST(json("/api/carteira/verificar", { nonce: d.nonce, assinatura }));
    expect(await ok.json()).toEqual({ carteira: c.endereco });
    expect(await (await carteira.GET()).json()).toEqual({ carteira: c.endereco });
    expect(await (await carteira.DELETE()).json()).toEqual({ carteira: null });
    expect(await (await carteira.GET()).json()).toEqual({ carteira: null });
  });

  it("mint: sem a declaração não minta; com ela minta e grava os badges que já tinha", async () => {
    const { POST } = await import("@/app/api/nft/mint/route");
    const estado = await import("@/app/api/nft/personagem/[characterId]/route");
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    await sql("insert into social_times (user_id, character_id, team_id) values ($1, $2, $3)", [u, p, `time_${p}`]);
    e.contas[`time_${p}`] = [contaRede("INSTAGRAM", `ig_${p}`, `ig${p}`)];
    await post(u, p, { rede: "INSTAGRAM", views: 55_000 });

    expect((await POST(json("/api/nft/mint", { characterId: p, consentimento: true }))).status).toBe(401);
    e.sessao = u;
    expect((await POST(json("/api/nft/mint", { characterId: p }))).status).toBe(400);
    expect((await POST(json("/api/nft/mint", { characterId: p, consentimento: false }))).status).toBe(400);
    expect(await mints(p)).toEqual([]);
    expect(await saldo(u)).toBe(100);

    const res = await POST(json("/api/nft/mint", { characterId: p, consentimento: true }));
    expect(res.status).toBe(200);
    const { mint } = (await res.json()) as { mint: { id: string; status: string; linkAsset: string } };
    expect(mint.status).toBe("confirmado");
    expect(mint.linkAsset).toContain("cluster=devnet");
    expect(await saldo(u)).toBe(90);

    // depois da resposta: recalcula as views e grava os badges no NFT
    e.situacao = "pendente";
    await rodarDepois();
    expect([...(e.escritas.at(-1)?.badges ?? [])].sort()).toEqual(["views_10k", "views_50k", "views_5k"]);

    const params = { params: Promise.resolve({ characterId: p }) };
    const visto = (await (await estado.GET(json(`/api/nft/personagem/${p}`), params)).json()) as {
      views: number;
      custo: number;
      bloqueio: string | null;
      mint: { status: string };
      badges: Array<{ id: string; status: string; naRede: boolean }>;
    };
    expect(visto).toMatchObject({
      views: 55_000,
      custo: 10,
      bloqueio: null,
      mint: { status: "confirmado" },
      saldoSol: 1.5,
      mintDisponivel: true,
    });
    expect(visto.badges.filter((b) => b.naRede).map((b) => b.id)).toEqual(["views_5k", "views_10k", "views_50k"]);

    // outra conta não vê o personagem alheio
    e.sessao = await conta();
    expect((await estado.GET(json(`/api/nft/personagem/${p}`), params)).status).toBe(404);
  });

  it("estado: badge novo depois do mint é gravado depois da resposta", async () => {
    const estado = await import("@/app/api/nft/personagem/[characterId]/route");
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    await pedir(u, p);
    await sql("insert into social_times (user_id, character_id, team_id) values ($1, $2, $3)", [u, p, `time_${p}`]);
    e.contas[`time_${p}`] = [contaRede("TWITTER", `x_${p}`, `x${p}`)];
    await post(u, p, { rede: "TWITTER", views: 5_000 });
    e.sessao = u;
    e.situacao = "pendente";
    const params = { params: Promise.resolve({ characterId: p }) };
    const antes = (await (await estado.GET(json(`/api/nft/personagem/${p}`), params)).json()) as {
      badges: Array<{ id: string; status: string; naRede: boolean }>;
    };
    expect(antes.badges[0]).toMatchObject({ id: "views_5k", status: "conquistado", naRede: false });
    await rodarDepois();
    expect(e.escritas.at(-1)?.badges).toEqual(["views_5k"]);
    const depois = (await (await estado.GET(json(`/api/nft/personagem/${p}`), params)).json()) as {
      badges: Array<{ naRede: boolean }>;
    };
    expect(depois.badges[0].naRede).toBe(true);
    expect(e.depois).toHaveLength(0); // nada mais a gravar
  });

  it("cron do NFT: exige o segredo; fecha mints, recalcula views, grava badges e confere a rede", async () => {
    const { GET } = await import("@/app/api/cron/nft/route");
    process.env.CRON_SECRET = "segredo-do-cron";
    const chamar = (auth?: string) =>
      GET(
        new Request("https://app.exemplo/api/cron/nft", {
          headers: auth ? { authorization: auth } : {},
        }),
      );
    expect((await chamar()).status).toBe(401);
    expect((await chamar("Bearer errado")).status).toBe(401);

    // um mint enviado que a rede finalizou, e um badge esperando gravação
    const u = await conta(100);
    const p = await personagem(u);
    const c = await vincular(u);
    await sql("insert into social_times (user_id, character_id, team_id) values ($1, $2, $3)", [u, p, `time_${p}`]);
    e.contas[`time_${p}`] = [contaRede("YOUTUBE", `yt_${p}`, `yt${p}`)];
    await post(u, p, { rede: "YOUTUBE", views: 5_100 });
    e.situacao = "sem_registro";
    const r = (await pedir(u, p)) as { mint: { id: string; status: string } };
    expect(r.mint.status).toBe("enviado");

    e.situacao = "finalizada";
    const [{ ficha_hash }] = await sql<{ ficha_hash: string }>("select ficha_hash from nft_mints where id = $1", [r.mint.id]);
    e.naRede = { dono: c.endereco, nome: "Lila Nova", uri: "u", dados: { v: 2, ficha: ficha_hash, badges: [] } };
    await sql("update nft_views set conferido_em = now() - interval '1 day'");
    const res = await chamar("Bearer segredo-do-cron");
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { ok: boolean; ligado: boolean; mints: Record<string, number>; views: number };
    expect(corpo).toMatchObject({ ok: true, ligado: true });
    expect(corpo.mints.confirmado).toBeGreaterThanOrEqual(1);
    expect(corpo.views).toBeGreaterThanOrEqual(1);
    expect((await mints(p))[0].status).toBe("confirmado");
    expect(await badges(p)).toEqual({ views_5k: "concedido" });
    expect(e.escritas.some((x) => x.badges.includes("views_5k"))).toBe(true);
  });

  it("cron com o RPC apontando para outra rede: não julga mints nem escreve badges", async () => {
    const { GET } = await import("@/app/api/cron/nft/route");
    process.env.CRON_SECRET = "segredo-do-cron";
    const u = await conta(100);
    const p = await personagem(u);
    await vincular(u);
    e.situacao = "sem_registro";
    const r = (await pedir(u, p)) as { mint: { id: string; status: string } };
    expect(r.mint.status).toBe("enviado");
    // nesta rede errada o prazo "passou" e a transação é desconhecida
    e.rpcErrado = true;
    e.altura = 99_999_999;
    const res = await GET(
      new Request("https://app.exemplo/api/cron/nft", {
        headers: { authorization: "Bearer segredo-do-cron" },
      }),
    );
    const corpo = (await res.json()) as { redeCerta: boolean; badges: unknown; rede: unknown };
    expect(corpo).toMatchObject({ redeCerta: false, badges: {}, rede: {} });
    expect((await mints(p))[0]).toMatchObject({ status: "enviado", estornado: false });
    expect(await saldo(u)).toBe(90);
    expect(e.escritas).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Imagem do NFT e saldos                                               */
/* ------------------------------------------------------------------ */

describe("imagem do NFT e saldos na tela", () => {
  /** Personagem com card de referência (mais recente) escolhido como capa, e um retrato. */
  async function comRetrato(userId: string) {
    const c = emptyCharacter();
    c.id = `c${++n}`;
    c.identidade.nome = "Com Retrato";
    c.visual.referencias = [
      { id: "r", name: "r.jpg", dataUrl: "", size: 1, key: `users/${userId}/refs/r.jpg` },
    ];
    const gerada = (key: string, tipo: "referencia" | "retrato", createdAt: number) => ({
      id: key,
      key,
      tipo,
      estilo: "3d" as const,
      qualidade: "padrao" as const,
      size: 1,
      createdAt,
    });
    c.geradas = [
      gerada(`users/${userId}/generated/card.jpg`, "referencia", 300),
      gerada(`users/${userId}/generated/retrato.jpg`, "retrato", 200),
    ];
    c.visual.capaKey = `users/${userId}/generated/card.jpg`;
    await sql("insert into characters (id, user_id, data) values ($1, $2, $3)", [
      c.id,
      userId,
      JSON.stringify(c),
    ]);
    return c;
  }

  it("a imagem copiada no mint é o Retrato, mesmo com outra imagem escolhida como capa", async () => {
    const u = await conta(100);
    const c = await comRetrato(u);
    await vincular(u);
    e.lidas = [];
    await pedir(u, c.id);
    expect(e.lidas).toEqual([`users/${u}/generated/retrato.jpg`]);
  });

  it("trocar a imagem do NFT: só com NFT mintado, só do dono, e copia o retrato atual", async () => {
    const { POST } = await import("@/app/api/nft/personagem/[characterId]/imagem/route");
    const u = await conta(100);
    const c = await comRetrato(u);
    await vincular(u);
    const chamar = (id = c.id) =>
      POST(new Request(`https://app.exemplo/api/nft/personagem/${id}/imagem`, { method: "POST" }), {
        params: Promise.resolve({ characterId: id }),
      });

    expect((await chamar()).status).toBe(401); // sem sessão
    e.sessao = u;
    expect((await chamar()).status).toBe(404); // ainda não mintou
    await pedir(u, c.id);

    // gera um retrato novo: o NFT não muda sozinho…
    const [m] = await mints(c.id);
    c.geradas!.unshift({
      id: "novo",
      key: `users/${u}/generated/retrato-novo.jpg`,
      tipo: "retrato",
      estilo: "3d",
      qualidade: "padrao",
      size: 1,
      createdAt: 900,
    });
    await sql("update characters set data = $2 where id = $1", [c.id, JSON.stringify(c)]);
    e.lidas = [];
    // …só quando o dono pede
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(e.lidas).toEqual([`users/${u}/generated/retrato-novo.jpg`]);
    expect((await mints(c.id))[0].capa_key).toBe(m.capa_key);
    expect(await saldo(u)).toBe(90); // não cobra

    // outra conta não troca a imagem do NFT alheio
    e.sessao = await conta();
    expect((await chamar()).status).toBe(404);
  });

  it("o estado traz o saldo de SOL da carteira e se o mint está disponível", async () => {
    const u = await conta(100);
    const p = await personagem(u);
    e.saldoCarteira = 1.5;
    let estado = await estadoNft(u, p);
    expect(estado).toMatchObject({ carteira: null, saldoSol: null, mintDisponivel: true });
    await vincular(u);
    estado = await estadoNft(u, p);
    expect(estado.saldoSol).toBe(1.5);
    // a rede não respondeu: o saldo fica indisponível e a tela não trava
    e.saldoCarteira = null;
    expect((await estadoNft(u, p)).saldoSol).toBeNull();
    // chave que paga as taxas sem saldo: o mint aparece como indisponível, seja qual for o saldo de quem minta
    e.saldoCarteira = 50;
    e.saldoSol = 0.001;
    estado = await estadoNft(u, p);
    expect(estado).toMatchObject({ saldoSol: 50, mintDisponivel: false });
    expect(await codigo(await pedir(u, p))).toMatchObject({ status: 503 });
    expect(await saldo(u)).toBe(100);
  });
});
