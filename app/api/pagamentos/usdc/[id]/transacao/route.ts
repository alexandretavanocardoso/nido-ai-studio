import { NextResponse } from "next/server";
import { allow } from "@/lib/ai/rate-limit";
import { getUserId } from "@/lib/auth/server";
import { transacaoDoPagamento } from "@/lib/pagamentos/usdc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — Solana: monta a transferência da cobrança para a carteira conectada
 * do usuário assinar e enviar (a mesma que a carteira montaria lendo o QR).
 * Nas EVM não precisa: a cobrança já traz a chamada pronta.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // Cada pedido consulta a rede (saldo e bloco recente).
  const gate = await allow(`usdc-montar:${userId}`, 10);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitas tentativas seguidas. Tente em ${gate.retryAfter}s.` },
      { status: 429 },
    );
  const body = (await req.json().catch(() => null)) as {
    pagador?: unknown;
  } | null;
  const pagador =
    typeof body?.pagador === "string" ? body.pagador.trim().slice(0, 64) : "";
  try {
    const r = await transacaoDoPagamento((await params).id, userId, pagador);
    return "erro" in r
      ? NextResponse.json({ error: r.erro }, { status: 400 })
      : NextResponse.json(r);
  } catch (e) {
    console.error("[usdc transacao]", e);
    return NextResponse.json(
      {
        error: "Não consegui consultar a rede agora. Tente de novo em instantes.",
      },
      { status: 502 },
    );
  }
}
