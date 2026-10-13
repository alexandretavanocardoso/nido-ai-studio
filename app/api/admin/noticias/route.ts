import { NextResponse } from "next/server";
import { adminOuResponder } from "@/lib/admin/acesso";
import {
  ehAgente,
  listarNoticias,
  pesquisarNoticias,
} from "@/lib/noticias/server";
import { recursosDisponiveis } from "@/lib/recursos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uma rodada lê o X e pesquisa na web: leva de 1 a 2 minutos.
export const maxDuration = 300;

/** GET ?agente=concorrentes|ias — notícias que o agente achou, mais recentes primeiro (só admin). */
export async function GET(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const agente = new URL(req.url).searchParams.get("agente");
  if (!ehAgente(agente))
    return NextResponse.json({ error: "Agente inválido." }, { status: 400 });
  return NextResponse.json(await listarNoticias(agente));
}

/** POST { agente } — roda esse agente agora (só admin). */
export async function POST(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const corpo = (await req.json().catch(() => null)) as {
    agente?: string;
  } | null;
  if (!ehAgente(corpo?.agente))
    return NextResponse.json({ error: "Agente inválido." }, { status: 400 });
  if (!recursosDisponiveis().ia)
    return NextResponse.json(
      { error: "Nenhuma chave da Anthropic configurada no servidor." },
      { status: 400 },
    );
  try {
    return NextResponse.json(await pesquisarNoticias([corpo.agente]));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
