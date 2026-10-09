import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder, emailsAdmin } from "@/lib/admin/acesso";
import {
  definirEmTeste,
  desconectarQuemNaoEAdmin,
  listarEmTeste,
} from "@/lib/admin/em-teste-server";
import { RECURSOS_EM_TESTE, type RecursoEmTeste } from "@/lib/em-teste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — recursos em teste e quem pode usar cada um agora (só admin). */
export async function GET() {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ itens: await listarEmTeste() });
}

const BodySchema = z.object({
  recurso: z.enum(RECURSOS_EM_TESTE as [RecursoEmTeste, ...RecursoEmTeste[]]),
  /** true = fecha (só admin) · false = libera para todas as contas. */
  soAdmin: z.boolean(),
});

/** POST — libera um recurso para todos ou volta a deixá-lo só para admin. */
export async function POST(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Pedido inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  await definirEmTeste(parsed.data.recurso, parsed.data.soAdmin, admin.email);
  // Fechar o login também tira do app quem já estava dentro.
  const desconectados =
    parsed.data.recurso === "login" && parsed.data.soAdmin
      ? await desconectarQuemNaoEAdmin(emailsAdmin())
      : undefined;
  return NextResponse.json({ itens: await listarEmTeste(), desconectados });
}
