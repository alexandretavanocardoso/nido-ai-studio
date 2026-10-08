import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { contaStripeDeSaque } from "@/lib/indicacao/server";
import { getStripe } from "@/lib/pagamentos/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — abre o cadastro da conta de recebimento no Stripe (Connect Express):
 * dados pessoais e conta bancária ficam no Stripe, não aqui. Devolve a URL.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !getPool())
    return NextResponse.json(
      { error: "Saque pelo Stripe não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const sessao = await getAuth()?.api.getSession({ headers: await headers() });
  if (!sessao)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const origem =
    process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  try {
    const conta = await contaStripeDeSaque(
      stripe,
      sessao.user.id,
      sessao.user.email ?? null,
    );
    const link = await stripe.accountLinks.create({
      account: conta,
      type: "account_onboarding",
      refresh_url: `${origem}/app/indicacoes?stripe=retomar`,
      return_url: `${origem}/app/indicacoes?stripe=voltou`,
    });
    return NextResponse.json({ url: link.url });
  } catch (e) {
    console.error("[indicacao] conectar Stripe:", e);
    return NextResponse.json(
      {
        error:
          "Não foi possível abrir o cadastro no Stripe. Tente de novo em instantes.",
      },
      { status: 502 },
    );
  }
}
