import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import { detalheUsuario } from "@/lib/admin/consultas";
import {
  ajustarCreditos,
  ehPlanoPago,
  liberarPlano,
  removerPlano,
} from "@/lib/admin/acoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET — ficha do usuário: conta, extrato, pagamentos e personagens (só admin). */
export async function GET(_req: Request, { params }: Ctx) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const d = await detalheUsuario((await params).id);
  return d
    ? NextResponse.json(d)
    : NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
}

const Acao = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("plano"),
    plano: z.string(),
    meses: z.number().int().min(1).max(36),
    nota: z.string().max(120).optional(),
  }),
  z.object({
    acao: z.literal("remover-plano"),
    nota: z.string().max(120).optional(),
  }),
  z.object({
    acao: z.literal("creditos"),
    quantidade: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((n) => n !== 0, "Informe uma quantidade diferente de zero."),
    nota: z.string().max(120).optional(),
  }),
]);

/** POST — liberar/remover plano ou ajustar créditos (só admin; fica no extrato). */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const parsed = Acao.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Pedido inválido." },
      { status: 400 },
    );
  const { id } = await params;
  const a = parsed.data;
  if (!(await detalheUsuario(id)))
    return NextResponse.json(
      { error: "Usuário não encontrado." },
      { status: 404 },
    );
  try {
    if (a.acao === "plano") {
      if (!ehPlanoPago(a.plano))
        return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
      await liberarPlano(admin, id, a.plano, a.meses, a.nota);
    } else if (a.acao === "remover-plano")
      await removerPlano(admin, id, a.nota);
    else await ajustarCreditos(admin, id, a.quantidade, a.nota);
    return NextResponse.json(await detalheUsuario(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
