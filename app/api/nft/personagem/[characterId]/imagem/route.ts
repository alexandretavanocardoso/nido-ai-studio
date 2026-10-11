import { NextResponse } from "next/server";
import { allow } from "@/lib/ai/rate-limit";
import { atualizarImagemDoNft } from "@/lib/nft/mint";
import { contextoNft } from "@/lib/nft/server";
import { getS3 } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST — troca a imagem do NFT já mintado pelo Retrato atual do personagem.
 * Não é transação e não custa créditos: a imagem do NFT é servida pelo app.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  const s3 = getS3();
  if (!s3)
    return NextResponse.json(
      { error: "Armazenamento não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const gate = await allow(`nftimagem:${ctx.userId}`, 6);
  if (!gate.ok)
    return NextResponse.json(
      { error: "Muitos pedidos seguidos. Tente de novo em um minuto." },
      { status: 429 },
    );
  const { characterId } = await params;
  const recusa = await atualizarImagemDoNft({
    userId: ctx.userId,
    characterId,
    s3,
  });
  return recusa ?? NextResponse.json({ ok: true });
}
