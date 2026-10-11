import { after, NextResponse } from "next/server";
import { z } from "zod";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { getPool } from "@/lib/db";
import { gravarBadges } from "@/lib/nft/badges-server";
import { mintar } from "@/lib/nft/mint";
import { contextoNft } from "@/lib/nft/server";
import { atualizarViewsDaConta } from "@/lib/nft/views-server";
import { getBundle } from "@/lib/social/bundle";
import { getS3 } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** O mint espera a rede finalizar a transação (até uns 45 s). */
export const maxDuration = 120;

const BodySchema = z.object({
  characterId: z.string().min(1).max(64),
  /** Declaração obrigatória — sem ela, não minta. */
  consentimento: z.literal(true, {
    message: "Marque a declaração para continuar.",
  }),
});

/**
 * POST — minta o NFT do personagem para a carteira vinculada à conta. O
 * servidor assina e paga a taxa; o usuário paga em créditos. Responde com o
 * mint confirmado, ou ainda "enviado" (a tela acompanha em
 * /api/nft/personagem/[id]).
 */
export async function POST(req: Request) {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  const { userId } = ctx;
  const s3 = getS3();
  if (!s3)
    return NextResponse.json(
      { error: "Armazenamento não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const gate = await allow(`nft:${userId}`, 5);
  if (!gate.ok)
    return NextResponse.json(
      { error: "Muitos pedidos seguidos. Tente de novo em um minuto." },
      { status: 429 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const { characterId } = parsed.data;

  const r = await mintar({ userId, characterId, ip: readIp(req), s3 });
  if (r instanceof NextResponse) return r;

  // Badges que o personagem já tinha antes do mint entram no NFT logo em seguida.
  if (r.mint.status === "confirmado") {
    const mintId = r.mint.id;
    after(async () => {
      try {
        await atualizarViewsDaConta(getPool()!, getBundle(), userId, {
          characterId,
          forcar: true,
        });
        await gravarBadges(mintId);
      } catch (e) {
        console.error("[nft] badges depois do mint", mintId, e);
      }
    });
  }
  return NextResponse.json(r);
}
