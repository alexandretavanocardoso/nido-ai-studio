import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { escolherCodigo } from "@/lib/indicacao/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ codigo: z.string().max(60) });

/** POST — o usuário escolhe o código do seu link de indicação (uma vez só). */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId || !getPool())
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Informe o código.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const erro = await escolherCodigo(userId, parsed.data.codigo);
  if (erro)
    return NextResponse.json({ error: erro, code: "BAD_INPUT" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
