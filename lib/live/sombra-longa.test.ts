import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "@neondatabase/serverless";
import { beforeAll, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("@/lib/db", () => ({ getPool: () => banco.pool }));
vi.mock("@/lib/storage/s3", async (original) => ({
  ...(await original<typeof import("@/lib/storage/s3")>()),
  getBucket: () => "bucket",
}));

import { limparUsuario } from "@/lib/storage/cleanup";
import { jobsPendentes } from "@/lib/video/finalizar";
import { consultarNido, keyDoNido } from "@/lib/video/jobs";
import { PRAZO_SINAL_MS, pegarTrabalho, salvarTrabalho } from "@/worker/sombra/banco";
import { cortes, noTrecho } from "@/worker/sombra/processar";
import { agruparSegmentos, escolherVariante, lerLinkVod, lerSegmentos } from "@/worker/sombra/vod";

describe("links de live gravada (Twitch e Kick)", () => {
  it("reconhece VOD e clipe nos formatos de link que as pessoas colam", () => {
    expect(lerLinkVod("https://www.twitch.tv/videos/2900674109?t=1h2m")).toEqual({ plataforma: "twitch", tipo: "vod", id: "2900674109" });
    expect(lerLinkVod("https://m.twitch.tv/shroud/v/123")).toEqual({ plataforma: "twitch", tipo: "vod", id: "123" });
    expect(lerLinkVod("https://www.twitch.tv/shroud/clip/Bonito-Clipe-abc")).toEqual({ plataforma: "twitch", tipo: "clipe", id: "Bonito-Clipe-abc" });
    expect(lerLinkVod("https://clips.twitch.tv/Bonito-Clipe-abc")).toEqual({ plataforma: "twitch", tipo: "clipe", id: "Bonito-Clipe-abc" });
    expect(lerLinkVod("https://kick.com/adinross/videos/10206348-472b-4f62-af77-d59052e0b919")).toEqual({
      plataforma: "kick",
      tipo: "vod",
      id: "10206348-472b-4f62-af77-d59052e0b919",
    });
    expect(lerLinkVod("https://kick.com/adinross?clip=clip_01M4")).toEqual({ plataforma: "kick", tipo: "clipe", id: "clip_01M4" });
    expect(lerLinkVod("https://kick.com/adinross/clips/clip_01M4")).toEqual({ plataforma: "kick", tipo: "clipe", id: "clip_01M4" });
  });

  it("canal ao vivo, outras redes e texto qualquer não são VOD", () => {
    expect(lerLinkVod("https://www.twitch.tv/shroud")).toBeNull();
    expect(lerLinkVod("https://kick.com/adinross")).toBeNull();
    expect(lerLinkVod("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(lerLinkVod("não é link")).toBeNull();
  });
});

describe("HLS da live gravada", () => {
  const MESTRE = [
    "#EXTM3U",
    '#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,VIDEO="1080p60"',
    "1080p60/index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=3400000,RESOLUTION=1280x720,VIDEO="720p60"',
    "720p60/index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=852x480,VIDEO="480p30"',
    "480p30/index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=160000,CODECS="mp4a.40.2",VIDEO="audio_only"',
    "audio_only/index.m3u8",
  ].join("\n");

  it("escolhe a maior qualidade até 720p (o Lucy devolve 720p) e ignora a só de áudio", () => {
    expect(escolherVariante(MESTRE, "https://cdn.x/vod/master.m3u8")).toBe("https://cdn.x/vod/720p60/index.m3u8");
  });

  it("lê os pedaços com a duração de cada um, em endereços completos", () => {
    const segs = lerSegmentos("#EXTM3U\n#EXTINF:10.000,\n0.ts\n#EXTINF:9.5,\n1.ts\n#EXT-X-ENDLIST", "https://cdn.x/vod/720p60/index.m3u8");
    expect(segs).toEqual([
      { url: "https://cdn.x/vod/720p60/0.ts", dur: 10 },
      { url: "https://cdn.x/vod/720p60/1.ts", dur: 9.5 },
    ]);
  });

  const pedacos = (n: number, dur = 10) => Array.from({ length: n }, (_, i) => ({ url: `${i}.ts`, dur }));

  it("agrupa em partes de ~5 min na divisa dos pedaços; uma sobra curta vai com a anterior", () => {
    const partes = agruparSegmentos(pedacos(62), 300); // 620 s
    expect(partes.map((p) => p.dur)).toEqual([300, 320]);
    expect(partes[1].inicio).toBe(300);
    expect(partes.flatMap((p) => p.segs).length).toBe(62);
  });

  it("trecho: só os pedaços dentro dele (live de 120 min, do minuto 45, 30 min)", () => {
    const segs = noTrecho(pedacos(720), 45 * 60, 75 * 60);
    expect(segs.length).toBe(180);
    expect(segs[0].url).toBe("270.ts");
    expect(agruparSegmentos(segs, 300).length).toBe(6);
  });

  it("arquivo: cortes iguais dentro do trecho", () => {
    expect(cortes(60, 960, 300).map((c) => [c.inicio, c.dur])).toEqual([
      [60, 300],
      [360, 300],
      [660, 300],
    ]);
    expect(cortes(0, 20, 300)).toEqual([{ i: 0, inicio: 0, dur: 20 }]);
  });
});

describe("processo da Sombra no banco (PGlite, com as migrations)", () => {
  let pool: Pool;
  let n = 0;
  const novoJob = async (criadoHaMin = 0) => {
    const id = `j${++n}`;
    await pool.query(
      `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao, created_at)
       values ($1, 'u1', 'sombra', 'nido', 'substituir', 'lucy-2.5', $1, $2, 1800, now() - make_interval(mins => $3))`,
      [
        id,
        JSON.stringify({
          origemDoJob: "sombra_video",
          fonte: { tipo: "vod", url: "https://www.twitch.tv/videos/1" },
          trecho: { inicio: 2700, fim: 4500 },
          pedido: "Replace the person…",
          imageKey: "users/u1/refs/a.jpg",
          voiceId: null,
          cobranca: null,
        }),
        criadoHaMin,
      ],
    );
    return id;
  };

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

  it("pega o trabalho uma vez só, com o trecho; na fila, a tela vê \"na fila\"", async () => {
    const id = await novoJob();
    expect(await consultarNido(id)).toEqual({ estado: "na_fila" });
    const t = await pegarTrabalho(pool);
    expect(t).toMatchObject({ id, userId: "u1", duracao: 1800, trecho: { inicio: 2700, fim: 4500 }, voiceId: null });
    expect(t!.trabalho).toMatchObject({ estado: "processando", partes: {} });
    expect(await pegarTrabalho(pool)).toBeNull(); // já tem dono, com sinal de vida
  });

  it("guarda as partes prontas e a tela vê o andamento; pronto vira \"nido:<key>\"", async () => {
    const id = `j${n}`;
    await salvarTrabalho(pool, id, { estado: "processando", total: 4 });
    await salvarTrabalho(pool, id, { parte: [0, { key: "users/u1/videos/sombra-x-p0.mp4", dur: 300 }] });
    await salvarTrabalho(pool, id, { parte: [2, { key: "users/u1/videos/sombra-x-p2.mp4", dur: 300 }] });
    expect(await consultarNido(id)).toEqual({ estado: "processando", progresso: 0.5 });
    await salvarTrabalho(pool, id, { estado: "concluido", key: "users/u1/videos/final.mp4", size: 1234 });
    const e = await consultarNido(id);
    expect(e).toEqual({ estado: "concluido", videoUrl: "nido:users/u1/videos/final.mp4" });
    expect(keyDoNido((e as { videoUrl: string }).videoUrl)).toBe("users/u1/videos/final.mp4");
  });

  it("processo que caiu: outro retoma depois do prazo, com as partes que já estavam prontas", async () => {
    const id = await novoJob();
    const antes = Date.now() - PRAZO_SINAL_MS - 60_000;
    expect((await pegarTrabalho(pool, antes))?.id).toBe(id);
    await salvarTrabalho(pool, id, { parte: [1, { key: "k1", dur: 300 }] }, antes);
    const retomado = await pegarTrabalho(pool);
    expect(retomado?.id).toBe(id);
    expect(retomado?.trabalho?.partes).toEqual({ "1": { key: "k1", dur: 300 } });
  });

  it("erro do processo vai para a tela (o app devolve os créditos)", async () => {
    const id = `j${n}`;
    await salvarTrabalho(pool, id, { estado: "erro", erro: "A conta da Decart está sem créditos." });
    expect(await consultarNido(id)).toEqual({ estado: "erro", mensagem: "A conta da Decart está sem créditos." });
  });

  it("parado há 15 min sem nenhum sinal de vida: o processo não está ligado; esperando atrás de outro, não", async () => {
    // Sinal de vida recente de outro vídeo (o processo está ocupado com ele).
    const ocupado = await novoJob();
    await pegarTrabalho(pool);
    const esperando = await novoJob(20);
    expect(await consultarNido(esperando)).toEqual({ estado: "na_fila" });
    // Sem sinal de vida em nenhum vídeo: desligado.
    await pool.query(`update video_jobs set input = jsonb_set(input, '{trabalho,vivoEm}', '0'::jsonb) where provedor = 'nido'`);
    expect((await consultarNido(esperando)).estado).toBe("erro");
    expect(ocupado).toBeTruthy();
  });

  it("o cron (que o processo chama ao terminar) finaliza primeiro os da Sombra já prontos", async () => {
    await pool.query(
      `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, created_at)
       values ('velho', 'u1', 'c1', 'fal', 'video', 'm', 'r', '{}', now() - interval '2 hours')`,
    );
    const [primeiro] = await jobsPendentes(1);
    const { rows } = await pool.query<{ e: string }>("select input->'trabalho'->>'estado' as e from video_jobs where id = $1", [primeiro]);
    expect(["concluido", "erro"]).toContain(rows[0].e);
  });

  it("a limpeza do armazenamento não apaga a foto da live (as personas salvas reusam)", async () => {
    await pool.query(
      `insert into lives (id, user_id, persona, status, image_key, voice_id, duracao_min, sala)
       values ('lx', 'u1', '{"nome":"Bia","descricao":"barista"}', 'encerrada', 'users/u1/refs/foto-live.jpg', 'v1', 15, 'lx')`,
    );
    const velho = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const apagados: string[] = [];
    const s3 = {
      send: async (cmd: unknown) => {
        if (cmd instanceof ListObjectsV2Command)
          return {
            Contents: [
              { Key: "users/u1/refs/foto-live.jpg", LastModified: velho, Size: 1 },
              { Key: "users/u1/refs/orfa.jpg", LastModified: velho, Size: 1 },
            ],
          };
        if (cmd instanceof DeleteObjectsCommand) apagados.push(...cmd.input.Delete!.Objects!.map((o) => o.Key!));
        return {};
      },
    } as unknown as S3Client;
    await limparUsuario(s3, pool, "u1", 24 * 3600 * 1000);
    expect(apagados).toEqual(["users/u1/refs/orfa.jpg"]);
  });
});
