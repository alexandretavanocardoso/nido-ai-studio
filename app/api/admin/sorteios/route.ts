import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import { getPool } from "@/lib/db";
import { PLANOS_PAGOS, type PlanoPago } from "@/lib/planos";
import { criarSorteio, ErroSorteio, listarSorteios } from "@/lib/sorteio/server";
import { LIMITES_PREMIO, MESES_PRESENTE } from "@/lib/sorteio/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — os sorteios (mais recentes primeiro), com o ganhador e o que ele recebeu. */
export async function GET() {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  return NextResponse.json({ sorteios: await listarSorteios(pool) });
}

const inteiro = (l: { min: number; max: number }) => z.number().int().min(l.min).max(l.max);

const CriarSchema = z.object({
  titulo: z.string().trim().min(3).max(80),
  premio: z.discriminatedUnion("tipo", [
    z.object({
      tipo: z.literal("plano"),
      plano: z.enum(PLANOS_PAGOS as [PlanoPago, ...PlanoPago[]]),
      meses: z.number().int().refine((m) => (MESES_PRESENTE as readonly number[]).includes(m)),
    }),
    z.object({ tipo: z.literal("creditos"), quantidade: inteiro(LIMITES_PREMIO.creditos) }),
    z.object({ tipo: z.literal("pontos"), quantidade: inteiro(LIMITES_PREMIO.pontos) }),
    z.object({ tipo: z.literal("pix"), centavos: inteiro(LIMITES_PREMIO.pix) }),
  ]),
});

/** POST — cria um sorteio aberto com o prêmio escolhido (um de cada vez). */
export async function POST(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  const parsed = CriarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Preencha o título (3 a 80 letras) e o prêmio (dentro dos limites).", code: "BAD_INPUT" },
      { status: 400 },
    );
  try {
    await criarSorteio(pool, { ...parsed.data, adminEmail: admin.email });
    return NextResponse.json({ sorteios: await listarSorteios(pool) });
  } catch (e) {
    if (e instanceof ErroSorteio) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
