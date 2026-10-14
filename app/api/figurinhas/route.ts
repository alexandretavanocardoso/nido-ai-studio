import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import {
  generateImage,
  ImageBlockedError,
  ImageConfigError,
  ImageProviderError,
  shrinkReferencia,
} from "@/lib/ai/gemini";
import {
  cobrarOuResponder,
  estornarSeHouver,
  planoAtual,
  type Cobranca,
} from "@/lib/creditos";
import { getFal } from "@/lib/fal";
import {
  figurinhaTemFundo,
  montarFigurinha,
  montarFigurinhaInteira,
  promptFigurinha,
  recortarFigura,
  REGRAS_DA_FIGURINHA_INTEIRA,
  REGRAS_DA_FIGURINHA_TROCADA,
} from "@/lib/figurinha";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import { bloqueioImagem, CREDITOS_FIGURINHA } from "@/lib/planos";
import { promptTrocaImagem } from "@/lib/prompts/trocar-imagem";
import { descreverPessoasNaFoto } from "@/lib/video/pessoas";
import type { S3Client } from "@aws-sdk/client-s3";
import { POST as substituirPost } from "@/app/api/videos/substituir/route";
import { getPool } from "@/lib/db";
import {
  getObjectBuffer,
  newKey,
  ownsKey,
  putObject,
  uploadFromFile,
} from "@/lib/storage/s3";
import {
  figurinhaParaVideo,
  quadrosDaFigurinha,
} from "@/lib/video/figurinha-animada";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z
  .object({
    characterId: z.string().min(1),
    /** Imagem do personagem que serve de referência (rosto, roupa, estilo). */
    imageKey: z.string().min(1, "Escolha a imagem do personagem."),
    /** gerar: figurinha nova a partir de uma situação · substituir: põe o personagem numa figurinha pronta. */
    modo: z.enum(["gerar", "substituir"]),
    cena: z.string().trim().max(300).optional(),
    /** Figurinha original (já enviada para a conta). */
    fotoKey: z.string().min(1).optional(),
    /**
     * Na troca: "foto" troca só o rosto (a roupa da figurinha fica);
     * "personagem" troca o rosto e a roupa.
     */
    roupa: z.enum(["foto", "personagem"]).default("personagem"),
    /**
     * Na troca: quem trocar (clique em frações da figurinha, de 0 a 1) e a
     * imagem do personagem que entra no lugar de cada um. Sem isso, troca a
     * pessoa principal por `imageKey`.
     */
    pessoas: z
      .array(
        z.object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          imageKey: z.string().min(1),
        }),
      )
      .max(3)
      .optional(),
  })
  .refine((b) => (b.modo === "gerar" ? (b.cena ?? "").length >= 3 : !!b.fotoKey), {
    message: "Descreva a figurinha ou envie a figurinha original.",
  });

