import { NextResponse } from "next/server";
import { pontosPorPost } from "@/lib/pontos-server";
import { getPool } from "@/lib/db";
import { estadoPost, getBundle } from "@/lib/social/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — webhook do bundle.social (configurado no painel deles, nível da
 * organização). Assinatura HMAC no header x-signature, com o segredo em
 * BUNDLE_SOCIAL_WEBHOOK_SECRET. Em post.published, atualiza o post (status,
 * erros e links). Idempotente: só copia o estado atual do bundle.social.
 */
export async function POST(req: Request) {
  const bundle = getBundle();
  const pool = getPool();
  const segredo = process.env.BUNDLE_SOCIAL_WEBHOOK_SECRET?.trim();
  if (!bundle || !pool || !segredo)
    return NextResponse.json(
      { error: "Webhook não configurado." },
      { status: 503 },
    );

  const bruto = await req.text();
  let evento: ReturnType<typeof bundle.webhooks.constructEvent>;
  try {
    evento = bundle.webhooks.constructEvent(
      bruto,
      req.headers.get("x-signature") ?? "",
      segredo,
    );
  } catch {
    return NextResponse.json(
      { error: "Assinatura inválida." },
      { status: 401 },
    );
  }

  if (evento.type === "post.published") {
    const postId = (evento.data as { id?: string }).id;
    if (postId) {
      try {
        const e = await estadoPost(bundle, postId);
        const { rows } = await pool.query<{ id: string; user_id: string }>(
          `update posts_agendados set status = $2, erros = $3, links = $4, updated_at = now()
            where bundle_post_id = $1 returning id, user_id`,
          [
            postId,
            e.status,
            e.erros ? JSON.stringify(e.erros) : null,
            e.links ? JSON.stringify(e.links) : null,
          ],
        );
        // Pontos: post que saiu de verdade (webhook repetido não pontua de novo).
        if (e.status === "POSTED" && rows[0])
          await pontosPorPost(rows[0].user_id, rows[0].id);
      } catch (err) {
        console.error("[social/webhook]", err);
        return NextResponse.json(
          { error: "Falha ao atualizar." },
          { status: 500 },
        ); // o bundle.social tenta de novo
      }
    }
  }
  return NextResponse.json({ ok: true });
}
