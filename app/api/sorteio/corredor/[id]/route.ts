import { getPool } from "@/lib/db";
import { imagemDoCorredor } from "@/lib/sorteio/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — o próprio influencer correndo, como corre no sorteio (WebP com fundo
 * transparente). Público, como o rosto: a corrida aparece para todos.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const pool = getPool();
  const corpo = pool ? await imagemDoCorredor(pool, (await params).id, "corpo") : null;
  if (!corpo) return new Response("Não encontrado.", { status: 404 });
  // A figura não muda depois de pronta (não dá para trocar quem corre).
  return new Response(new Uint8Array(corpo), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600" },
  });
}
