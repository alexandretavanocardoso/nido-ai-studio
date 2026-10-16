import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { ApiError } from "@fal-ai/client";
import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "@neondatabase/serverless";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/lib/db", () => ({ getPool: () => banco.pool }));

const servicos = vi.hoisted(() => ({
  pedidos: [] as { prompt: string; refs: number }[],
  enviados: [] as Record<string, unknown>[],
  status: "IN_PROGRESS" as string,
  resultado: { data: { model_glb: { url: "https://fal.media/modelo.glb" } } } as unknown,
  falhaResultado: null as Error | null,
  salvos: [] as { key: string; tipo: string; bytes: number }[],
  estornos: [] as unknown[],
}));

vi.mock("@/lib/ai/gemini", () => ({
  shrinkReferencia: async () => ({ mimeType: "image/jpeg", data: "Zm90bw==" }),
  generateImage: async (o: { prompt: string; referencias: unknown[] }) => {
    servicos.pedidos.push({ prompt: o.prompt, refs: o.referencias.length });
    return Buffer.from("desenho");
  },
}));
vi.mock("@/lib/fal", async (original) => ({
  ...(await original<typeof import("@/lib/fal")>()),
  getFal: () => ({
    queue: {
      submit: async (_m: string, o: { input: Record<string, unknown> }) => {
        servicos.enviados.push(o.input);
        return { request_id: `req-${servicos.enviados.length}` };
      },
      status: async () => ({ status: servicos.status }),
      result: async () => {
        if (servicos.falhaResultado) throw servicos.falhaResultado;
        return servicos.resultado;
      },
    },
  }),
}));
vi.mock("@/lib/storage/s3", async (original) => ({
  ...(await original<typeof import("@/lib/storage/s3")>()),
  getBucket: () => "bucket",
  getObjectBuffer: async () => Buffer.from("foto"),
  presignGet: async (_s3: unknown, key: string) => `https://s3.exemplo/${key}`,
  putObject: async (_s3: unknown, key: string, body: Buffer, tipo: string) => {
    servicos.salvos.push({ key, tipo, bytes: body.length });
  },
}));
vi.mock("@/lib/creditos", () => ({
  estornarSeHouver: async (c: unknown) => {
    if (c) servicos.estornos.push(c);
  },
}));

import {
  avancarAvatar3d,
  avatar3dDaFoto,
  criarAvatar3d,
  entradaModelo3d,
  MODELO_3D,
  PEDIDO_ESTILO,
  pedidoFundo3d,
  type Avatar3dRow,
} from "./avatar3d";
import { creditosPorMinuto, CREDITOS_POR_MINUTO, ehSombra } from "./tipos";
import { limparUsuario } from "@/lib/storage/cleanup";
import { creditosSombra3d, CREDITOS_AVATAR_3D, CREDITOS_SOMBRA_POR_MINUTO } from "@/lib/planos";

const s3 = {} as S3Client;
const cobranca = { userId: "u1", total: CREDITOS_AVATAR_3D, doPlano: 0, doAvulso: CREDITOS_AVATAR_3D } as never;

describe("preço da Sombra 3D", () => {
  it("o minuto é barato (sem IA) e sobe com a voz trocada; a Decart continua mais cara", () => {
    expect(creditosPorMinuto("sombra3d", false)).toBe(5);
    expect(creditosPorMinuto("sombra3d", true)).toBe(20);
    expect(creditosSombra3d(15, false)).toBe(75);
    expect(creditosSombra3d(15, true)).toBe(300);
    expect(creditosPorMinuto("sombra", true)).toBe(CREDITOS_SOMBRA_POR_MINUTO);
    expect(CREDITOS_POR_MINUTO.sombra3d).toBeLessThan(CREDITOS_POR_MINUTO.avatar);
    expect(ehSombra("sombra3d")).toBe(true);
    expect(ehSombra("avatar")).toBe(false);
  });

  it("o pedido do desenho guarda a cara da pessoa, de frente, olhos abertos e boca fechada; o fundo não tem gente", () => {
    expect(PEDIDO_ESTILO).toMatch(/recognisable/);
    expect(PEDIDO_ESTILO).toMatch(/facing the camera directly/);
    expect(PEDIDO_ESTILO).toMatch(/mouth closed/);
    expect(PEDIDO_ESTILO).toMatch(/sunglasses up onto the head/);
    expect(pedidoFundo3d("quarto gamer")).toContain("«quarto gamer»");
    expect(pedidoFundo3d("x")).toMatch(/No people/);
    expect(entradaModelo3d("u")).toEqual({ image_url: "u", decimation_target: 80_000, texture_size: "2048" });
    expect(MODELO_3D).toBe("fal-ai/trellis-2");
  });
});

