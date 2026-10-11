import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import { getPool } from "@/lib/db";
import { decidirBadge, painelNft } from "@/lib/nft/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — aba NFT: chaves e saldo, badges esperando aprovação e mints (só admin). */
export async function GET() {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  if (!getPool())
    return NextResponse.json(
      { error: "Banco não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  return NextResponse.json(await painelNft());
}

const BodySchema = z.object({
  characterId: z.string().min(1).max(64),
  badge: z.string().min(1).max(40),
  aprovar: z.boolean(),
});

/** POST — aprova ou recusa um badge que esperava aprovação (marca alta ou salto de views). */
export async function POST(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Pedido inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const { characterId, badge, aprovar } = parsed.data;
  if (!(await decidirBadge(characterId, badge, aprovar, admin.email)))
    return NextResponse.json(
      { error: "Este badge já foi decidido." },
      { status: 409 },
    );
  return NextResponse.json(await painelNft());
}