/**
 * POST — figurinha de WhatsApp do personagem (WebP 512×512, fundo
 * transparente, até 100 KB). Gera uma nova a partir de uma situação, ou troca
 * o personagem de uma figurinha existente mantendo pose e estilo.
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
  const marcadas = body.modo === "substituir" ? (body.pessoas ?? []) : [];
  if (
    !ownsKey(userId, body.imageKey) ||
    (body.fotoKey && !ownsKey(userId, body.fotoKey)) ||
    !marcadas.every((p) => ownsKey(userId, p.imageKey))
  )
    return NextResponse.json(
      { error: "Imagem não encontrada." },
      { status: 404 },
    );

  // Figurinha animada: é uma troca de pessoa em vídeo (cobrada por segundo,
  // assíncrona). Segue por outro caminho, antes de cobrar a figurinha parada.
  if (body.modo === "substituir") {
    const arquivo = await getObjectBuffer(s3, body.fotoKey!);
    if ((await quadrosDaFigurinha(arquivo)) > 1)
      return trocarAnimada(req, { userId, s3, arquivo, body, marcadas });
  }

  const bloqueio = bloqueioImagem(
    await planoAtual(userId),
    "nano-banana",
    "padrao",
  );
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
    CREDITOS_FIGURINHA,
    "imagem",
    `figurinha-${body.modo}`,
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }
  const cobranca: Cobranca | null = cobrado.cobranca;

  try {
    const personagem = await shrinkReferencia(
      await getObjectBuffer(s3, body.imageKey),
    );
    let gerada: Buffer;
    /** A figurinha original é um quadro inteiro, com cenário: o resultado também. */
    let inteira = false;
    if (body.modo === "gerar") {
      gerada = await generateImage({
        prompt: promptFigurinha(body.cena!),
        referencias: [personagem],
        aspectRatio: "1:1",
        imageSize: "1K",
        qualidade: "padrao",
      });
    } else {
      // A figurinha original costuma ter fundo transparente: vai sobre branco.
      const arquivo = await getObjectBuffer(s3, body.fotoKey!);
      // Figurinha animada: vale um quadro do meio (o primeiro costuma ser a
      // entrada da animação, ainda sem a pose). O resultado é uma figurinha parada.
      const { pages = 1 } = await sharp(arquivo, { animated: true }).metadata();
      const quadro = await sharp(arquivo, { page: Math.floor(pages / 2) })
        .png()
        .toBuffer();
      inteira = await figurinhaTemFundo(quadro);
      const original = await sharp(quadro)
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize(1024, 1024, { fit: "inside" })
        .jpeg({ quality: 92 })
        .toBuffer();
      // Pessoas marcadas: cada uma vira o personagem escolhido para ela
      // (IMAGE 2, 3…; a mesma imagem entra uma vez só). Sem marcar ninguém,
      // a pessoa principal vira o personagem.
      const unicas = [...new Set(marcadas.map((p) => p.imageKey))];
      const descricoes = marcadas.length
        ? await descreverPessoasNaFoto(original, marcadas)
        : [];
      const alvos = marcadas.length
        ? marcadas.map((p, i) => ({
            ...descricoes[i],
            imagem: 2 + unicas.indexOf(p.imageKey),
          }))
        : [{ imagem: 2 }];
      const personagens = marcadas.length
        ? await Promise.all(
            unicas.map(async (k) =>
              shrinkReferencia(await getObjectBuffer(s3, k)),
            ),
          )
        : [personagem];
      gerada = await generateImage({
        prompt:
          promptTrocaImagem({ alvos, roupa: body.roupa }) +
          (inteira ? REGRAS_DA_FIGURINHA_INTEIRA : REGRAS_DA_FIGURINHA_TROCADA),
        referencias: [
          { mimeType: "image/jpeg", data: original.toString("base64") },
          ...personagens,
        ],
        aspectRatio: "1:1",
        imageSize: "1K",
        qualidade: "padrao",
      });
    }

    const webp = inteira
      ? await montarFigurinhaInteira(gerada)
      : await montarFigurinha(await recortarFigura(getFal(), gerada));
    const key = newKey(userId, "generated", "image/webp");
    await putObject(s3, key, webp, "image/webp");
    await somarArmazenamento(userId, webp.length);
    return NextResponse.json({ key, size: webp.length });
  } catch (e) {
    await estornarSeHouver(cobranca);
    if (e instanceof ImageConfigError)
      return NextResponse.json(
        { error: e.message, code: "CONFIG_MISSING" },
        { status: 500 },
      );
    if (e instanceof ImageBlockedError || e instanceof ImageProviderError)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    console.error("[figurinhas]", e);
    return NextResponse.json(
      { error: "Não consegui montar a figurinha. Tente de novo.", code: "UNKNOWN" },
      { status: 500 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}

/**
 * O clique foi feito na figurinha; o vídeo enviado ao motor é ela encaixada
 * num quadrado (com sobra branca dos lados se não for quadrada). Leva o ponto
 * de um para o outro.
 */
function noQuadrado(
  p: { x: number; y: number },
  largura: number,
  altura: number,
): { x: number; y: number } {
  const maior = Math.max(largura, altura);
  return {
    x: 0.5 + ((p.x - 0.5) * largura) / maior,
    y: 0.5 + ((p.y - 0.5) * altura) / maior,
  };
}

/**
 * Troca o personagem de uma figurinha animada: ela vira um MP4 curto, entra
 * na troca de pessoa em vídeo (a mesma rota da tela de vídeos, com as mesmas
 * regras de plano e créditos) e o job é marcado para voltar como figurinha.
 */
async function trocarAnimada(
  req: Request,
  o: {
    userId: string;
    s3: S3Client;
    arquivo: Buffer;
    body: { characterId: string; imageKey: string };
    /** Pessoas marcadas no primeiro quadro (vazio: a pessoa principal). */
    marcadas: Array<{ x: number; y: number; imageKey: string }>;
  },
): Promise<Response> {
  const pool = getPool();
  if (!pool)
    return NextResponse.json(
      { error: "Banco não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  try {
    const { videoKey, segundos } = await comPastaTemporaria(async (dir) => {
      const { video, segundos } = await figurinhaParaVideo(o.arquivo, dir);
      const videoKey = newKey(o.userId, "videos", "video/mp4");
      await somarArmazenamento(
        o.userId,
        await uploadFromFile(o.s3, videoKey, video, "video/mp4"),
      );
      return { videoKey, segundos };
    });
    const { width: largura = 1, height: altura = 1 } = await sharp(
      o.arquivo,
    ).metadata();
    const res = await substituirPost(
      new Request(new URL(req.url).origin + "/api/videos/substituir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: o.body.characterId,
          videoKey,
          // Marcadas no primeiro quadro da animação (instante 0 do vídeo).
          ...(o.marcadas.length
            ? {
                pessoas: o.marcadas.map((p) => ({
                  ...p,
                  ...noQuadrado(p, largura, altura),
                  t: 0,
                })),
              }
            : { imageKey: o.body.imageKey }),
          motor: "kling",
          // Figurinha tem 512px: a qualidade mais barata já passa disso.
          qualidade: "standard",
          // O resultado vai para as figurinhas, não para a lista de vídeos.
          registrar: false,
        }),
      }),
    );
    const dados = (await res.json().catch(() => ({}))) as {
      jobId?: string;
      creditos?: number;
      error?: string;
      code?: string;
    };
    if (!res.ok || !dados.jobId)
      return NextResponse.json(
        {
          error: dados.error ?? "Não consegui iniciar a troca da figurinha.",
          code: dados.code ?? "UNKNOWN",
        },
        { status: res.status >= 400 ? res.status : 500 },
      );
    await pool.query(
      "update video_jobs set input = jsonb_set(input, '{figurinha}', $2::jsonb) where id = $1 and user_id = $3",
      [dados.jobId, JSON.stringify({ segundos }), o.userId],
    );
    return NextResponse.json({
      jobId: dados.jobId,
      animada: true,
      creditos: dados.creditos,
    });
  } catch (e) {
    console.error("[figurinhas] animada:", e);
    return NextResponse.json(
      { error: "Não consegui preparar a figurinha animada.", code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
