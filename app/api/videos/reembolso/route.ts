import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { ownsKey } from "@/lib/storage/s3";
import { MOTIVOS_REEMBOLSO, REEMBOLSO_TEXTO_MAX } from "@/lib/video/reembolso";
import {
  pedirReembolso,
  registrarEdicaoAntiga,
  reembolsosDaConta,
  ReembolsoError,
} from "@/lib/video/reembolso-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    jobId: z.string().min(1).optional(),
    /** Edição antiga, sem job: o arquivo do vídeo e que edição foi. */
    key: z.string().min(1).optional(),
    edicao: z.enum(["corte", "legenda", "audio"]).optional(),
    motivo: z.enum(MOTIVOS_REEMBOLSO),
    detalhe: z.string().max(REEMBOLSO_TEXTO_MAX).optional(),
  })
  .refine((b) => !!b.jobId || (!!b.key && !!b.edicao));

/** Conta logada e banco configurado, ou a resposta de erro pronta. */
async function conta(): Promise<string | NextResponse> {
  if (!getPool())
    return NextResponse.json(
      { error: "Banco não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const userId = await getUserId();
  return (
    userId ??
    NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    )
  );
}

/** GET — os pedidos de reembolso da conta (um por vídeo), com o status. */
export async function GET() {
  const userId = await conta();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json({ itens: await reembolsosDaConta(userId) });
}

/**
 * POST — pede o reembolso dos créditos de um vídeo gerado. O pedido fica
 * pendente até um admin aprovar ou recusar (área admin → Reembolsos).
 */
export async function POST(req: Request) {
  const userId = await conta();
  if (userId instanceof NextResponse) return userId;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Pedido inválido.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const gate = await allow(`reembolso:${userId}`, 6);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitos pedidos seguidos. Tente em ${gate.retryAfter}s.` },
      { status: 429 },
    );

  try {
    const { key, edicao, motivo, detalhe } = parsed.data;
    let jobId = parsed.data.jobId;
    if (!jobId) {
      if (!ownsKey(userId, key!))
        return NextResponse.json(
          { error: "Vídeo não encontrado.", code: "BAD_INPUT" },
          { status: 404 },
        );
      jobId = await registrarEdicaoAntiga({ userId, tipo: edicao!, key: key! });
    }
    return NextResponse.json(
      await pedirReembolso({ userId, jobId, motivo, detalhe }),
    );
  } catch (e) {
    if (e instanceof ReembolsoError)
      return NextResponse.json(
        { error: e.message, code: "BAD_INPUT" },
        { status: 400 },
      );
    console.error("[videos/reembolso]", e);
    return NextResponse.json(
      { error: "Não consegui registrar o pedido.", code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
