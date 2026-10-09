import { NextResponse } from "next/server";
import { z } from "zod";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { criarToken, listarTokens, revogarToken } from "@/lib/mcp/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function usuario(): Promise<string | NextResponse> {
  const bloqueio = await liberadoOuResponder("mcp");
  if (bloqueio) return bloqueio;
  const userId = getPool() ? await getUserId() : null;
  return (
    userId ??
    NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    )
  );
}

/** GET — tokens de API ativos da conta (sem o valor: ele só aparece ao criar). */
export async function GET() {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json({ tokens: await listarTokens(userId) });
}

const Criar = z.object({
  nome: z.string().trim().min(1, "Dê um nome ao token.").max(60),
});

/** POST — cria um token. O valor inteiro volta só nesta resposta. */
export async function POST(req: Request) {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  const parsed = Criar.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  try {
    return NextResponse.json(await criarToken(userId, parsed.data.nome));
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, code: "BAD_INPUT" },
      { status: 400 },
    );
  }
}

/** DELETE ?id= — revoga um token: quem estiver conectado com ele perde o acesso. */
export async function DELETE(req: Request) {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !(await revogarToken(userId, id)))
    return NextResponse.json(
      { error: "Token não encontrado.", code: "NOT_FOUND" },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}
