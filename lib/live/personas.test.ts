import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "@neondatabase/serverless";
import type RunwayML from "@runwayml/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { duracaoLiveValida } from "@/lib/planos";
import { esconderPersona, personasSalvas } from "./personas";
import { avatarReaproveitavel } from "./server";

describe("personas avulsas salvas (PGlite, com as migrations)", () => {
  let pool: Pool;
  let n = 0;
  const live = (persona: object | null, image = "u1/refs/a.jpg", voz = "v1", user = "u1") =>
    pool.query(
      `insert into lives (id, user_id, character_id, persona, status, image_key, voice_id, duracao_min, sala, created_at)
       values ($1, $2, $3, $4, 'encerrada', $5, $6, 15, $1, now() + make_interval(secs => $7))`,
      [`l${++n}`, user, persona ? null : "c1", persona ? JSON.stringify(persona) : null, image, voz, n],
    );

  beforeAll(async () => {
    const db = new PGlite();
    for (const f of readdirSync("db/migrations").sort())
      await db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
    pool = {
      query: async (sql: string, p?: unknown[]) => {
        const r = await db.query(sql, p);
        return { rows: r.rows, rowCount: r.rows.length || (r.affectedRows ?? 0) };
      },
    } as unknown as Pool;
    for (const u of ["u1", "u2"])
      await pool.query(
        `insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1 || '@exemplo.com', true)`,
        [u],
      );
  }, 60_000);

  it("a mesma persona aparece uma vez, com a descrição e a voz da live mais recente", async () => {
    await live({ nome: "Caio", descricao: "primeira versão", vozNome: "Voz A" }, "u1/refs/caio.jpg", "vA");
    await live(null); // live com personagem: não entra
    await live({ nome: "Bia", descricao: "barista", vozNome: "Voz B" }, "u1/refs/bia.jpg", "vB");
    await live({ nome: "Caio", descricao: "segunda versão", vozNome: "Voz C" }, "u1/refs/caio.jpg", "vC");
    await live({ nome: "Outra conta", descricao: "x" }, "u2/refs/x.jpg", "vX", "u2");

    expect(await personasSalvas(pool, "u1")).toEqual([
      { nome: "Caio", descricao: "segunda versão", vozNome: "Voz C", imageKey: "u1/refs/caio.jpg", voiceId: "vC", cena: null },
      { nome: "Bia", descricao: "barista", vozNome: "Voz B", imageKey: "u1/refs/bia.jpg", voiceId: "vB", cena: null },
    ]);
  });

  it("tirar da lista esconde; usar de novo numa live nova faz voltar", async () => {
    await esconderPersona(pool, "u1", { imageKey: "u1/refs/bia.jpg", nome: "Bia" });
    expect((await personasSalvas(pool, "u1")).map((p) => p.nome)).toEqual(["Caio"]);
    await live({ nome: "Bia", descricao: "voltou", vozNome: "Voz B" }, "u1/refs/bia.jpg", "vB");
    expect((await personasSalvas(pool, "u1")).map((p) => p.nome)).toEqual(["Bia", "Caio"]);
  });
});

describe("avatar reaproveitado com cenário (PGlite)", () => {
  // Todo avatar consultado está pronto no Runway.
  const rw = { avatars: { retrieve: async () => ({ status: "READY" }) } } as unknown as RunwayML;

  it("só reaproveita com a mesma foto e o mesmo cenário; sem cenário, ignora os com cenário", async () => {
    const db = new PGlite();
    for (const f of readdirSync("db/migrations").sort())
      await db.exec(readFileSync(`db/migrations/${f}`, "utf8"));
    const pool = {
      query: async (sql: string, p?: unknown[]) => {
        const r = await db.query(sql, p);
        return { rows: r.rows, rowCount: r.rows.length || (r.affectedRows ?? 0) };
      },
    } as unknown as Pool;
    await pool.query(`insert into "user" (id, name, email, "emailVerified") values ('u', 'u', 'u@exemplo.com', true)`);
    const live = (id: string, avatar: string, cena: object | null) =>
      pool.query(
        `insert into lives (id, user_id, character_id, status, image_key, voice_id, avatar_id, duracao_min, sala, cena)
         values ($1, 'u', 'c', 'encerrada', 'u/refs/foto.jpg', 'v', $2, 15, $1, $3)`,
        [id, avatar, cena ? JSON.stringify(cena) : null],
      );
    await live("a", "AV_PRAIA", { prompt: "numa praia" });
    await live("b", "AV_FOTO", null);

    const foto = "u/refs/foto.jpg";
    expect(await avatarReaproveitavel(pool, rw, "u", foto, { prompt: "numa praia" })).toBe("AV_PRAIA");
    expect(await avatarReaproveitavel(pool, rw, "u", foto, null)).toBe("AV_FOTO");
    expect(await avatarReaproveitavel(pool, rw, "u", foto, { prompt: "numa cafeteria" })).toBeNull();
  }, 60_000);
});

describe("duração da live", () => {
  it("aceita minutos inteiros de 1 a 120", () => {
    expect([1, 7, 120].every(duracaoLiveValida)).toBe(true);
    expect([0, 121, 2.5, Number.NaN].some(duracaoLiveValida)).toBe(false);
  });
});
