import { NextResponse } from "next/server";
import sharp from "sharp";
import { adminOuResponder } from "@/lib/admin/acesso";
import { getPool } from "@/lib/db";
import { getObjectBuffer, getS3, presignGet } from "@/lib/storage/s3";
import { montarHtml } from "@/worker/motion/runtime";
import { FORMATOS_MOTION, FPS_MOTION, type InputMotion } from "@/worker/motion/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET — o HTML do motion pronto para tocar.
 *  - ?modo=preview (padrão): JSON { html } para o iframe da tela, com as
 *    imagens por links temporários (1h).
 *  - ?modo=arquivo: o arquivo .html para baixar, com as imagens dentro
 *    (reduzidas) — abre em qualquer navegador, sem depender do NIDO.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pool = getPool();
  const s3 = getS3();
  if (!pool || !s3) return NextResponse.json({ error: "Armazenamento não configurado." }, { status: 500 });
  const { id } = await params;
  const { rows } = await pool.query<{ input: InputMotion; html_key: string | null }>(
    "select input, html_key from motions where id = $1 and user_id = $2",
    [id, admin.userId],
  );
  const m = rows[0];
  if (!m?.html_key) return NextResponse.json({ error: "Motion sem HTML." }, { status: 404 });

  const arquivo = new URL(req.url).searchParams.get("modo") === "arquivo";
  const html = (await getObjectBuffer(s3, m.html_key)).toString("utf8");
  const enderecos = Object.fromEntries(
    await Promise.all(
      m.input.assets.map(async (a) => {
        if (!arquivo) return [a.id, await presignGet(s3, a.key, 3600)] as const;
        // WebP: mantém a transparência dos recortes e cabe no limite de resposta da Vercel.
        const buf = await sharp(await getObjectBuffer(s3, a.key))
          .rotate()
          .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        return [a.id, `data:image/webp;base64,${buf.toString("base64")}`] as const;
      }),
    ),
  );
  const { largura, altura } = FORMATOS_MOTION[m.input.formato];
  const pronto = montarHtml(html, {
    largura,
    altura,
    duracao: m.input.duracao,
    fps: FPS_MOTION,
    modo: arquivo ? "arquivo" : "preview",
    enderecos,
  });
  if (!arquivo) return NextResponse.json({ html: pronto });
  return new NextResponse(pronto, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="motion-${id}.html"`,
    },
  });
}
