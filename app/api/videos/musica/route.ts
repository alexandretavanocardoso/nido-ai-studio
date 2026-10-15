import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { DECLARACAO_MUSICA } from "@/lib/declaracoes";
import { somarArmazenamento } from "@/lib/limites";
import { MUSICA_MAX_SEGUNDOS, type MusicaDeFundo } from "@/lib/musica";
import { CREDITOS_LINK } from "@/lib/planos";
import { newKey, uploadFromFile } from "@/lib/storage/s3";
import { audioDaMusica } from "@/lib/video/ffmpeg";
import { baixarVideo, detectarPlataforma, LinkError, resolverLink } from "@/lib/video/link";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vídeos mais longos que isso nem são baixados (um clipe de música cabe com folga). */
const MAX_SEGUNDOS_DO_LINK = 15 * 60;

const BodySchema = z.object({
  url: z.string().trim().url("Cole um link válido.").max(2000),
  declaracao: z.literal(DECLARACAO_MUSICA, {
    message: "Confirme que tem direito de usar a música.",
  }),
});

/**
 * POST — tira a música de um link (YouTube, TikTok, Instagram, X ou arquivo
 * direto): baixa pelo mesmo caminho do vídeo por link (Apify), guarda só o
 * áudio (até 5 min) na pasta `audios` e devolve a música para o vídeo de
 * produto ou o motion. Registra a declaração de direito de uso.
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const pool = getPool();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const { url } = parsed.data;
  if (!detectarPlataforma(url))
    return NextResponse.json(
      {
        error: "Link não suportado. Use YouTube, TikTok, Instagram, X ou um link direto de vídeo.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );

  const gate = await allow(`musica:${userId}`, 8);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitas buscas seguidas. Tente em ${gate.retryAfter}s.` },
      { status: 429 },
    );

  const cobrado = await cobrarOuResponder(userId, CREDITOS_LINK, "video_link", `musica:${url}`);
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const video = await resolverLink(url);
    if (video.duracao && video.duracao > MAX_SEGUNDOS_DO_LINK)
      throw new LinkError(`Vídeo com ${Math.round(video.duracao / 60)} min — o máximo é 15 min.`);

    const { key, size } = await comPastaTemporaria(async (dir) => {
      const origem = path.join(dir, video.audioUrl ? "origem.m4a" : "origem.mp4");
      // O YouTube costuma trazer o áudio separado: baixa só ele.
      await baixarVideo(video.audioUrl ?? video.videoUrl, origem, !!video.audioUrl);
      const saida = path.join(dir, "musica.m4a");
      await audioDaMusica(origem, saida, MUSICA_MAX_SEGUNDOS);
      const key = newKey(userId, "audios", "audio/mp4");
      await uploadFromFile(s3, key, saida, "audio/mp4");
      return { key, size: (await stat(saida)).size };
    });
    await somarArmazenamento(userId, size);
    await pool
      ?.query(
        "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'uso_musica_link', $4, $5)",
        [nanoid(14), userId, "musica", `${DECLARACAO_MUSICA} [${url}]`, readIp(req)],
      )
      .catch((e) => console.warn("[videos/musica] declaração:", (e as Error).message));

    const musica: MusicaDeFundo = { key, nome: video.titulo ?? "Música do link", origem: "link" };
    return NextResponse.json({ musica });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof LinkError)
      return NextResponse.json(
        { error: `${e.message} Os créditos foram devolvidos.`, code: "BAD_INPUT" },
        { status: 400 },
      );
    console.error("[videos/musica]", e);
    return NextResponse.json(
      {
        error: "Não consegui tirar a música desse link. Os créditos foram devolvidos.",
        code: "PROVIDER_ERROR",
      },
      { status: 502 },
    );
  }
}
