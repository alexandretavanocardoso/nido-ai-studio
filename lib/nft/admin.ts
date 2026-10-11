import { usuarioLiberado } from "@/lib/admin/acesso";
import { criarAviso } from "@/lib/avisos-server";
import { getPool } from "@/lib/db";
import { badgePorId, ESCADAS, lerTotais, type MetricaBadge } from "./badges";
import {
  chaveDeBadges,
  chaveDeMint,
  colecaoNft,
  linkExplorerNft,
  nftConfigurado,
  redeNft,
  saldoMinimoNft,
  tetoDiarioNft,
  type RedeNft,
} from "./config";
import { saldoDaChaveDeMint } from "./rede";

/** Aba "NFT" da área admin: situação das chaves, badges esperando aprovação e mints. */
export interface PainelNft {
  ligado: boolean;
  rede: RedeNft | null;
  colecao: string | null;
  chaveMint: string | null;
  chaveBadges: string | null;
  /** Saldo (SOL) da chave que paga as taxas; null = não deu para ler. */
  saldo: number | null;
  saldoMinimo: number;
  mints24h: number;
  tetoDia: number;
  confirmados: number;
  aguardando: Array<{
    characterId: string;
    badge: string;
    nomeBadge: string;
    personagem: string;
    userId: string | null;
    email: string | null;
    /** Métrica do badge, e como ela se chama ("curtidas"). */
    metrica: MetricaBadge;
    unidade: string;
    /** Total da métrica quando a marca foi batida. */
    valor: number;
    /** Total da métrica que conta agora. */
    valorAgora: number;
    motivo: string | null;
    quando: string;
  }>;
  mints: Array<{
    id: string;
    userId: string | null;
    email: string | null;
    personagem: string;
    status: string;
    erro: string | null;
    asset: string;
    carteira: string;
    /** Rede em que o mint foi feito (o painel lista as duas). */
    rede: RedeNft;
    badges: string[];
    quando: string;
    linkAsset: string;
    linkTransacao: string | null;
  }>;
}

export async function painelNft(): Promise<PainelNft> {
  const pool = getPool()!;
  const rede = redeNft();
  const [aguardando, mints, totais, saldo] = await Promise.all([
    pool.query<{
      character_id: string;
      badge: string;
      user_id: string | null;
      email: string | null;
      personagem: string | null;
      metrica: string;
      views: string;
      totais: unknown;
      motivo: string | null;
      concedido_em: Date;
    }>(
      // nft_badges.views guarda o total DA MÉTRICA do badge na hora da conquista.
      `select b.character_id, b.badge, b.user_id, u.email, b.metrica, b.views::text as views, b.motivo, b.concedido_em,
         c.data -> 'identidade' ->> 'nome' as personagem,
         (select totais from nft_views v where v.character_id = b.character_id) as totais
       from nft_badges b
       left join "user" u on u.id = b.user_id
       left join characters c on c.id = b.character_id
       where b.status = 'aguardando' order by b.concedido_em desc limit 200`,
    ),
    pool.query<{
      id: string;
      user_id: string | null;
      email: string | null;
      nome: string;
      status: string;
      erro: string | null;
      asset: string;
      carteira: string;
      rede: RedeNft;
      assinatura: string | null;
      badges_onchain: string[];
      created_at: Date;
    }>(
      `select m.id, m.user_id, u.email, m.nome, m.status, m.erro, m.asset, m.carteira, m.rede, m.assinatura,
         m.badges_onchain, m.created_at
       from nft_mints m left join "user" u on u.id = m.user_id
       order by m.created_at desc limit 100`,
    ),
    // Os números do alto do painel são só da rede em que o app está.
    pool.query<{ dia: number; confirmados: number }>(
      `select count(*) filter (where status in ('enviado', 'confirmado') and created_at > now() - interval '24 hours')::int as dia,
         count(*) filter (where status = 'confirmado')::int as confirmados
       from nft_mints where rede = $1`,
      [rede],
    ),
    nftConfigurado() ? saldoDaChaveDeMint().catch(() => null) : null,
  ]);
  return {
    ligado: nftConfigurado(),
    rede,
    colecao: colecaoNft()?.toBase58() ?? null,
    chaveMint: chaveDeMint()?.publicKey.toBase58() ?? null,
    chaveBadges: chaveDeBadges()?.publicKey.toBase58() ?? null,
    saldo,
    saldoMinimo: saldoMinimoNft(),
    mints24h: totais.rows[0].dia,
    tetoDia: tetoDiarioNft(),
    confirmados: totais.rows[0].confirmados,
    aguardando: aguardando.rows.map((r) => {
      const metrica = (badgePorId(r.badge)?.metrica ??
        (r.metrica in ESCADAS ? r.metrica : "views")) as MetricaBadge;
      return {
        characterId: r.character_id,
        badge: r.badge,
        nomeBadge: badgePorId(r.badge)?.nome ?? r.badge,
        personagem: r.personagem?.trim() || "(personagem apagado)",
        userId: r.user_id,
        email: r.email,
        metrica,
        unidade: ESCADAS[metrica].plural,
        valor: Number(r.views),
        valorAgora: lerTotais(r.totais)[metrica],
        motivo: r.motivo,
        quando: r.concedido_em.toISOString(),
      };
    }),
    mints: mints.rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      email: m.email,
      personagem: m.nome,
      status: m.status,
      erro: m.erro,
      asset: m.asset,
      carteira: m.carteira,
      rede: m.rede,
      badges: m.badges_onchain.filter((b) => !b.startsWith("__")),
      quando: m.created_at.toISOString(),
      linkAsset: linkExplorerNft("address", m.asset, m.rede),
      linkTransacao: m.assinatura
        ? linkExplorerNft("tx", m.assinatura, m.rede)
        : null,
    })),
  };
}

/**
 * Aprova ou recusa um badge que esperava aprovação. Aprovado, passa a valer e
 * vai para o NFT na próxima gravação; recusado, não volta a ser concedido.
 * false = não havia badge esperando (já decidido por outro admin).
 */
export async function decidirBadge(
  characterId: string,
  badge: string,
  aprovar: boolean,
  porEmail: string,
): Promise<boolean> {
  const { rows } = await getPool()!.query<{
    user_id: string | null;
    personagem: string | null;
  }>(
    `update nft_badges b set status = $3, decidido_por = $4, decidido_em = now(),
       concedido_em = case when $3 = 'concedido' then now() else concedido_em end
     where b.character_id = $1 and b.badge = $2 and b.status = 'aguardando'
     returning b.user_id,
       (select data -> 'identidade' ->> 'nome' from characters c where c.id = b.character_id) as personagem`,
    [characterId, badge, aprovar ? "concedido" : "recusado", porEmail],
  );
  const r = rows[0];
  if (!r) return false;
  // Recurso ainda fechado para a conta: o badge vale, mas o sino não anuncia.
  if (aprovar && r.user_id && (await usuarioLiberado("nft", r.user_id)))
    await criarAviso(r.user_id, {
      rotulo: `Badge ${badgePorId(badge)?.nome ?? badge} · ${r.personagem?.trim() || "personagem"}`,
      href: `/app/personagem/${characterId}?aba=nft`,
      chave: `badge:${characterId}:${badge}`,
    });
  return true;
}
