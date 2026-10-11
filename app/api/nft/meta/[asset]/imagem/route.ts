import { NextResponse } from "next/server";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { getPool } from "@/lib/db";
import { getObjectBuffer, getS3 } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const naoAchei = () => new NextResponse("Não encontrado.", { status: 404 });

/**
 * GET — imagem pública do NFT: a cópia do Retrato feita no mint (ou refeita
 * quando o dono pede), lida do bucket privado e devolvida daqui (o endereço
 * não revela a conta nem a key). Sem login. Personagem apagado no app: a
 * imagem deixa de ser servida.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  const pool = getPool();
  const s3 = getS3();
  if (!pool || !s3 || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(asset))
    return naoAchei();
  const gate = await allow(`nftimg:${readIp(req)}`, 60);
  if (!gate.ok) return new NextResponse("Muitos pedidos.", { status: 429 });

  const { rows } = await pool.query<{ capa_key: string | null }>(
    `select m.capa_key from nft_mints m
     join characters c on c.id = m.character_id and c.user_id = m.user_id
     where m.asset = $1 and m.status in ('enviado', 'confirmado')`,
    [asset],
  );
  const key = rows[0]?.capa_key;
  if (!key) return naoAchei();
  try {
    const imagem = await getObjectBuffer(s3, key);
    return new NextResponse(new Uint8Array(imagem), {
      headers: {
        "Content-Type": "image/jpeg",
        "Access-Control-Allow-Origin": "*",
        // A imagem só muda quando o dono pede ("Usar o retrato atual") e para
        // de ser servida se o personagem for apagado: o cache não passa de um
        // dia. A tela do dono foge do cache com ?v=<versão>.
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (e) {
    console.error("[nft] capa", asset, e);
    return naoAchei();
  }
}
