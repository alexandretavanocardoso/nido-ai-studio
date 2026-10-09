import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { getFal, mensagemDeErro } from "@/lib/fal";
import { CREDITOS_LINK } from "@/lib/planos";
import { aplicarAudio, probe, temAudio } from "@/lib/video/ffmpeg";
import {
  baixarVideo,
  detectarPlataforma,
  LinkError,
  resolverLink,
} from "@/lib/video/link";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vídeos maiores que isso nem são baixados (nenhum motor de troca aceita). */
const MAX_SEGUNDOS = 180;

const BodySchema = z.object({
  url: z.string().trim().url("Cole um link válido.").max(2000),
});

/**
 * POST — busca o vídeo de um link (TikTok, Instagram, YouTube Shorts, X ou .mp4
 * direto) e deixa uma cópia temporária no storage do fal, de onde a IA lê.
 * Nada vai pro S3. Devolve o id do link + título/autor/miniatura/duração
 * pra pessoa conferir antes de gerar. Válido por 24h.
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId } = ctx;
  const fal = getFal();
  const pool = getPool();
  if (!fal || !pool)
    return NextResponse.json(
      {
        error: "Vídeo por link não configurado (FAL_KEY).",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );

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
        error:
          "Link não suportado. Use TikTok, Instagram (reel/post), YouTube Shorts, X (post com vídeo) ou um link direto de .mp4.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );

  const gate = await allow(`link:${userId}`, 8);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitas buscas seguidas. Tente em ${gate.retryAfter}s.` },
      { status: 429 },
    );

  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_LINK,
    "video_link",
    url,
  );
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const video = await resolverLink(url);
    if (video.duracao && video.duracao > MAX_SEGUNDOS)
      throw new LinkError(
        `Vídeo com ${Math.round(video.duracao)}s — o máximo é ${MAX_SEGUNDOS}s.`,
      );

    const resultado = await comPastaTemporaria(async (dir) => {
      let arquivo = path.join(dir, "origem.mp4");
      await baixarVideo(video.videoUrl, arquivo);
      const info = await probe(arquivo);
      // YouTube em alta resolução vem com vídeo e áudio separados: junta (sem recodificar o vídeo).
      if (video.audioUrl && !(await temAudio(arquivo))) {
        const audio = path.join(dir, "audio.m4a");
        const junto = path.join(dir, "junto.mp4");
        try {
          await baixarVideo(video.audioUrl, audio, true);
          await aplicarAudio({
            video: arquivo,
            audio,
            saida: junto,
            modo: "substituir",
            duracao: info.duracao,
            videoTemAudio: false,
          });
          arquivo = junto;
        } catch (e) {
          console.warn("[videos/link] sem áudio", e);
        }
      }
      if (info.duracao > MAX_SEGUNDOS)
        throw new LinkError(
          `Vídeo com ${Math.round(info.duracao)}s — o máximo é ${MAX_SEGUNDOS}s.`,
        );
      // Cópia temporária só pra IA ler (storage do fal) — não vai pro S3.
      const falUrl = await fal.storage.upload(
        new Blob([new Uint8Array(await readFile(arquivo))], {
          type: "video/mp4",
        }),
      );
      return { info, falUrl };
    });

    const id = nanoid(12);
    await pool.query(
      `insert into links_video (id, user_id, url, plataforma, fal_url, duracao, largura, altura, titulo, autor, thumb)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        userId,
        url,
        video.plataforma,
        resultado.falUrl,
        resultado.info.duracao,
        resultado.info.largura,
        resultado.info.altura,
        video.titulo,
        video.autor,
        video.thumb,
      ],
    );
    return NextResponse.json({
      linkId: id,
      plataforma: video.plataforma,
      titulo: video.titulo,
      autor: video.autor,
      thumb: video.thumb,
      videoUrl: resultado.falUrl,
      duracao: resultado.info.duracao,
      largura: resultado.info.largura,
      altura: resultado.info.altura,
    });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof LinkError)
      return NextResponse.json(
        {
          error: `${e.message} Os créditos foram devolvidos.`,
          code: "BAD_INPUT",
        },
        { status: 400 },
      );
    console.error("[videos/link]", e);
    return NextResponse.json(
      {
        error: `${mensagemDeErro(e)} Os créditos foram devolvidos.`,
        code: "PROVIDER_ERROR",
      },
      { status: 502 },
    );
  }
}
