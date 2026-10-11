import { planoAtual } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { bloqueioNft, CREDITOS_MINT_NFT } from "@/lib/planos";
import { BADGES, lerTotais } from "./badges";
import { carteiraDaConta } from "./carteira-server";
import type { BadgeDoPersonagem, EstadoNft } from "./comum";
import { redeNft } from "./config";
import { conferirMint, mintDoPersonagem, paraResposta } from "./mint";
import { chaveDeMintComSaldo, saldoDaCarteira } from "./rede";
import type { ResumoDosPosts } from "./views";
import { autoresPendentes } from "./views-server";

/** Badges do catálogo com a situação de cada um para o personagem. */
export async function badgesDoPersonagem(
  characterId: string,
  naRede: string[],
): Promise<BadgeDoPersonagem[]> {
  const { rows } = await getPool()!.query<{
    badge: string;
    status: string;
    concedido_em: Date;
  }>(
    "select badge, status, concedido_em from nft_badges where character_id = $1",
    [characterId],
  );
  const meus = new Map(rows.map((r) => [r.badge, r]));
  return BADGES.map((b) => {
    const m = meus.get(b.id);
    const status =
      m?.status === "concedido"
        ? "conquistado"
        : m?.status === "aguardando"
          ? "aguardando"
          : "bloqueado";
    return {
      id: b.id,
      metrica: b.metrica,
      nome: b.nome,
      nomeEn: b.nomeEn,
      rotulo: b.rotulo,
      limite: b.limite,
      status,
      em: m && status !== "bloqueado" ? m.concedido_em.toISOString() : null,
      naRede: status === "conquistado" && naRede.includes(b.id),
    };
  });
}

/**
 * O que a tela mostra do NFT de um personagem: carteira, mint (conferido na
 * rede se ainda estava em aberto), views e badges.
 */
export async function estadoNft(
  userId: string,
  characterId: string,
): Promise<EstadoNft> {
  const pool = getPool()!;
  let mint = await mintDoPersonagem(userId, characterId);
  if (mint && (mint.status === "preparando" || mint.status === "enviado")) {
    try {
      mint = (await conferirMint(mint.id)) ?? mint;
    } catch (e) {
      console.error("[nft] conferência do mint", mint.id, e);
    }
  }
  const carteira = await carteiraDaConta(userId);
  const [{ rows: v }, { rows: gravados }, plano, saldoSol, comSaldo, autores] =
    await Promise.all([
      pool.query<{
        total: string;
        totais: unknown;
        resumo: ResumoDosPosts | null;
      }>(
        `select total::text as total, totais, resumo
         from nft_views where character_id = $1 and user_id = $2`,
        [characterId, userId],
      ),
      pool.query<{ badges_onchain: string[] }>(
        "select badges_onchain from nft_mints where id = $1",
        [mint?.status === "confirmado" ? mint.id : ""],
      ),
      planoAtual(userId),
      carteira ? saldoDaCarteira(carteira) : null,
      chaveDeMintComSaldo(),
      autoresPendentes(pool, userId, characterId),
    ]);
  return {
    rede: redeNft() ?? "mainnet",
    custo: CREDITOS_MINT_NFT,
    bloqueio: bloqueioNft(plano),
    carteira,
    saldoSol,
    // Sem resposta da rede, não trava a tela: o mint confere de novo na hora.
    mintDisponivel: comSaldo !== false,
    mint: mint ? paraResposta(mint) : null,
    views: Number(v[0]?.total ?? 0),
    totais: { ...lerTotais(v[0]?.totais), views: Number(v[0]?.total ?? 0) },
    resumo: v[0]?.resumo ?? null,
    // Há post que o app consegue ler agora, ou uma rodada em curso. A conta é
    // a mesma de quem lê (lerAutoresPendentes), para a tela não esperar à toa.
    lendoAutores: autores.agora > 0 || autores.rodada,
    autoresDepois: autores.depois,
    badges: await badgesDoPersonagem(
      characterId,
      gravados[0]?.badges_onchain ?? [],
    ),
  };
}
