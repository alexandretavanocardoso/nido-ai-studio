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
  CORTE_MAX_SEGUNDOS,
  CORTE_MIN_SEGUNDOS,
  CREDITOS_CORTAR_VIDEO,
} from "@/lib/planos";
import {
  downloadToFile,
  newKey,
  ownsKey,
  uploadFromFile,
} from "@/lib/storage/s3";
import { ajustarCorte, cortarTrecho, probe } from "@/lib/video/ffmpeg";
import { registrarEdicao } from "@/lib/video/reembolso-server";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CURTO_DEMAIS = `O trecho precisa ter pelo menos ${String(CORTE_MIN_SEGUNDOS).replace(".", ",")}s.`;

const BodySchema = z
  .object({
    key: z.string().min(1),
    /** Começo e fim do trecho que fica, em segundos do vídeo original. */
    inicio: z.number().min(0),
    fim: z.number().positive(),
  })
  .refine((b) => b.fim - b.inicio >= CORTE_MIN_SEGUNDOS, {
    message: CURTO_DEMAIS,
  })
  .refine((b) => b.fim - b.inicio <= CORTE_MAX_SEGUNDOS, {
    message: `O trecho pode ter até ${CORTE_MAX_SEGUNDOS / 60} minutos.`,
  });

/**
 * POST — corta o vídeo, ficando só com o trecho entre `inicio` e `fim`. Gera um
 * vídeo novo no S3 (o original fica intacto); devolve { key, size, duracao, edicaoId }.
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

  const gate = await allow(`cortar:${userId}`, 10);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitas edições seguidas. Tente em ${gate.retryAfter}s.` },
      { status: 429 },
    );

  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "video");
  if (vaga instanceof NextResponse) return vaga;
  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_CORTAR_VIDEO,
    "video_corte",
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
      const trecho = ajustarCorte(
        body.inicio,
        body.fim,
        info.duracao,
        CORTE_MIN_SEGUNDOS,
      );
      if (!trecho) throw new LimiteError(CURTO_DEMAIS);
      await cortarTrecho(entrada, trecho.inicio, trecho.duracao, saida);
      const key = newKey(userId, "videos", "video/mp4");
      const size = await uploadFromFile(s3, key, saida, "video/mp4");
      await somarArmazenamento(userId, size);
      const edicaoId = await registrarEdicao({
        userId,
        tipo: "corte",
        key,
        duracao: trecho.duracao,
        cobranca: cobrado.cobranca,
      });
      return { key, size, duracao: trecho.duracao, edicaoId };
    });
    return NextResponse.json(resultado);
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof LimiteError)
      return NextResponse.json(
        { error: e.message, code: "BAD_INPUT" },
        { status: 400 },
      );
    console.error("[videos/cortar]", e);
    return NextResponse.json(
      { error: "Não consegui cortar o vídeo.", code: "UNKNOWN" },
      { status: 500 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}

class LimiteError extends Error {}
