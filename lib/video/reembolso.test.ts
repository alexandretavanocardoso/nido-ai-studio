import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Reembolso de vídeo contra um Postgres de verdade (PGlite, com todas as
 * migrations): o pedido, a decisão do admin, os créditos e o aviso rodam como
 * em produção.
 */
const e = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/lib/db", () => ({ getPool: () => e.pool }));

import { carregarConta, debitar } from "@/lib/creditos";
import {
  listarReembolsos,
  pedirReembolso,
  reembolsosDaConta,
  registrarDownload,
  registrarEdicao,
  registrarEdicaoAntiga,
  resolverReembolso,
} from "./reembolso-server";

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
  // Login "configurado": os créditos passam a valer (lib/creditos.ts).
  Object.assign(process.env, {
    DATABASE_URL: "postgres://teste",
    BETTER_AUTH_SECRET: "segredo",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "segredo",
  });
}, 60_000);

let n = 0;
/** Conta com 300 créditos do plano e um vídeo de troca pronto que custou 255. */
async function contaComVideo(o: { status?: string; cobrar?: boolean } = {}) {
  const userId = `u${++n}`;
  const jobId = `job${n}`;
  await sql(
    `insert into "user" (id, name, email, "emailVerified") values ($1, $1, $2, true)`,
    [userId, `${userId}@exemplo.com`],
  );
  await carregarConta(userId);
  await sql(
    `update creditos_conta set plano = 'starter', plano_expira_em = now() + interval '30 days',
       proxima_recarga_em = now() + interval '30 days', creditos_plano = 300, creditos_avulsos = 0
     where user_id = $1`,
    [userId],
  );
  const cobranca =
    o.cobrar === false ? null : await debitar(userId, 255, "video_troca", jobId);
  await sql(
    `insert into video_jobs (id, user_id, character_id, status, modelo, fal_request_id, input, duracao, result_key, tipo)
     values ($1, $2, 'p1', $3, 'kling', 'req', $4, 15, $5, 'substituir')`,
    [
      jobId,
      userId,
      o.status ?? "concluido",
      JSON.stringify({ cobranca }),
      `users/${userId}/videos/${jobId}.mp4`,
    ],
  );
  return { userId, jobId, key: `users/${userId}/videos/${jobId}.mp4` };
}

const saldo = async (userId: string) => (await carregarConta(userId)).total;
const admin = { email: "admin@exemplo.com" };


describe("pedido de reembolso", () => {
  it("registra o pedido com o valor que o vídeo custou, uma vez só", async () => {
    const c = await contaComVideo();
    const pedido = await pedirReembolso({ ...c, motivo: "defeito" });
    expect(pedido).toMatchObject({ status: "pendente", creditos: 255 });
    expect(await saldo(c.userId)).toBe(45);
    await expect(
      pedirReembolso({ ...c, motivo: "pessoa_errada" }),
    ).rejects.toThrow("Você já pediu o reembolso deste vídeo.");
    expect(await reembolsosDaConta(c.userId)).toHaveLength(1);
  });

  it("exige o texto em “outro motivo”", async () => {
    const c = await contaComVideo();
    await expect(
      pedirReembolso({ ...c, motivo: "outro", detalhe: "  " }),
    ).rejects.toThrow("Escreva o motivo do reembolso.");
    await pedirReembolso({ ...c, motivo: "outro", detalhe: "Ficou sem som" });
  });

  it("recusa vídeo de outra conta, vídeo que não terminou e vídeo sem cobrança", async () => {
    const dono = await contaComVideo();
    const outro = await contaComVideo();
    await expect(
      pedirReembolso({ userId: outro.userId, jobId: dono.jobId, motivo: "defeito" }),
    ).rejects.toThrow("Vídeo não encontrado.");
    const gerando = await contaComVideo({ status: "processando" });
    await expect(
      pedirReembolso({ ...gerando, motivo: "defeito" }),
    ).rejects.toThrow("Só dá para pedir reembolso de um vídeo pronto.");
    const gratis = await contaComVideo({ cobrar: false });
    await expect(
      pedirReembolso({ ...gratis, motivo: "defeito" }),
    ).rejects.toThrow("Este vídeo não gastou créditos.");
  });
});

describe("edição feita na hora (corte, legenda, fala)", () => {
  it("fica registrada com a cobrança e pode ser reembolsada", async () => {
    const c = await contaComVideo();
    const cobranca = await debitar(c.userId, 2, "video_corte", c.key);
    const key = `users/${c.userId}/videos/corte.mp4`;
    const edicaoId = await registrarEdicao({
      userId: c.userId,
      tipo: "corte",
      key,
      duracao: 9.5,
      cobranca,
    });
    expect(edicaoId).toBeTruthy();
    expect(await saldo(c.userId)).toBe(43);
    const pedido = await pedirReembolso({
      userId: c.userId,
      jobId: edicaoId!,
      motivo: "defeito",
    });
    expect(pedido.creditos).toBe(2);
    const { itens } = await listarReembolsos(null, "pendente");
    const item = itens.find((i) => i.jobId === edicaoId)!;
    expect(item.tipo).toBe("corte");
    await resolverReembolso(admin, item.id, { aprovar: true });
    expect(await saldo(c.userId)).toBe(45);
  });

  it("edição antiga, sem registro: usa a cobrança do extrato, uma por vídeo", async () => {
    const c = await contaComVideo();
    await debitar(c.userId, 2, "video_legenda", "origem.mp4");
    const key = `users/${c.userId}/videos/legenda-antiga.mp4`;
    const jobId = await registrarEdicaoAntiga({ userId: c.userId, tipo: "legenda", key });
    // Pedir de novo para o mesmo vídeo acha o mesmo registro.
    expect(await registrarEdicaoAntiga({ userId: c.userId, tipo: "legenda", key })).toBe(jobId);
    // Outro vídeo, sem outra cobrança no extrato: não há o que devolver.
    await expect(
      registrarEdicaoAntiga({ userId: c.userId, tipo: "legenda", key: key + "2" }),
    ).rejects.toThrow("Este vídeo não gastou créditos.");
    const pedido = await pedirReembolso({ userId: c.userId, jobId, motivo: "defeito" });
    expect(pedido.creditos).toBe(2);
    expect(await reembolsosDaConta(c.userId)).toMatchObject([{ jobId, key }]);
    const { itens } = await listarReembolsos(null, "pendente");
    await resolverReembolso(admin, itens.find((i) => i.jobId === jobId)!.id, { aprovar: true });
    expect(await saldo(c.userId)).toBe(45);
  });

  it("sem cobrança, não registra nada", async () => {
    const c = await contaComVideo();
    expect(
      await registrarEdicao({
        userId: c.userId,
        tipo: "audio",
        key: "x",
        duracao: 1,
        cobranca: null,
      }),
    ).toBeNull();
  });
});

