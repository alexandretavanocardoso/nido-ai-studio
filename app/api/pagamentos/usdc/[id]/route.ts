import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { confirmarTxUsdc, verificarPagamentoUsdc } from "@/lib/pagamentos/usdc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — confere na blockchain se a cobrança em USDC foi paga (a tela consulta a cada 5s). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const status = await verificarPagamentoUsdc((await params).id, userId);
    return NextResponse.json({ status });
  } catch (e) {
    console.error("[usdc]", e);
    return NextResponse.json({
      status: "pendente",
      aviso: (e as Error).message,
    });
  }
}

/**
 * POST — redes EVM: o usuário cola o hash (ou link do explorer) da transação.
 * O servidor confere valor, destino e horário na rede e aplica a compra.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { tx?: unknown } | null;
  const entrada = typeof body?.tx === "string" ? body.tx.slice(0, 300) : "";
  try {
    return NextResponse.json(
      await confirmarTxUsdc((await params).id, userId, entrada),
    );
  } catch (e) {
    console.error("[usdc tx]", e);
    return NextResponse.json({
      status: "pendente",
      erro: "Não consegui consultar a rede agora. Tente de novo em instantes.",
      aguardar: true,
    });
  }
}
