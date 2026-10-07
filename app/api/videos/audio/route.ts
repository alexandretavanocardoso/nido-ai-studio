import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import { CREDITOS_APLICAR_AUDIO } from "@/lib/planos";
import {
  downloadToFile,
  newKey,
  ownsKey,
  uploadFromFile,
} from "@/lib/storage/s3";
import { aplicarAudio, probe, temAudio } from "@/lib/video/ffmpeg";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  videoKey: z.string().min(1),
  audioKey: z.string().min(1),
  /** substituir = só a fala · misturar = fala por cima do áudio original (mais baixo) */
  modo: z.enum(["substituir", "misturar"]).default("misturar"),
});

/**
 * POST — coloca uma fala (gerada com a voz do personagem) num vídeo. Gera um
 * vídeo novo; o original fica. Não sincroniza os lábios.
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;
  if (!ownsKey(userId, body.videoKey) || !ownsKey(userId, body.audioKey))
    return NextResponse.json(
      { error: "Arquivo não encontrado." },
      { status: 404 },
    );

  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "video");
  if (vaga instanceof NextResponse) return vaga;
  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_APLICAR_AUDIO,
    "video_audio",
    body.videoKey,
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }

  try {
    const resultado = await comPastaTemporaria(async (dir) => {
      const video = path.join(dir, "video.mp4");
      const audio = path.join(dir, "fala.mp3");
      const saida = path.join(dir, "saida.mp4");
      await Promise.all([
        downloadToFile(s3, body.videoKey, video),
        downloadToFile(s3, body.audioKey, audio),
      ]);
      const info = await probe(video);
      await aplicarAudio({
        video,
        audio,
        saida,
        modo: body.modo,
        duracao: info.duracao,
        videoTemAudio: await temAudio(video),
      });
      const key = newKey(userId, "videos", "video/mp4");
      const size = await uploadFromFile(s3, key, saida, "video/mp4");
      await somarArmazenamento(userId, size);
      return { key, size, duracao: info.duracao };
    });
    return NextResponse.json(resultado);
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    console.error("[videos/audio]", e);
    return NextResponse.json(
      { error: "Não consegui colocar a fala no vídeo." },
      { status: 500 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}
