import { NextResponse } from "next/server";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { recursosDisponiveis } from "@/lib/recursos";

/**
 * Para as rotas do NFT (/api/carteira/*, /api/nft/*): recurso liberado para a
 * conta (lib/em-teste.ts), conta logada e NFT configurado neste deploy — ou a
 * resposta de recusa pronta.
 */
export async function contextoNft(): Promise<{ userId: string } | NextResponse> {
  const bloqueio = await liberadoOuResponder("nft");
  if (bloqueio) return bloqueio;
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  if (!getPool() || !recursosDisponiveis().nft)
    return NextResponse.json(
      { error: "NFT não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  return { userId };
}
