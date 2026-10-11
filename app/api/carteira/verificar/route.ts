import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { verificarDesafio } from "@/lib/nft/carteira-server";
import { contextoNft } from "@/lib/nft/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  nonce: z.string().min(16).max(64),
  /** Assinatura da mensagem (64 bytes), em base64. */
  assinatura: z.string().min(80).max(100),
});

/** POST — confere a assinatura do desafio e vincula a carteira à conta. */
export async function POST(req: Request) {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  const gate = await allow(`carteira:${ctx.userId}`, 10);
  if (!gate.ok)
    return NextResponse.json(
      { error: "Muitos pedidos seguidos. Tente de novo em um minuto." },
      { status: 429 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Pedido inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const r = await verificarDesafio(
    ctx.userId,
    parsed.data.nonce,
    new Uint8Array(Buffer.from(parsed.data.assinatura, "base64")),
  );
  if ("erro" in r)
    return NextResponse.json({ error: r.erro, code: "BAD_INPUT" }, { status: 400 });
  return NextResponse.json({ carteira: r.endereco });
}