describe("avatar 3D no banco (PGlite, com as migrations)", () => {
  let pool: Pool;

  beforeAll(async () => {
    const db = new PGlite();
    for (const f of readdirSync("db/migrations").sort()) await db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
    pool = {
      query: async (sql: string, p?: unknown[]) => {
        const r = await db.query(sql, p);
        return { rows: r.rows, rowCount: r.rows.length || (r.affectedRows ?? 0) };
      },
    } as unknown as Pool;
    banco.pool = pool;
    await pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u1', 'u1', 'u1@exemplo.com', true)`);
  }, 60_000);

  beforeEach(() => {
    servicos.status = "IN_PROGRESS";
    servicos.falhaResultado = null;
    servicos.salvos = [];
    servicos.estornos = [];
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
  });

  it("monta: a versão desenho (com a foto de referência) e o pedido do 3D com ela; fica gerando", async () => {
    const a = await criarAvatar3d(pool, s3, { userId: "u1", imageKey: "users/u1/refs/foto.jpg", cobranca });
    expect(a.status).toBe("gerando");
    expect(a.fal_request_id).toBe("req-1");
    expect(servicos.pedidos.at(-1)).toEqual({ prompt: PEDIDO_ESTILO, refs: 1 });
    expect(a.estilizada_key).toMatch(/^users\/u1\/refs\/.+\.jpg$/);
    expect(servicos.enviados.at(-1)).toMatchObject({ image_url: `https://s3.exemplo/${a.estilizada_key}` });
    // Outra live com a mesma foto reaproveita (sem cobrar de novo).
    expect((await avatar3dDaFoto(pool, "u1", "users/u1/refs/foto.jpg"))?.id).toBe(a.id);
    expect(await avatar3dDaFoto(pool, "u1", "users/u1/refs/outra.jpg")).toBeNull();
  });

  it("ainda no fal: continua gerando; pronto: o .glb vai para o S3 (pasta modelos) e fica pronto", async () => {
    const a = (await avatar3dDaFoto(pool, "u1", "users/u1/refs/foto.jpg"))!;
    expect((await avancarAvatar3d(pool, s3, a)).status).toBe("gerando");
    servicos.status = "COMPLETED";
    const pronto = await avancarAvatar3d(pool, s3, a);
    expect(pronto.status).toBe("pronto");
    expect(pronto.modelo_key).toMatch(/^users\/u1\/modelos\/.+\.glb$/);
    expect(servicos.salvos).toEqual([{ key: pronto.modelo_key, tipo: "model/gltf-binary", bytes: 4 }]);
    expect(servicos.estornos).toEqual([]);
    // Pronto não consulta mais nada.
    expect(await avancarAvatar3d(pool, s3, pronto)).toBe(pronto);
  });

  it("o fal recusou: erro, créditos de volta uma vez só, e a foto não reaproveita o avatar com erro", async () => {
    const a = await criarAvatar3d(pool, s3, { userId: "u1", imageKey: "users/u1/refs/b.jpg", cobranca });
    servicos.status = "COMPLETED";
    servicos.falhaResultado = new ApiError({ message: "x", status: 422, body: { detail: "imagem ruim" }, requestId: "r" });
    const falhou = await avancarAvatar3d(pool, s3, a);
    expect(falhou.status).toBe("erro");
    expect(falhou.erro).toContain("imagem ruim");
    await avancarAvatar3d(pool, s3, a); // a tela pergunta de novo com o objeto antigo
    expect(servicos.estornos).toHaveLength(1);
    expect(await avatar3dDaFoto(pool, "u1", "users/u1/refs/b.jpg")).toBeNull();
  });

  it("falha de rede ao baixar: continua gerando e tenta na próxima", async () => {
    const a = await criarAvatar3d(pool, s3, { userId: "u1", imageKey: "users/u1/refs/c.jpg", cobranca: null });
    servicos.status = "COMPLETED";
    vi.stubGlobal("fetch", async () => {
      throw new Error("rede");
    });
    expect((await avancarAvatar3d(pool, s3, a)).status).toBe("gerando");
    expect(servicos.estornos).toEqual([]);
  });

  it("perdido no fal (mais de 20 min): erro e créditos de volta", async () => {
    const a = await criarAvatar3d(pool, s3, { userId: "u1", imageKey: "users/u1/refs/d.jpg", cobranca });
    await pool.query("update avatares_3d set created_at = now() - interval '25 minutes' where id = $1", [a.id]);
    const velho = { ...a, created_at: new Date(Date.now() - 25 * 60_000) } as Avatar3dRow;
    const r = await avancarAvatar3d(pool, s3, velho);
    expect(r.status).toBe("erro");
    expect(servicos.estornos).toHaveLength(1);
  });

  it("a limpeza do armazenamento guarda a versão desenho e o modelo 3D", async () => {
    const a = (await avatar3dDaFoto(pool, "u1", "users/u1/refs/foto.jpg"))!;
    const velho = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const apagados: string[] = [];
    const cliente = {
      send: async (cmd: unknown) => {
        if (cmd instanceof ListObjectsV2Command)
          return {
            Contents: [a.estilizada_key!, a.modelo_key!, "users/u1/modelos/orfao.glb"].map((Key) => ({ Key, LastModified: velho, Size: 1 })),
          };
        if (cmd instanceof DeleteObjectsCommand) apagados.push(...cmd.input.Delete!.Objects!.map((o) => o.Key!));
        return {};
      },
    } as unknown as S3Client;
    await limparUsuario(cliente, pool, "u1", 24 * 3600 * 1000);
    expect(apagados).toEqual(["users/u1/modelos/orfao.glb"]);
  });
});
