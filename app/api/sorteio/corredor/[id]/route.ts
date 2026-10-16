import { getPool } from "@/lib/db";
import { imagemDoCorredor } from "@/lib/sorteio/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — o próprio influencer correndo, como corre no sorteio (WebP com fundo
 * transparente); com `?passos=1`, a tira com as poses do ciclo de corrida (as
 * pernas se mexendo). Público, como o rosto: a corrida aparece para todos.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const pool = getPool();
  const qual = new URL(req.url).searchParams.get("passos") ? "passos" : "corpo";
  const img = pool ? await imagemDoCorredor(pool, (await params).id, qual) : null;
  if (!img) return new Response("Não encontrado.", { status: 404 });
  // A figura não muda depois de pronta (não dá para trocar quem corre).
  return new Response(new Uint8Array(img), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" },
  });
}
