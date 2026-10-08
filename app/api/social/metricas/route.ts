import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { getBundle } from "@/lib/social/bundle";
import { tokenApify } from "@/lib/video/link";
import { atualizarMetricas, postsComMetricas } from "@/lib/social/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET — Dashboard: posts publicados da conta (todos os personagens) com views,
 * curtidas, comentários, reposts, quotes e salvamentos por rede. Leituras com
 * mais de 30 min são refeitas no bundle.social antes de responder
 * (`?atualizar=1`: mais de 2 min). Posts cadastrados por link vêm junto; quem
 * relê esses é o PATCH de ./links.
 */
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const bundle = getBundle();
  const pool = getPool();
  if (!bundle || !pool)
    return NextResponse.json({
      configurado: false,
      posts: [],
      atualizadoEm: null,
      linksVelhos: 0,
      porLink: false,
      erro: null,
    });

  const forcar = new URL(req.url).searchParams.get("atualizar") === "1";
  const erro = await atualizarMetricas(bundle, pool, userId, forcar ? 2 : 30);
  return NextResponse.json({
    configurado: true,
    porLink: !!tokenApify(),
    ...(await postsComMetricas(pool, userId)),
    erro,
  });
}
