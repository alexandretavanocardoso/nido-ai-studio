import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import type { S3Client } from "@aws-sdk/client-s3";
import { cobrarOuResponder, estornarSeHouver, planoAtual } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { bloqueioPublicar, CREDITOS_POST_POR_REDE } from "@/lib/planos";
import { presignGet } from "@/lib/storage/s3";
import { contasDoTime, criarPost, getBundle, mensagemBundle, nomesRedes, timeDoPersonagem } from "./bundle";
import type { Rede, TipoMidia } from "./redes";

/**
 * Envia um post ao bundle.social (agora ou agendado): confere plano e contas
 * conectadas, cobra os créditos, envia a mídia e cria o post. Com `idExistente`
 * (post do backlog), atualiza a linha em vez de criar outra.
 */
export async function enviarParaRedes(o: {
  userId: string;
  s3: S3Client;
  body: {
    characterId: string;
    redes: Rede[];
    texto: string;
    titulo?: string;
    midiaKey?: string;
  };
  midiaTipo: TipoMidia | null;
  dataPost: Date;
  agora: number;
  idExistente?: string;
}): Promise<NextResponse> {
  const { userId, s3, body, midiaTipo, dataPost, agora } = o;
  const bundle = getBundle()!;
  const pool = getPool()!;
  const bloqueio = bloqueioPublicar(await planoAtual(userId));
  if (bloqueio) return NextResponse.json({ error: bloqueio, code: "PLANO" }, { status: 403 });

  const teamId = await timeDoPersonagem(userId, body.characterId);
  if (!teamId)
    return NextResponse.json(
      { error: "Conecte as redes deste influencer primeiro.", code: "BAD_INPUT" },
      { status: 400 },
    );
  try {
    const conectadas = new Set((await contasDoTime(bundle, teamId)).map((c) => c.rede));
    const faltam = body.redes.filter((r) => !conectadas.has(r));
    if (faltam.length)
      return NextResponse.json(
        { error: `Conecte antes: ${nomesRedes(faltam)}.`, code: "BAD_INPUT" },
        { status: 400 },
      );
  } catch (e) {
    return NextResponse.json({ error: mensagemBundle(e), code: "PROVIDER_ERROR" }, { status: 502 });
  }

  const cobrado = await cobrarOuResponder(
    userId,
    body.redes.length * CREDITOS_POST_POR_REDE,
    "post_redes",
    body.characterId,
  );
  if (cobrado instanceof NextResponse) return cobrado;

  const id = o.idExistente ?? nanoid(12);
  try {
    const postId = await criarPost(bundle, {
      teamId,
      redes: body.redes,
      texto: body.texto.trim(),
      titulo: body.titulo?.trim(),
      midiaUrl: body.midiaKey ? await presignGet(s3, body.midiaKey, 6 * 3600) : null,
      midiaTipo,
      quando: dataPost,
      referencia: id,
    });
    await pool.query(
      `insert into posts_agendados (id, user_id, character_id, bundle_post_id, redes, texto, titulo, midia_key, midia_tipo, post_date, cobranca)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (id) do update set bundle_post_id = excluded.bundle_post_id, redes = excluded.redes,
         texto = excluded.texto, titulo = excluded.titulo, midia_key = excluded.midia_key, midia_tipo = excluded.midia_tipo,
         post_date = excluded.post_date, cobranca = excluded.cobranca, status = 'SCHEDULED', erros = null, links = null,
         updated_at = now()`,
      [
        id,
        userId,
        body.characterId,
        postId,
        body.redes,
        body.texto.trim(),
        body.titulo?.trim() || null,
        body.midiaKey ?? null,
        midiaTipo,
        dataPost,
        cobrado.cobranca ? JSON.stringify(cobrado.cobranca) : null,
      ],
    );
    return NextResponse.json({ id, quando: dataPost.toISOString(), agora: dataPost.getTime() === agora });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    console.error("[social/posts]", e);
    return NextResponse.json(
      { error: `${mensagemBundle(e)} Os créditos foram devolvidos.`, code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
