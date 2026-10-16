import { getPool } from "@/lib/db";
import { imagemDoCorredor } from "@/lib/sorteio/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — o rosto de um corredor do sorteio (JPEG 256 px). Público: a corrida
 * aparece para todos (e no palco do OBS, sem login); o id do participante é
 * aleatório e só vem na lista da corrida.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const pool = getPool();
  const foto = pool ? await imagemDoCorredor(pool, (await params).id, "foto") : null;
  if (!foto) return new Response("Não encontrado.", { status: 404 });
  return new Response(new Uint8Array(foto), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=60" },
  });
}
