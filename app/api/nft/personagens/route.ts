import { NextResponse } from "next/server";
import { personagensComNft } from "@/lib/nft/mint";
import { contextoNft } from "@/lib/nft/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — ids dos personagens da conta que têm NFT mintado nesta rede. É o que
 * acende o selo "NFT" nos cards da lista de personagens.
 */
export async function GET() {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ mintados: await personagensComNft(ctx.userId) });
}
