import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAtual } from "@/lib/admin/acesso";
import { getUserId } from "@/lib/auth/server";
import { idiomaDoPedido } from "@/lib/ai/idioma";
import { getPool } from "@/lib/db";
import { recursosDisponiveis } from "@/lib/recursos";
import { NICHOS_GLOBAIS } from "@/lib/radar/global";
import { gerarRadarGlobal, radaresGlobais } from "@/lib/radar/global-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET — radares globais dos últimos dias, no idioma de quem pede. Não gasta créditos. */
export async function GET(req: Request) {
  if (!recursosDisponiveis().login || !getPool())
    return NextResponse.json({ radares: [] });
  if (!(await getUserId()))
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  return NextResponse.json({
    radares: await radaresGlobais(idiomaDoPedido(req)),
  });
}

const corpo = z.object({
  nicho: z.string().refine((n) => NICHOS_GLOBAIS.some((g) => g.id === n)),
});

/** POST — só admins: monta agora o radar de hoje de um nicho (sem esperar a tarefa diária). */
export async function POST(req: Request) {
  if (!(await adminAtual()))
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!getPool() || !recursosDisponiveis().ia)
    return NextResponse.json(
      { error: "O radar precisa do banco e da IA de texto configurados." },
      { status: 500 },
    );
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success)
    return NextResponse.json({ error: "Nicho inválido." }, { status: 400 });
  try {
    return NextResponse.json({
      radar: await gerarRadarGlobal(lido.data.nicho, idiomaDoPedido(req)),
    });
  } catch (e) {
    console.error("[radar global]", lido.data.nicho, (e as Error).message);
    return NextResponse.json(
      { error: (e as Error).message || "Não consegui montar o radar agora." },
      { status: 502 },
    );
  }
}
