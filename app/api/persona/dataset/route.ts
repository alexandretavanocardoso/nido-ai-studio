import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { generateImage, shrinkReferencia } from "@/lib/ai/gemini";
import { gerarImagemFal } from "@/lib/ai/fal-imagem";
import { cobrarOuResponder, estornarParcial, planoAtual } from "@/lib/creditos";
import { getFal } from "@/lib/fal";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import { promptVariacao } from "@/lib/persona/dataset";
import { carregarPersonagem } from "@/lib/personagens";
import { bloqueioPersona, CREDITOS_IMAGEM_DATASET } from "@/lib/planos";
import { extractDescricaoVisual } from "@/lib/prompts/gerar-imagem";
import { recursosDisponiveis } from "@/lib/recursos";
import {
  getObjectBuffer,
  newKey,
  ownsKey,
  presignGet,
  putObject,
} from "@/lib/storage/s3";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Gerações em paralelo (respeita limites de taxa do Gemini/fal). */
const PARALELO = 4;

const BodySchema = z.object({
  characterId: z.string().min(1),
  referenciaKey: z.string().min(1),
  quantidade: z.number().int().min(4).max(30).default(20),
  /** Começa de qual variação (pra gerar mais sem repetir as anteriores). */
  inicio: z.number().int().min(0).max(1000).default(0),
});

/**
 * POST — gera o conjunto de treino da persona: N variações do personagem
 * (ângulos, expressões, luzes) a partir de uma referência. Cobra 5 créditos
 * por imagem e devolve os créditos das que falharem.
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const recursos = recursosDisponiveis();
  const fal = recursos.fal ? getFal() : null;
  if (!recursos.gemini && !fal)
    return NextResponse.json(
      {
        error: "Nenhum gerador de imagem configurado.",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;
  if (!ownsKey(userId, body.referenciaKey))
    return NextResponse.json(
      { error: "Referência não encontrada." },
      { status: 404 },
    );

  const bloqueio = bloqueioPersona(await planoAtual(userId));
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );
  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "imagem");
  if (vaga instanceof NextResponse) return vaga;

  const cobrado = await cobrarOuResponder(
    userId,
    body.quantidade * CREDITOS_IMAGEM_DATASET,
    "persona_dataset",
    body.characterId,
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }

  try {
    const personagem = await carregarPersonagem(userId, body.characterId);
    const descricao = personagem
      ? extractDescricaoVisual(personagem, "neutro").replace(/\s+/g, " ")
      : "";
    const refBuf = await getObjectBuffer(s3, body.referenciaKey);
    const refInline = recursos.gemini ? await shrinkReferencia(refBuf) : null;
    const refUrl = recursos.gemini
      ? null
      : await presignGet(s3, body.referenciaKey, 3600);

    const gerar = async (
      i: number,
    ): Promise<{ id: string; key: string } | null> => {
      try {
        const prompt = promptVariacao(body.inicio + i, descricao);
        const jpeg = refInline
          ? await generateImage({
              prompt,
              referencias: [refInline],
              aspectRatio: "3:4",
              imageSize: "1K",
              qualidade: "padrao",
            })
          : await gerarImagemFal(fal!, {
              modelo: "seedream",
              tipo: "retrato",
              prompt,
              imageUrls: [refUrl!],
              qualidade: "padrao",
            });
        const key = newKey(userId, "dataset", "image/jpeg");
        await putObject(s3, key, jpeg, "image/jpeg");
        await somarArmazenamento(userId, jpeg.length);
        return { id: nanoid(8), key };
      } catch (e) {
        console.warn(
          "[persona/dataset] variação falhou:",
          (e as Error).message,
        );
        return null;
      }
    };

    const imagens: Array<{ id: string; key: string }> = [];
    for (let i = 0; i < body.quantidade; i += PARALELO) {
      const lote = await Promise.all(
        Array.from(
          { length: Math.min(PARALELO, body.quantidade - i) },
          (_, j) => gerar(i + j),
        ),
      );
      for (const r of lote) if (r) imagens.push(r);
    }

    const falhas = body.quantidade - imagens.length;
    await estornarParcial(cobrado.cobranca, falhas * CREDITOS_IMAGEM_DATASET);
    if (!imagens.length)
      return NextResponse.json(
        {
          error: "Nenhuma variação foi gerada. Os créditos foram devolvidos.",
          code: "PROVIDER_ERROR",
        },
        { status: 502 },
      );
    return NextResponse.json({ imagens, falhas });
  } catch (e) {
    await estornarParcial(
      cobrado.cobranca,
      body.quantidade * CREDITOS_IMAGEM_DATASET,
    );
    console.error("[persona/dataset]", e);
    return NextResponse.json(
      { error: "Não consegui gerar o conjunto. Os créditos foram devolvidos." },
      { status: 500 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}
