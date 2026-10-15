import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { allow } from "@/lib/ai/rate-limit";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import { mensagemDeErro } from "@/lib/fal";
import { somarArmazenamento } from "@/lib/limites";
import { CREDITOS_LINK } from "@/lib/planos";
import { uploadFromFile } from "@/lib/storage/s3";
import { aplicarAudio, probe, temAudio } from "@/lib/video/ffmpeg";
import { baixarVideo, detectarPlataforma, LinkError, resolverLink } from "@/lib/video/link";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";
import { REFERENCIA_MAX_SEGUNDOS } from "@/worker/motion/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Um pouco de folga: um vídeo de "1 minuto" costuma ter 60,4 s. */
const FOLGA_SEGUNDOS = 1;

const BodySchema = z.object({
  url: z.string().trim().url("Cole um link válido.").max(2000),
});

/**
 * POST — busca o vídeo de referência do Motion num link (YouTube, TikTok,
 * Instagram, X ou arquivo direto), até 1 minuto, e guarda no S3 (pasta
 * `videos`) para o worker assistir. Devolve a key, a duração e o tamanho.
 * Custa como um vídeo por link (devolvido se falhar).
 */
export async function POST(req: Request) {
  const bloqueio = await liberadoOuResponder("motion");
  if (bloqueio) return bloqueio;
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message, code: "BAD_INPUT" }, { status: 400 });
  const { url } = parsed.data;
  if (!detectarPlataforma(url))
    return NextResponse.json(
      { error: "Link não suportado. Use YouTube, TikTok, Instagram, X ou um link direto de vídeo.", code: "BAD_INPUT" },
      { status: 400 },
    );

  const gate = await allow(`link:${userId}`, 8);
  if (!gate.ok)
    return NextResponse.json({ error: `Muitas buscas seguidas. Tente em ${gate.retryAfter}s.` }, { status: 429 });

  const cobrado = await cobrarOuResponder(userId, CREDITOS_LINK, "video_link", `motion:${url}`);
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const video = await resolverLink(url);
    if (video.duracao && video.duracao > REFERENCIA_MAX_SEGUNDOS + FOLGA_SEGUNDOS)
      throw new LinkError(`Vídeo com ${Math.round(video.duracao)}s — o máximo é ${REFERENCIA_MAX_SEGUNDOS}s.`);

    const { key, info, size } = await comPastaTemporaria(async (dir) => {
      let arquivo = path.join(dir, "origem.mp4");
      await baixarVideo(video.videoUrl, arquivo);
      const info = await probe(arquivo);
      if (info.duracao > REFERENCIA_MAX_SEGUNDOS + FOLGA_SEGUNDOS)
        throw new LinkError(`Vídeo com ${Math.round(info.duracao)}s — o máximo é ${REFERENCIA_MAX_SEGUNDOS}s.`);
      // YouTube em alta resolução vem com vídeo e áudio separados: junta (o áudio pode virar a música).
      if (video.audioUrl && !(await temAudio(arquivo))) {
        const audio = path.join(dir, "audio.m4a");
        const junto = path.join(dir, "junto.mp4");
        try {
          await baixarVideo(video.audioUrl, audio, true);
          await aplicarAudio({ video: arquivo, audio, saida: junto, modo: "substituir", duracao: info.duracao, videoTemAudio: false });
          arquivo = junto;
        } catch (e) {
          console.warn("[motion/referencia] sem áudio", e);
        }
      }
      const key = `users/${userId}/videos/${nanoid(12)}.mp4`;
      await uploadFromFile(s3, key, arquivo, "video/mp4");
      return { key, info, size: (await stat(arquivo)).size };
    });
    await somarArmazenamento(userId, size);
    return NextResponse.json({
      referencia: {
        key,
        origem: "link",
        url,
        titulo: video.titulo ?? null,
        duracao: info.duracao,
        largura: info.largura,
        altura: info.altura,
      },
    });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof LinkError)
      return NextResponse.json({ error: `${e.message} Os créditos foram devolvidos.`, code: "BAD_INPUT" }, { status: 400 });
    console.error("[motion/referencia]", e);
    return NextResponse.json(
      { error: `${mensagemDeErro(e)} Os créditos foram devolvidos.`, code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
