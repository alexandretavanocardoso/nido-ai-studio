import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAtual } from "@/lib/admin/acesso";
import { allow } from "@/lib/ai/rate-limit";
import { getAuth } from "@/lib/auth/server";
import { excluirPfp, gerarPfp, listarPfps } from "@/lib/pfp-server";
import { getS3 } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uma imagem do GPT Image costuma levar de 30 s a 1 min.
export const maxDuration = 120;

async function contexto() {
  const s3 = getS3();
  if (!s3)
    return NextResponse.json(
      { error: "Armazenamento não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const sessao = await getAuth()?.api.getSession({ headers: await headers() });
  if (!sessao)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  return { s3, user: sessao.user };
}

/** GET — os PFPs já gerados (keys), do mais novo para o mais antigo. O limite é LIMITE_PFPS (lib/pfp.ts). */
export async function GET() {
  const ctx = await contexto();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ pfps: await listarPfps(ctx.s3, ctx.user.id) });
}

const Body = z.object({ key: z.string().min(1).max(300).nullable() });

/**
 * POST — gera um PFP (o estilo da arte do NFT) a partir da foto enviada
 * (`key`) ou, com `key: null`, da foto de perfil da conta. Custa créditos.
 */
export async function POST(req: Request) {
  const ctx = await contexto();
  if (ctx instanceof NextResponse) return ctx;
  const gate = await allow(`pfp:${ctx.user.id}`, 4);
  if (!gate.ok)
    return NextResponse.json(
      { error: "Muitos pedidos seguidos. Tente de novo em um minuto." },
      { status: 429 },
    );
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "Pedido inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const r = await gerarPfp({
    userId: ctx.user.id,
    s3: ctx.s3,
    key: body.data.key,
    imagemDoPerfil: ctx.user.image ?? null,
  });
  return r instanceof NextResponse ? r : NextResponse.json(r);
}

const Exclusao = z.object({ key: z.string().min(1).max(300) });

/**
 * DELETE — apaga um PFP gerado (menos o que é a foto de perfil atual). Só
 * admin: para os outros, apagar liberaria gerar além do limite.
 */
export async function DELETE(req: Request) {
  const ctx = await contexto();
  if (ctx instanceof NextResponse) return ctx;
  if (!(await adminAtual()))
    return NextResponse.json(
      { error: "Só o admin pode excluir PFPs.", code: "FORBIDDEN" },
      { status: 403 },
    );
  const body = Exclusao.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json(
      { error: "Pedido inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const recusa = await excluirPfp({
    s3: ctx.s3,
    userId: ctx.user.id,
    key: body.data.key,
    imagemDoPerfil: ctx.user.image ?? null,
  });
  return recusa ?? NextResponse.json({ ok: true });
}
