import { after, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { gravarBadges } from "@/lib/nft/badges-server";
import { estadoNft } from "@/lib/nft/estado";
import { contextoNft } from "@/lib/nft/server";
import {
  atualizarViewsDaConta,
  autoresPendentes,
  concederPendentes,
  lerAutoresPendentes,
} from "@/lib/nft/views-server";
import { getBundle } from "@/lib/social/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Depois da resposta, a leitura dos autores espera o Apify (até 100 s por post).
export const maxDuration = 300;

/**
 * GET — NFT do personagem: carteira da conta, mint (conferido na rede se
 * estava em aberto), totais e badges. Os totais são recalculados no máximo a
 * cada 10 min — ou a cada consulta, enquanto os autores dos posts por link
 * estão sendo lidos. Depois da resposta: lê o autor dos posts por link que
 * ainda não têm (sem autor o post não conta) e grava no NFT os badges novos.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const ctx = await contextoNft();
  if (ctx instanceof NextResponse) return ctx;
  const { userId } = ctx;
  const { characterId } = await params;
  const pool = getPool()!;
  const { rowCount } = await pool.query(
    "select 1 from characters where id = $1 and user_id = $2",
    [characterId, userId],
  );
  if (!rowCount)
    return NextResponse.json(
      { error: "Personagem não encontrado." },
      { status: 404 },
    );

  const bundle = getBundle();
  const autores = await autoresPendentes(pool, userId, characterId);
  await atualizarViewsDaConta(pool, bundle, userId, {
    characterId,
    // Autores chegando: a conta acompanha, sem esperar os 10 minutos.
    forcar: autores.agora > 0 || autores.rodada,
  }).catch((e) => console.error("[nft] números", characterId, e));
  // Marca já batida cujo badge ainda não existia (o catálogo cresceu): sai agora.
  await concederPendentes(pool, userId, characterId).catch((e) =>
    console.error("[nft] badges pendentes", characterId, e),
  );

  const estado = await estadoNft(userId, characterId);
  const mint = estado.mint?.status === "confirmado" ? estado.mint : null;
  const faltaGravar = estado.badges.some(
    (b) => b.status === "conquistado" && !b.naRede,
  );
  if (autores.agora > 0 || (mint && faltaGravar))
    after(async () => {
      try {
        if (autores.agora > 0) {
          // Se a rodada parar no meio, o que já foi lido entra na conta mesmo assim.
          let recontar = true;
          try {
            recontar =
              (await lerAutoresPendentes(pool, userId, characterId)) > 0;
          } finally {
            if (recontar)
              await atualizarViewsDaConta(pool, bundle, userId, {
                characterId,
                forcar: true,
              });
          }
        }
        if (mint) await gravarBadges(mint.id);
      } catch (e) {
        console.error("[nft] depois do estado", characterId, e);
      }
    });
  return NextResponse.json(estado);
}
