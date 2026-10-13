import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import { REEMBOLSO_TEXTO_MAX } from "@/lib/video/reembolso";
import { resolverReembolso } from "@/lib/video/reembolso-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Acao = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("aprovar") }),
  z.object({
    acao: z.literal("recusar"),
    resposta: z.string().trim().min(1).max(REEMBOLSO_TEXTO_MAX),
  }),
]);

/**
 * POST — aprova (os créditos do vídeo voltam para a conta) ou recusa, com a
 * explicação que a pessoa vai ler (só admin).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const parsed = Acao.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { id } = await params;
  try {
    await resolverReembolso(
      admin,
      id,
      parsed.data.acao === "aprovar"
        ? { aprovar: true }
        : { aprovar: false, resposta: parsed.data.resposta },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
