import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { assinaturaKickValida, receberChatKick } from "@/lib/live/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook do Kick (cadastrado no app do Kick: https://<domínio>/api/live/kick/webhook).
 * Recebe chat.message.sent dos canais ligados a uma live no ar (lib/live/chat.ts).
 * Sempre responde 200 a um evento válido: se o webhook falhar, o Kick tenta
 * de novo três vezes e depois cancela a inscrição.
 */
export async function POST(req: Request) {
  const corpo = await req.text();
  const h = req.headers;
  const id = h.get("kick-event-message-id");
  const quando = h.get("kick-event-message-timestamp");
  const assinatura = h.get("kick-event-signature");
  if (!id || !quando || !assinatura || !(await assinaturaKickValida(id, quando, corpo, assinatura)))
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const pool = getPool();
  if (pool && h.get("kick-event-type") === "chat.message.sent") {
    try {
      await receberChatKick(pool, JSON.parse(corpo));
    } catch (e) {
      console.error("[live] kick webhook", e);
    }
  }
  return NextResponse.json({ ok: true });
}
