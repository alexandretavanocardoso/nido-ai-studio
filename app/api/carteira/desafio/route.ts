import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { criarDesafio } from "@/lib/nft/carteira-server";
import { contextoNft } from "@/lib/nft/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ endereco: z.string().min(32).max(44) });

/**
 * POST — começa o vínculo da carteira: devolve a mensagem (com um código de
 * uso único) que a carteira assina. Não é transação e não tem custo.
 */
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
  const desafio = parsed.success
    ? await criarDesafio(ctx.userId, parsed.data.endereco)
    : null;
  if (!desafio)
    return NextResponse.json(
      { error: "Endereço de carteira inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  return NextResponse.json(desafio);
}
