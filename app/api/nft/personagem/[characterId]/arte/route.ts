import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { escolherArteDoNft, gerarArtesDoNft } from "@/lib/nft/arte-server";
import { contextoNft } from "@/lib/nft/server";
import { getS3 } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cinco imagens do GPT Image ao mesmo tempo, com uma segunda tentativa.
export const maxDuration = 300;

type Rota = { params: Promise<{ characterId: string }> };

/**
 * POST — gera cinco opções de arte do NFT (o retrato do personagem no estilo
 * da coleção). Substituem as anteriores e desfazem a escolha. Custa créditos.
 * Depois do mint não gera mais: a imagem do NFT é definitiva.
 */
export async function POST(_req: Request, { params }: Rota) {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  const s3 = getS3();
  if (!s3)
    return NextResponse.json(
      { error: "Armazenamento não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const gate = await allow(`nftarte:${ctx.userId}`, 4);
  if (!gate.ok)
    return NextResponse.json(
      { error: "Muitos pedidos seguidos. Tente de novo em um minuto." },
      { status: 429 },
    );
  const { characterId } = await params;
  const r = await gerarArtesDoNft({ userId: ctx.userId, characterId, s3 });
  return r instanceof NextResponse ? r : NextResponse.json(r);
}

const Escolha = z.object({ key: z.string().min(1) });

/** PUT — escolhe, entre as opções geradas, a arte que vai para o NFT. */
export async function PUT(req: Request, { params }: Rota) {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  const body = Escolha.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "Escolha uma das artes.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const { characterId } = await params;
  const r = await escolherArteDoNft({
    userId: ctx.userId,
    characterId,
    key: body.data.key,
  });
  return r instanceof NextResponse ? r : NextResponse.json(r);
}
