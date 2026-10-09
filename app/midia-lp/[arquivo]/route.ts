import { NextResponse } from "next/server";
import { PREFIXO_LP, VIDEOS_LP } from "@/lib/lp-midia";
import { getS3, presignGet } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validade do link do S3 e por quanto tempo o redirecionamento fica em cache (sempre menor). */
const VALIDADE_S = 6 * 3600;
const CACHE_S = 3600;

/**
 * GET /midia-lp/<nome>.mp4 — vídeo público da landing page. O bucket é
 * privado: redireciona para uma URL pré-assinada. Só os nomes de VIDEOS_LP
 * são aceitos. Sem S3 configurado (dev local), usa o original em public/video_lp.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ arquivo: string }> },
) {
  const { arquivo } = await params;
  const nome = arquivo.replace(/\.mp4$/, "");
  if (!(VIDEOS_LP as readonly string[]).includes(nome))
    return new NextResponse("Não encontrado.", { status: 404 });

  const s3 = getS3();
  const url = s3
    ? await presignGet(s3, `${PREFIXO_LP}${nome}.mp4`, VALIDADE_S)
    : new URL(`/video_lp/${nome}.mp4`, req.url).toString();
  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      "Cache-Control": `public, max-age=${CACHE_S}, s-maxage=${CACHE_S}`,
    },
  });
}
