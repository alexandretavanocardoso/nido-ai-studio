import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import {
  listarFornecedores,
  pesquisarFornecedores,
} from "@/lib/fornecedores/server";
import { recursosDisponiveis } from "@/lib/recursos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A pesquisa das três categorias roda junto e leva de 2 a 3 minutos.
export const maxDuration = 300;

/** GET ?status= — fornecedores de IA achados pelo agente, melhor nota primeiro (só admin). */
export async function GET(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(
    await listarFornecedores(
      new URL(req.url).searchParams.get("status") ?? undefined,
    ),
  );
}

/** POST — roda o agente agora, nas três categorias (só admin). */
export async function POST() {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  if (!recursosDisponiveis().ia)
    return NextResponse.json(
      { error: "Nenhuma chave da Anthropic configurada no servidor." },
      { status: 400 },
    );
  try {
    return NextResponse.json(await pesquisarFornecedores());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
