import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { getAuth } from "@/lib/auth/server";
import { lerCompra } from "@/lib/pagamentos/aplicar";
import { criarCheckout, getStripe } from "@/lib/pagamentos/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tipo: z.enum(["plano", "pacote", "avulso"]),
  plano: z.string().optional(),
  intervalo: z.string().optional(),
  pacote: z.string().optional(),
  creditos: z.number().optional(),
  /** USD quando a interface está em inglês (só cartão); padrão BRL. */
  moeda: z.enum(["BRL", "USD"]).optional(),
});

/** POST — abre o Checkout do Stripe para um plano ou pacote. Devolve a URL. */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe)
    return NextResponse.json(
      { error: "Pagamento pelo Stripe não configurado." },
      { status: 500 },
    );
  const sessao = await getAuth()?.api.getSession({ headers: await headers() });
  if (!sessao)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );

  const gate = await allow(`cobranca:${sessao.user.id}`, 6);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitas tentativas seguidas. Tente em ${gate.retryAfter}s.` },
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

  try {
    const url = await criarCheckout(stripe, {
      userId: sessao.user.id,
      email: sessao.user.email ?? null,
      compra,
      moeda: parsed.success ? parsed.data.moeda : undefined,
      origem:
        process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ||
        new URL(req.url).origin,
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[stripe/checkout]", e);
    return NextResponse.json(
      { error: "Não consegui abrir o pagamento. Tente de novo." },
      { status: 502 },
    );
  }
}
