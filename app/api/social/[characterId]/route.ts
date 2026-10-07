import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  contasDoTime,
  estadoPost,
  getBundle,
  mensagemBundle,
  timeDoPersonagem,
} from "@/lib/social/bundle";
import { statusEmAberto } from "@/lib/social/redes";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LinhaPost {
  id: string;
  bundle_post_id: string | null;
  redes: string[];
  texto: string;
  titulo: string | null;
  midia_key: string | null;
  midia_tipo: string | null;
  post_date: Date;
  status: string;
  erros: Record<string, string> | null;
  links: Record<string, string> | null;
}

/**
 * GET — publicação do personagem: contas conectadas e posts (os que ainda
 * podem mudar são conferidos no bundle.social antes de responder).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ characterId: string }> },
) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId } = ctx;
  const { characterId } = await params;
  const bundle = getBundle();
  const pool = getPool();
  if (!bundle || !pool)
    return NextResponse.json({ configurado: false, contas: [], posts: [] });

  const teamId = await timeDoPersonagem(userId, characterId);
  let contas: Awaited<ReturnType<typeof contasDoTime>> = [];
  let erroContas: string | null = null;
  if (teamId) {
    try {
      contas = await contasDoTime(bundle, teamId);
    } catch (e) {
      erroContas = mensagemBundle(e);
    }
  }

  const { rows } = await pool.query<LinhaPost>(
    `select id, bundle_post_id, redes, texto, titulo, midia_key, midia_tipo, post_date, status, erros, links
     from posts_agendados where user_id = $1 and character_id = $2 order by post_date desc limit 50`,
    [userId, characterId],
  );
  // Confere os que ainda podem mudar (o webhook também atualiza; isto cobre webhook perdido/local).
  await Promise.all(
    rows
      .filter(
        (p) =>
          p.bundle_post_id &&
          statusEmAberto(p.status) &&
          p.post_date.getTime() < Date.now() + 60_000,
      )
      .slice(0, 10)
      .map(async (p) => {
        try {
          const e = await estadoPost(bundle, p.bundle_post_id!);
          Object.assign(p, {
            status: e.status,
            erros: e.erros,
            links: e.links,
          });
          await pool.query(
            "update posts_agendados set status = $2, erros = $3, links = $4, updated_at = now() where id = $1",
            [
              p.id,
              e.status,
              e.erros ? JSON.stringify(e.erros) : null,
              e.links ? JSON.stringify(e.links) : null,
            ],
          );
        } catch {
          /* fica o último estado conhecido */
        }
      }),
  );

  return NextResponse.json({
    configurado: true,
    conectado: !!teamId,
    contas,
    erroContas,
    posts: rows.map((p) => ({
      id: p.id,
      redes: p.redes,
      texto: p.texto,
      titulo: p.titulo,
      midiaKey: p.midia_key,
      midiaTipo: p.midia_tipo,
      quando: p.post_date.toISOString(),
      status: p.status,
      erros: p.erros,
      links: p.links,
    })),
  });
}
