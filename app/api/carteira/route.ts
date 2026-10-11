import { NextResponse } from "next/server";
import { carteiraDaConta, desvincularCarteira } from "@/lib/nft/carteira-server";
import { contextoNft } from "@/lib/nft/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — carteira Solana vinculada à conta (null = nenhuma). */
export async function GET() {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ carteira: await carteiraDaConta(ctx.userId) });
}

/** DELETE — tira a carteira da conta. NFTs já mintados continuam na carteira deles. */
export async function DELETE() {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  await desvincularCarteira(ctx.userId);
  return NextResponse.json({ carteira: null });
}
