import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { getPool } from "@/lib/db";
import { getObjectBuffer, ownsKey, presignGet } from "@/lib/storage/s3";
import { extrairQuadro } from "@/lib/video/ffmpeg";
import { getFal } from "@/lib/video/fal";
import { silhuetaDaPessoa } from "@/lib/video/pessoas";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Tira o quadro do vídeo (~1–3s) e recorta a pessoa (~2–5s). */
export const maxDuration = 60;

const PER_MINUTE = Number(process.env.MARCAR_RATE_LIMIT_PER_MINUTE ?? 20);

const BodySchema = z
  .object({
    /** Origem: vídeo no S3, vídeo buscado por link ou foto no S3. */
    videoKey: z.string().min(1).optional(),
    linkId: z.string().min(1).optional(),
    fotoKey: z.string().min(1).optional(),
    /** Clique em frações do quadro (0–1) e o instante do vídeo (s). */
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    t: z.number().min(0).default(0),
  })
  .refine(
    (b) => [b.videoKey, b.linkId, b.fotoKey].filter(Boolean).length === 1,
    { message: "Informe o vídeo ou a foto." },
  );

/**
 * POST — silhueta da pessoa clicada, pra tela destacar a pessoa inteira em vez
 * de um ponto. É só visual: sem silhueta (`mascara: null`) a marca vale igual.
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
  const key = body.videoKey ?? body.fotoKey;
  if (key && !ownsKey(userId, key))
    return NextResponse.json(
      { error: "Arquivo não encontrado." },
      { status: 404 },
    );

  const fal = getFal();
  if (!fal) return NextResponse.json({ mascara: null });
  const gate = await allow(`marcar:${userId}`, PER_MINUTE);
  if (!gate.ok) return NextResponse.json({ mascara: null });

  try {
    let quadro: Buffer;
    if (body.fotoKey) {
      quadro = await getObjectBuffer(s3, body.fotoKey);
    } else {
      let url: string;
      if (body.linkId) {
        const { rows } = await getPool()!.query<{ fal_url: string }>(
          `select fal_url from links_video
           where id = $1 and user_id = $2 and created_at > now() - interval '24 hours'`,
          [body.linkId, userId],
        );
        if (!rows[0]) return NextResponse.json({ mascara: null });
        url = rows[0].fal_url;
      } else {
        url = await presignGet(s3, body.videoKey!, 300);
      }
      // O ffmpeg lê direto da URL e pula até o instante: não baixa o vídeo todo.
      quadro = await comPastaTemporaria(async (dir) => {
        const saida = path.join(dir, "quadro.jpg");
        await extrairQuadro(url, Math.max(0.05, body.t), saida, 20_000);
        return readFile(saida);
      });
    }
    const png = await silhuetaDaPessoa(fal, quadro, body);
    return NextResponse.json({
      mascara: png ? `data:image/png;base64,${png.toString("base64")}` : null,
    });
  } catch (e) {
    console.warn("[pessoas] silhueta falhou:", (e as Error).message);
    return NextResponse.json({ mascara: null });
  }
}
