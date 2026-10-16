import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { ErroSorteio, participar, sairDoSorteio } from "@/lib/sorteio/server";
import { limparNome } from "@/lib/sorteio/tipos";
import { getS3 } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Desenhar o influencer correndo e depois as poses das pernas leva uns 35 s. */
export const maxDuration = 120;

const EntrarSchema = z.object({
  sorteioId: z.string().min(1).max(40),
  nome: z.string().max(80),
  /** O influencer que corre; vazio = foto enviada ou corredor genérico. */
  characterId: z.string().min(1).max(80).nullable(),
  /** Foto enviada (S3, pasta refs) para correr, quando não é um influencer. */
  fotoKey: z.string().min(1).max(300).nullable().optional(),
});

/**
 * POST — entra no sorteio (de uma vez: depois não troca). A vaga sai na hora;
 * com influencer ou foto, desenha ele correndo e as poses das pernas (uns 35 s)
 * antes de responder.
 */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  const parsed = EntrarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido.", code: "BAD_INPUT" }, { status: 400 });
  const nome = limparNome(parsed.data.nome);
  if (!nome)
    return NextResponse.json({ error: "Escreva seu nome (de 2 a 24 letras).", code: "BAD_INPUT" }, { status: 400 });
  try {
    const eu = await participar(pool, getS3(), {
      userId,
      sorteioId: parsed.data.sorteioId,
      nome,
      characterId: parsed.data.characterId,
      fotoKey: parsed.data.fotoKey ?? null,
    });
    return NextResponse.json({ eu });
  } catch (e) {
    if (e instanceof ErroSorteio) return NextResponse.json({ error: e.message, code: "STATUS" }, { status: 409 });
    console.error("[sorteio] participar", e);
    return NextResponse.json({ error: "Não consegui pôr você no sorteio. Tente de novo." }, { status: 500 });
  }
}

const SairSchema = z.object({ sorteioId: z.string().min(1).max(40) });

/** DELETE — sai do sorteio (só com as inscrições abertas). */
export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  const parsed = SairSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido.", code: "BAD_INPUT" }, { status: 400 });
  await sairDoSorteio(pool, userId, parsed.data.sorteioId);
  return NextResponse.json({ ok: true });
}
