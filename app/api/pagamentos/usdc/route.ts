import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { getUserId } from "@/lib/auth/server";
import { recursosDisponiveis } from "@/lib/recursos";
import { PACOTES, PLANOS } from "@/lib/planos";
import { lerCompra } from "@/lib/pagamentos/aplicar";
import { criarPagamentoUsdc, redesUsdcAtivas } from "@/lib/pagamentos/usdc";
import { ehRedeUsdc } from "@/lib/pagamentos/redes-usdc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tipo: z.enum(["plano", "pacote", "avulso"]),
  plano: z.string().optional(),
  intervalo: z.string().optional(),
  pacote: z.string().optional(),
  creditos: z.number().optional(),
  rede: z.string().optional(),
});

/** POST — cria uma cobrança em USDC (Solana Pay ou EVM): link + QR + valor. */
export async function POST(req: Request) {
  if (!recursosDisponiveis().usdc)
    return NextResponse.json(
      { error: "Pagamento em USDC não configurado." },
      { status: 500 },
    );
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );

  const gate = await allow(`cobranca:${userId}`, 6);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitas cobranças seguidas. Tente em ${gate.retryAfter}s.` },
      { status: 429 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  const compra = parsed.success ? lerCompra(parsed.data) : null;
  if (!compra)
    return NextResponse.json(
      {
        error: "Plano, pacote ou quantidade inválida (mínimo 100 créditos).",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );

  const rotulo =
    compra.tipo === "pacote"
      ? `${PACOTES[compra.pacote].creditos} créditos`
      : compra.tipo === "avulso"
        ? `${compra.creditos} créditos`
        : `Plano ${PLANOS[compra.plano].nome} (${compra.intervalo})`;
  const rede = parsed.success && parsed.data.rede ? parsed.data.rede : "solana";
  if (!ehRedeUsdc(rede) || !redesUsdcAtivas().includes(rede))
    return NextResponse.json(
      {
        error: "Rede não disponível para pagamento em USDC.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await criarPagamentoUsdc(userId, compra, rotulo, rede),
    );
  } catch (e) {
    console.error("[usdc]", e);
    return NextResponse.json(
      {
        error: `Não consegui falar com a rede ${rede} agora. Tente outra rede ou de novo em instantes.`,
      },
      { status: 502 },
    );
  }
}
