import { NextResponse } from "next/server";
import { z } from "zod";
import { hit } from "@/lib/ai/rate-limit";
import { getUserId } from "@/lib/auth/server";
import {
  criarAviso,
  hrefValido,
  limparAvisos,
  listarAvisos,
  marcarAvisosLidos,
} from "@/lib/avisos-server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Avisos que a tela pode registrar por minuto, por conta. */
const POR_MINUTO = 30;

async function usuario(): Promise<string | NextResponse> {
  const userId = getPool() ? await getUserId() : null;
  return (
    userId ??
    NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    )
  );
}

/** GET — avisos do sino da conta, do mais novo para o mais antigo. */
export async function GET() {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json({ avisos: await listarAvisos(userId) });
}

const Criar = z.object({
  rotulo: z.string().trim().min(1).max(200),
  erro: z.boolean().optional(),
  href: z.string().optional(),
  chave: z.string().max(120).optional(),
});

/** POST — a tela registra o que terminou (o que só ela sabe: imagem, texto…). */
export async function POST(req: Request) {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  const parsed = Criar.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Pedido inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const gate = await hit(`avisos:${userId}`, POR_MINUTO, 60);
  if (gate.ok)
    await criarAviso(userId, {
      ...parsed.data,
      href: hrefValido(parsed.data.href) ? parsed.data.href : null,
    });
  return NextResponse.json({ avisos: await listarAvisos(userId) });
}

/** PATCH — marca todos como vistos (ao fechar o sino). */
export async function PATCH() {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  await marcarAvisosLidos(userId);
  return NextResponse.json({ ok: true });
}

/** DELETE — limpa a lista. */
export async function DELETE() {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  await limparAvisos(userId);
  return NextResponse.json({ ok: true });
}
