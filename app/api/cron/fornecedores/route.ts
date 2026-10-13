import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  categoriasPendentes,
  pesquisarFornecedores,
} from "@/lib/fornecedores/server";
import { recursosDisponiveis } from "@/lib/recursos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron semanal (vercel.json): o agente procura fornecedores de IA novos
 * (vídeo, imagem e voz) para a aba Fornecedores do admin.
 * A Vercel manda `Authorization: Bearer $CRON_SECRET`.
 * Só pesquisa a categoria que ainda não rodou na semana: chamar de novo não
 * paga a pesquisa duas vezes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!getPool() || !recursosDisponiveis().ia)
    return NextResponse.json({
      ok: true,
      novos: 0,
      motivo: "sem banco ou sem IA de texto",
    });

  const pendentes = await categoriasPendentes();
  const resumo = await pesquisarFornecedores(pendentes);
  console.log("[cron] fornecedores", { pendentes, ...resumo });
  return NextResponse.json({ ok: true, pendentes, ...resumo });
}
