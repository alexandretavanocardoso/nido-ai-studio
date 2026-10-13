import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { allow } from "@/lib/ai/rate-limit";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import {
  bloqueioLegendaIA,
  CREDITOS_LEGENDA,
  creditosLegendaIA,
} from "@/lib/planos";
import { nanoid } from "nanoid";
import type { S3Client } from "@aws-sdk/client-s3";
import { getPool } from "@/lib/db";
import { getFal, mensagemDeErro } from "@/lib/fal";
import { planoAtual } from "@/lib/creditos";
import { iniciarLegendaIA, MODELO_ERASER } from "@/lib/video/legenda-ia";
import {
  downloadToFile,
  newKey,
  ownsKey,
  uploadFromFile,
} from "@/lib/storage/s3";
import { editarLegenda, probe } from "@/lib/video/ffmpeg";
import { registrarEdicao } from "@/lib/video/reembolso-server";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Re-encodar leva ~1–2x a duração do vídeo; acima disso estoura o tempo da função. */
const MAX_SEGUNDOS = 180;

const fracao = z.number().min(0).max(1);
const BodySchema = z.object({
  key: z.string().min(1),
  caixa: z.object({
    x: fracao,
    y: fracao,
    w: fracao.positive(),
    h: fracao.positive(),
  }),
  modo: z.enum(["remover", "trocar"]),
  texto: z.string().max(200).optional(),
  /** rapida = ffmpeg (delogo), na hora · ia = Bria Video Eraser no fal (fundo complexo), assíncrono. */
  qualidade: z.enum(["rapida", "ia"]).default("rapida"),
  /** Personagem dono do vídeo (pra atualizar a ficha quando o job da IA terminar). */
  characterId: z.string().optional(),
});

/**
 * POST — remove ou troca uma legenda "queimada" no vídeo, na área marcada
 * pela pessoa. Gera um vídeo novo no S3 (o original fica intacto).
 *  - rapida: ffmpeg na hora; devolve { key }.
 *  - ia: trechos na IA (fal), assíncrono; devolve { jobId } — acompanhado em
 *    /api/videos/jobs/[id] e finalizado por webhook/cron mesmo com a página fechada.
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;
  if (!ownsKey(userId, body.key))
    return NextResponse.json(
      { error: "Vídeo não encontrado." },
      { status: 404 },
    );
  if (body.modo === "trocar" && !body.texto?.trim())
    return NextResponse.json(
      { error: "Escreva o texto da nova legenda.", code: "BAD_INPUT" },
      { status: 400 },
    );

  const gate = await allow(`legenda:${userId}`, 6);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitas edições seguidas. Tente em ${gate.retryAfter}s.` },
      { status: 429 },
    );

  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "video");
  if (vaga instanceof NextResponse) return vaga;

  if (body.qualidade === "ia") {
    // A vaga vale até o job ser registrado; depois, o próprio job ocupa a vaga.
    try {
      return await iniciarComIA(userId, s3, body);
    } finally {
      await liberarVaga(vaga.vaga);
    }
  }

  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_LEGENDA,
    "video_legenda",
    body.key,
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }

  try {
    const resultado = await comPastaTemporaria(async (dir) => {
      const entrada = path.join(dir, "entrada.mp4");
      const saida = path.join(dir, "saida.mp4");
      await downloadToFile(s3, body.key, entrada);
      const info = await probe(entrada);
      if (info.duracao > MAX_SEGUNDOS)
        throw new LimiteError(`Vídeo maior que ${MAX_SEGUNDOS / 60} minutos.`);
      await editarLegenda({
        entrada,
        saida,
        tmpDir: dir,
        info,
        caixa: body.caixa,
        modo: body.modo,
        texto: body.texto,
      });
      const key = newKey(userId, "videos", "video/mp4");
      const size = await uploadFromFile(s3, key, saida, "video/mp4");
      await somarArmazenamento(userId, size);
      const edicaoId = await registrarEdicao({
        userId,
        tipo: "legenda",
        key,
        duracao: info.duracao,
        cobranca: cobrado.cobranca,
        characterId: body.characterId,
      });
      return { key, size, duracao: info.duracao, edicaoId };
    });
    return NextResponse.json(resultado);
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof LimiteError)
      return NextResponse.json(
        { error: e.message, code: "BAD_INPUT" },
        { status: 400 },
      );
    console.error("[videos/legenda]", e);
    return NextResponse.json(
      { error: "Não consegui editar o vídeo.", code: "UNKNOWN" },
      { status: 500 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}

class LimiteError extends Error {}

/** Remoção com IA: mede a duração, cobra, envia os trechos ao fal e registra o job. */
async function iniciarComIA(
  userId: string,
  s3: S3Client,
  body: z.infer<typeof BodySchema>,
) {
  const fal = getFal();
  const pool = getPool();
  if (!fal || !pool)
    return NextResponse.json(
      {
        error: "Remoção com IA não configurada (FAL_KEY).",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );

  const { duracao } = await comPastaTemporaria(async (dir) => {
    const arquivo = path.join(dir, "video.mp4");
    await downloadToFile(s3, body.key, arquivo);
    return probe(arquivo);
  });
  const bloqueio = bloqueioLegendaIA(await planoAtual(userId), duracao);
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );

  const creditos = creditosLegendaIA(duracao);
  const cobrado = await cobrarOuResponder(
    userId,
    creditos,
    "video_legenda_ia",
    body.key,
  );
  if (cobrado instanceof NextResponse) return cobrado;

  const jobId = nanoid(12);
  try {
    const { info, segmentos } = await iniciarLegendaIA({
      fal,
      s3,
      videoKey: body.key,
      caixa: body.caixa,
      jobId,
    });
    await pool.query(
      `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
       values ($1, $2, $3, 'fal', 'legenda_ia', $4, $5, $6, $7)`,
      [
        jobId,
        userId,
        body.characterId ?? "",
        MODELO_ERASER,
        segmentos[0]?.requestId ?? "",
        JSON.stringify({
          videoKey: body.key,
          caixa: body.caixa,
          modo: body.modo,
          texto: body.texto,
          info,
          segmentos,
          cobranca: cobrado.cobranca,
        }),
        info.duracao,
      ],
    );
    return NextResponse.json({
      jobId,
      duracao: info.duracao,
      creditos,
      trechos: segmentos.length,
    });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    console.error("[videos/legenda] IA:", e);
    return NextResponse.json(
      { error: mensagemDeErro(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
