import { describe, expect, it, vi } from "vitest";
import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "@neondatabase/serverless";

vi.mock("./s3", () => ({ getBucket: () => "bucket" }));
const { cleanupOrphans } = await import("./cleanup");

const VELHO = new Date(Date.now() - 30 * 24 * 3600 * 1000);
const NOVO = new Date();

function fakeS3(objetos: Record<string, Array<{ Key: string; LastModified: Date }>>) {
  const apagados: string[] = [];
  const send = vi.fn(async (cmd: unknown) => {
    if (cmd instanceof ListObjectsV2Command) {
      const { Prefix, Delimiter } = cmd.input;
      if (Delimiter) return { CommonPrefixes: Object.keys(objetos).map((p) => ({ Prefix: p })) };
      return { Contents: objetos[Prefix!] ?? [] };
    }
    if (cmd instanceof DeleteObjectsCommand) {
      apagados.push(...cmd.input.Delete!.Objects!.map((o) => o.Key!));
      return {};
    }
    throw new Error("comando inesperado");
  });
  return { s3: { send } as unknown as S3Client, apagados };
}

function fakePool(dados: Record<string, unknown[]>) {
  return {
    query: vi.fn(async (_sql: string, [userId]: [string]) => ({
      rows: (dados[userId] ?? []).map((d) => ({ json: JSON.stringify(d) })),
    })),
  } as unknown as Pool;
}

describe("cleanupOrphans", () => {
  it("apaga só arquivos sem uso e com mais de 7 dias", async () => {
    const { s3, apagados } = fakeS3({
      "users/u1/": [
        { Key: "users/u1/refs/emuso.jpg", LastModified: VELHO },
        { Key: "users/u1/refs/historico.jpg", LastModified: VELHO },
        { Key: "users/u1/generated/galeria.jpg", LastModified: VELHO },
        { Key: "users/u1/videos/orfao.mp4", LastModified: VELHO },
        { Key: "users/u1/refs/recente.jpg", LastModified: NOVO },
      ],
    });
    const pool = fakePool({
      u1: [
        {
          visual: { referencias: [{ key: "users/u1/refs/emuso.jpg" }] },
          geradas: [{ key: "users/u1/generated/galeria.jpg" }],
          _history: [{ snapshot: { visual: { referencias: [{ key: "users/u1/refs/historico.jpg" }] } } }],
        },
      ],
    });
    const stats = await cleanupOrphans(s3, pool);
    expect(apagados).toEqual(["users/u1/videos/orfao.mp4"]);
    expect(stats).toEqual({ usuarios: 1, arquivos: 5, apagados: 1 });
  });

  it("referência de outra conta não protege arquivo da conta atual", async () => {
    const { s3, apagados } = fakeS3({
      "users/u1/": [{ Key: "users/u1/refs/a.jpg", LastModified: VELHO }],
      "users/u2/": [{ Key: "users/u2/refs/b.jpg", LastModified: VELHO }],
    });
    const pool = fakePool({ u2: [{ visual: { referencias: [{ key: "users/u1/refs/a.jpg" }, { key: "users/u2/refs/b.jpg" }] } }] });
    await cleanupOrphans(s3, pool);
    expect(apagados).toEqual(["users/u1/refs/a.jpg"]);
  });

  it("a foto de perfil enviada não é apagada", async () => {
    const { s3, apagados } = fakeS3({
      "users/u1/": [
        { Key: "users/u1/refs/foto.jpg", LastModified: VELHO },
        { Key: "users/u1/refs/antiga.jpg", LastModified: VELHO },
      ],
    });
    // A linha da foto de perfil vem na mesma consulta das fichas (o endereço do arquivo).
    const pool = fakePool({ u1: ["/api/storage/file/users/u1/refs/foto.jpg"] });
    await cleanupOrphans(s3, pool);
    expect(apagados).toEqual(["users/u1/refs/antiga.jpg"]);
  });

  it("PFPs e fotos da Sombra ficam enquanto a conta existe; de conta apagada, vão embora", async () => {
    const { s3, apagados } = fakeS3({
      "users/u1/": [
        { Key: "users/u1/pfp/a.jpg", LastModified: VELHO },
        { Key: "users/u1/sombra/s.jpg", LastModified: VELHO },
        { Key: "users/u1/refs/foto.jpg", LastModified: VELHO },
      ],
      "users/u2/": [
        { Key: "users/u2/pfp/b.jpg", LastModified: VELHO },
        { Key: "users/u2/sombra/t.jpg", LastModified: VELHO },
      ],
    });
    const pool = {
      query: vi.fn(async (sql: string, [userId]: [string]) =>
        sql.includes('from "user"')
          ? { rows: [], rowCount: userId === "u1" ? 1 : 0 }
          : { rows: [] },
      ),
    } as unknown as Pool;
    await cleanupOrphans(s3, pool);
    expect(apagados).toEqual([
      "users/u1/refs/foto.jpg",
      "users/u2/pfp/b.jpg",
      "users/u2/sombra/t.jpg",
    ]);
  });
});