describe("decisão do admin", () => {
  const idDoPedido = async (jobId: string) =>
    (await sql<{ id: string }>("select id from reembolsos_video where job_id = $1", [jobId]))[0].id;

  it("aprovar devolve os créditos uma vez só e avisa a pessoa", async () => {
    const c = await contaComVideo();
    await pedirReembolso({ ...c, motivo: "defeito" });
    const id = await idDoPedido(c.jobId);
    await resolverReembolso(admin, id, { aprovar: true });
    expect(await saldo(c.userId)).toBe(300);
    await expect(
      resolverReembolso(admin, id, { aprovar: true }),
    ).rejects.toThrow("Este pedido não está mais pendente.");
    expect(await saldo(c.userId)).toBe(300);
    expect(await reembolsosDaConta(c.userId)).toMatchObject([
      { jobId: c.jobId, status: "aprovado", creditos: 255, resposta: null },
    ]);
    const mov = await sql<{ delta: number }>(
      "select delta from creditos_mov where user_id = $1 and motivo = 'estorno_reembolso_video'",
      [c.userId],
    );
    expect(mov).toEqual([{ delta: 255 }]);
    const avisos = await sql<{ rotulo: string; erro: boolean }>(
      "select rotulo, erro from avisos where user_id = $1",
      [c.userId],
    );
    expect(avisos).toEqual([
      { rotulo: "Reembolso aprovado: 255 créditos devolvidos", erro: false },
    ]);
  });

  it("dois admins aprovando ao mesmo tempo devolvem uma vez só", async () => {
    const c = await contaComVideo();
    await pedirReembolso({ ...c, motivo: "defeito" });
    const id = await idDoPedido(c.jobId);
    const r = await Promise.allSettled([
      resolverReembolso(admin, id, { aprovar: true }),
      resolverReembolso(admin, id, { aprovar: true }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await saldo(c.userId)).toBe(300);
  });

  it("recusar exige a explicação, não devolve nada e mostra o porquê", async () => {
    const c = await contaComVideo();
    await pedirReembolso({ ...c, motivo: "pessoa_errada" });
    const id = await idDoPedido(c.jobId);
    await expect(
      resolverReembolso(admin, id, { aprovar: false, resposta: " " }),
    ).rejects.toThrow("Escreva por que o reembolso foi recusado.");
    await resolverReembolso(admin, id, {
      aprovar: false,
      resposta: "O vídeo foi publicado.",
    });
    expect(await saldo(c.userId)).toBe(45);
    expect(await reembolsosDaConta(c.userId)).toMatchObject([
      {
        jobId: c.jobId,
        status: "recusado",
        creditos: 255,
        resposta: "O vídeo foi publicado.",
      },
    ]);
    const avisos = await sql<{ rotulo: string; erro: boolean }>(
      "select rotulo, erro from avisos where user_id = $1",
      [c.userId],
    );
    expect(avisos).toEqual([
      { rotulo: "Reembolso recusado: O vídeo foi publicado.", erro: true },
    ]);
  });
});

describe("o que o admin vê", () => {
  it("mostra motivo, download e posts feitos com o vídeo", async () => {
    const c = await contaComVideo();
    await pedirReembolso({ ...c, motivo: "outro", detalhe: "Ficou sem som" });
    let { itens } = await listarReembolsos(null, "pendente");
    let item = itens.find((i) => i.jobId === c.jobId)!;
    expect(item).toMatchObject({
      email: `${c.userId}@exemplo.com`,
      motivo: "outro",
      detalhe: "Ficou sem som",
      creditos: 255,
      tipo: "substituir",
      baixadoEm: null,
      posts: [],
    });

    await registrarDownload(c.userId, c.key);
    await sql(
      `insert into posts_agendados (id, user_id, character_id, redes, midia_key, midia_tipo, post_date, status)
       values ($1, $2, 'p1', '{TIKTOK}', $3, 'video', now() + interval '1 day', 'SCHEDULED')`,
      [`post-${c.jobId}`, c.userId, c.key],
    );
    ({ itens } = await listarReembolsos(null));
    item = itens.find((i) => i.jobId === c.jobId)!;
    expect(item.baixadoEm).not.toBeNull();
    expect(item.posts).toMatchObject([{ status: "SCHEDULED", redes: ["TIKTOK"] }]);
  });
});
