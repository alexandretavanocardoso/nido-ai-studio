import { NextResponse } from "next/server";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { getPool } from "@/lib/db";
import { hydrate } from "@/lib/defaults";
import { lerTotais } from "@/lib/nft/badges";
import { baseUrlNft } from "@/lib/nft/config";
import { metadadosDaColecao, metadadosDoNft } from "@/lib/nft/metadados";
import type { Character } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Carteiras e explorers leem isto do navegador, de qualquer site. */
const CABECALHOS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
};

const naoAchei = () =>
  NextResponse.json({ error: "Não encontrado." }, { status: 404, headers: CABECALHOS });

/**
 * GET — metadados públicos do NFT (formato da Metaplex), no endereço que fica
 * gravado na rede. Sem login. Só sai o que é público: nome, bio, capa, traços
 * e badges. `colecao` no lugar do endereço devolve os metadados da coleção.
 * Personagem apagado no app: o NFT aparece como arquivado, sem capa nem bio.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  const base = baseUrlNft();
  const pool = getPool();
  if (!base || !pool) return naoAchei();
  if (asset === "colecao")
    return NextResponse.json(metadadosDaColecao(base), { headers: CABECALHOS });
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(asset)) return naoAchei();
  const gate = await allow(`nftmeta:${readIp(req)}`, 120);
  if (!gate.ok)
    return NextResponse.json({ error: "Muitos pedidos." }, { status: 429 });

  const { rows } = await pool.query<{
    nome: string;
    capa_key: string | null;
    confirmado_em: Date | null;
    created_at: Date;
    character_id: string;
    data: Character | null;
    totais: unknown;
    views: string | null;
    badges: string[];
  }>(
    `select m.nome, m.capa_key, m.confirmado_em, m.created_at, m.character_id, c.data,
       (select totais from nft_views v where v.character_id = m.character_id) as totais,
       (select total::text from nft_views v where v.character_id = m.character_id) as views,
       coalesce((select array_agg(b.badge) from nft_badges b
                 where b.character_id = m.character_id and b.status = 'concedido'), '{}') as badges
     from nft_mints m
     left join characters c on c.id = m.character_id and c.user_id = m.user_id
     where m.asset = $1 and m.status in ('enviado', 'confirmado')`,
    [asset],
  );
  const m = rows[0];
  if (!m) return naoAchei();
  return NextResponse.json(
    metadadosDoNft({
      base,
      asset,
      nome: m.nome,
      personagem: m.data ? hydrate(m.data) : null,
      temCapa: !!m.capa_key,
      badges: m.badges,
      // O total de views vale também para quem foi conferido antes dos totais por métrica.
      totais: { ...lerTotais(m.totais), views: Number(m.views ?? 0) },
      mintadoEm: m.confirmado_em ?? m.created_at,
    }),
    { headers: CABECALHOS },
  );
}
