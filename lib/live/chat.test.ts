import { generateKeyPairSync, createSign } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  assinaturaKickValida,
  idDoVideoYoutube,
  lerYoutube,
  mensagensNovas,
  receberChatKick,
  semEmotes,
  slugDoKick,
} from "./chat";
import type { LiveRow } from "./server";

describe("links do chat", () => {
  it("acha o id do vídeo do YouTube em qualquer formato de link", () => {
    for (const l of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "youtube.com/watch?v=dQw4w9WgXcQ&t=10",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ?si=abc",
      "https://m.youtube.com/shorts/dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ])
      expect(idDoVideoYoutube(l)).toBe("dQw4w9WgXcQ");
    expect(idDoVideoYoutube("https://vimeo.com/123")).toBeNull();
    expect(idDoVideoYoutube("https://www.youtube.com/@canal")).toBeNull();
  });

  it("acha o canal do Kick pelo link ou pelo nome", () => {
    expect(slugDoKick("https://kick.com/Meu-Canal")).toBe("meu-canal");
    expect(slugDoKick("@xqc")).toBe("xqc");
    expect(slugDoKick("um nome com espaço")).toBeNull();
  });

  it("tira os emotes do Kick do texto", () => {
    expect(semEmotes("Oi [emote:4148074:HYPERCLAP]  tudo bem? [emote:37226:KEKW]")).toBe("Oi tudo bem?");
  });
});

describe("assinatura do webhook do Kick", () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const assinar = (texto: string) => createSign("RSA-SHA256").update(texto).sign(privateKey, "base64");
  afterEach(() => vi.unstubAllGlobals());

  it("aceita a assinatura de <id>.<timestamp>.<corpo> e recusa corpo alterado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { public_key: pem } }))),
    );
    const corpo = '{"content":"oi"}';
    const sig = assinar(`01ABC.2026-10-14T12:00:00Z.${corpo}`);
    expect(await assinaturaKickValida("01ABC", "2026-10-14T12:00:00Z", corpo, sig)).toBe(true);
    expect(await assinaturaKickValida("01ABC", "2026-10-14T12:00:00Z", '{"content":"tchau"}', sig)).toBe(false);
  });
});

describe("mensagens do chat no banco (PGlite, com as migrations)", () => {
  let pool: Pool;
  const live = (id: string, chat: object, status = "no_ar") =>
    pool.query(
      `insert into lives (id, user_id, character_id, status, image_key, voice_id, duracao_min, sala, chat)
       values ($1, 'u1', 'c1', $2, 'k', 'v', 15, $1, $3)`,
      [id, status, JSON.stringify(chat)],
    );
  const carregar = async (id: string) =>
    (await pool.query<LiveRow>("select * from lives where id = $1", [id])).rows[0];

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
    await pool.query(
      `insert into "user" (id, name, email, "emailVerified") values ('u1', 'u1', 'u1@exemplo.com', true)`,
    );
  }, 60_000);

  it("mensagem do Kick entra só nas lives no ar ligadas ao canal, sem repetir", async () => {
    await live("k1", { kick: { slug: "canal", broadcasterId: 42 } });
    await live("k2", { kick: { slug: "outro", broadcasterId: 7 } });
    await live("k3", { kick: { slug: "canal", broadcasterId: 42 } }, "encerrada");
    const inicio = await mensagensNovas(pool, "k1", null);
    expect(inicio).toEqual({ mensagens: [], cursor: 0 });

    const evento = {
      message_id: "m1",
      broadcaster: { user_id: 42 },
      sender: { username: "ana" },
      content: "qual seu nome? [emote:1:KEKW]",
    };
    expect(await receberChatKick(pool, evento)).toBe(1);
    await receberChatKick(pool, evento); // o Kick reenviou
    const novas = await mensagensNovas(pool, "k1", inicio.cursor);
    expect(novas.mensagens).toEqual([
      { id: novas.cursor, origem: "kick", autor: "ana", texto: "qual seu nome?" },
    ]);
    expect((await mensagensNovas(pool, "k1", novas.cursor)).mensagens).toEqual([]);
    expect((await mensagensNovas(pool, "k2", 0)).mensagens).toEqual([]);
  });

  it("YouTube: busca quando dá a hora, guarda as mensagens e marca a próxima", async () => {
    process.env.YOUTUBE_API_KEY = "chave";
    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        chamadas.push(url);
        return new Response(
          JSON.stringify({
            items: [
              { id: "y1", snippet: { type: "textMessageEvent", displayMessage: "oi!" }, authorDetails: { displayName: "Bia" } },
              { id: "y2", snippet: { type: "newSponsorEvent", displayMessage: "virou membro" }, authorDetails: { displayName: "Caio" } },
            ],
            nextPageToken: "pag2",
            pollingIntervalMillis: 5000,
          }),
        );
      }),
    );
    await live("y", { youtube: { videoId: "v", liveChatId: "chat1", pageToken: "pag1", proxima: 0 } });
    await lerYoutube(pool, await carregar("y"));
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toContain("pageToken=pag1");
    const m = await mensagensNovas(pool, "y", 0);
    expect(m.mensagens.map((x) => [x.origem, x.autor, x.texto])).toEqual([["youtube", "Bia", "oi!"]]);
    const depois = (await carregar("y")).chat.youtube!;
    expect(depois.pageToken).toBe("pag2");
    expect(depois.proxima).toBeGreaterThan(Date.now() + 7000);

    // Antes da hora não busca de novo.
    await lerYoutube(pool, await carregar("y"));
    expect(chamadas).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

describe("bot do Discord", () => {
  it("lê o servidor e o canal do link do canal", async () => {
    const { canalDoDiscord } = await import("./chat");
    expect(canalDoDiscord("https://discord.com/channels/111111111111111111/222222222222222222")).toEqual({
      guildId: "111111111111111111",
      channelId: "222222222222222222",
    });
    expect(canalDoDiscord("https://ptb.discord.com/channels/123456/654321/")).toEqual({
      guildId: "123456",
      channelId: "654321",
    });
    expect(canalDoDiscord("https://discord.gg/convite")).toBeNull();
    expect(canalDoDiscord("https://discord.com/channels/@me/123456")).toBeNull();
  });

  it("o convite pede conectar, falar e virar orador no palco", async () => {
    const { conviteDoBotDiscord } = await import("./chat");
    const antes = { ...process.env };
    delete process.env.DISCORD_BOT_TOKEN;
    expect(conviteDoBotDiscord()).toBeNull();
    Object.assign(process.env, { DISCORD_BOT_TOKEN: "t", DISCORD_CLIENT_ID: "999" });
    const url = new URL(conviteDoBotDiscord()!);
    expect(url.searchParams.get("client_id")).toBe("999");
    expect(url.searchParams.get("scope")).toBe("bot");
    const p = BigInt(url.searchParams.get("permissions")!);
    for (const bit of [10n, 16n, 20n, 21n, 22n, 32n]) expect(p & (1n << bit)).not.toBe(0n);
    process.env = antes;
  });
});
