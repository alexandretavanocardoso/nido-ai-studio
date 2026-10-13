import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import {
  generateImage,
  ImageBlockedError,
  ImageConfigError,
  ImageProviderError,
  proporcaoMaisProxima,
  shrinkReferencia,
} from "@/lib/ai/gemini";
import { allow } from "@/lib/ai/rate-limit";
import { recursosDisponiveis } from "@/lib/recursos";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import {
  cobrarOuResponder,
  estornarSeHouver,
  planoAtual,
  type Cobranca,
} from "@/lib/creditos";
import { bloqueioImagem, creditosImagem } from "@/lib/planos";
import { getUserId } from "@/lib/auth/server";
import {
  getObjectBuffer,
  getS3,
  newKey,
  ownsKey,
  putObject,
} from "@/lib/storage/s3";
import { descreverPessoasNaFoto } from "@/lib/video/pessoas";
import {
  promptCorrigirPele,
  promptTrocaImagem,
  type AlvoImagem,
} from "@/lib/prompts/trocar-imagem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Descrição das pessoas (~5s) + geração (até ~1 min). */
export const maxDuration = 150;

const PER_MINUTE = Number(process.env.IMAGE_RATE_LIMIT_PER_MINUTE ?? 5);

const BodySchema = z
  .object({
    characterId: z.string().min(1),
    /** Foto original (já enviada ao S3). */
    fotoKey: z.string().min(1),
    qualidade: z.enum(["padrao", "pro"]).default("padrao"),
    /** De onde vem a roupa de quem é trocado: da foto (padrão) ou do personagem. */
    roupa: z.enum(["foto", "personagem"]).default("foto"),
    /** Sem pessoas marcadas: troca a pessoa principal por esta imagem. */
    imageKey: z.string().min(1).optional(),
    pessoas: z
      .array(
        z.object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          imageKey: z.string().min(1),
        }),
      )
      .max(3, "No máximo 3 pessoas por foto.")
      .optional(),
    /** fotoKey é o resultado de uma troca: só iguala a pele das mãos à do rosto. */
    corrigir: z.boolean().default(false),
  })
  .refine((b) => b.corrigir || b.imageKey || b.pessoas?.length, {
    message: "Escolha a imagem do personagem.",
  });

/**
 * POST — troca a(s) pessoa(s) de uma foto pelo(s) influencer(s), mantendo
 * cenário, luz e enquadramento. Devolve a key da imagem nova no S3.
 */
export async function POST(req: Request) {
  const rec = recursosDisponiveis();
  if (!rec.login || !rec.armazenamento)
    return NextResponse.json(
      {
        error:
          "A troca de pessoa em foto precisa de login e armazenamento configurados.",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      {
        error: "Entre na sua conta para trocar pessoas.",
        code: "UNAUTHORIZED",
      },
      { status: 401 },
    );

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError ? e.issues[0].message : "Corpo inválido.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  }

  const s3 = getS3()!;
  const marcadas = body.corrigir ? [] : (body.pessoas ?? []);
  const keys = [
    body.fotoKey,
    ...(body.corrigir
      ? []
      : marcadas.length
        ? marcadas.map((p) => p.imageKey)
        : [body.imageKey!]),
  ];
  if (keys.some((k) => !ownsKey(userId, k)))
    return NextResponse.json(
      { error: "Imagem inválida.", code: "BAD_INPUT" },
      { status: 400 },
    );

  if (!rec.gemini)
    return NextResponse.json(
      {
        error: "Nano Banana indisponível: GEMINI_API_KEY não configurada.",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );

  const gate = await allow(`img:${userId}`, PER_MINUTE);
  if (!gate.ok)
    return NextResponse.json(
      {
        error: `Muitas imagens seguidas. Tente de novo em ${gate.retryAfter}s.`,
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );

  const qualidade = body.qualidade;
  const bloqueio = bloqueioImagem(
    await planoAtual(userId),
    "nano-banana",
    qualidade,
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
    creditosImagem("nano-banana", qualidade),
    "imagem",
    body.corrigir ? "corrigir-nano-banana" : "troca-nano-banana",
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }
  const cobranca: Cobranca | null = cobrado.cobranca;

  try {
    const foto = await sharp(await getObjectBuffer(s3, body.fotoKey))
      .rotate()
      .jpeg({ quality: 92 })
      .toBuffer();
    const { width = 1024, height = 1024 } = await sharp(foto).metadata();

    // Uma imagem por influencer (repetidos entram uma vez só): IMAGE 2, 3…
    const unicas = [...new Set(keys.slice(1))];
    const descricoes = marcadas.length
      ? await descreverPessoasNaFoto(foto, marcadas)
      : [];
    const alvos: AlvoImagem[] = marcadas.length
      ? marcadas.map((p, i) => ({
          ...descricoes[i],
          imagem: 2 + unicas.indexOf(p.imageKey),
        }))
      : [{ imagem: 2 }];
    const prompt = body.corrigir
      ? promptCorrigirPele()
      : promptTrocaImagem({ alvos, roupa: body.roupa });

    let jpeg: Buffer;
    {
      // Foto pequena é ampliada até 1024px: menor que a imagem do personagem,
      // o modelo dá mais peso à referência e perde pose e pele da foto.
      const lado = Math.min(2048, Math.max(1024, width, height));
      const original = await sharp(foto)
        .resize(lado, lado, { fit: "inside" })
        .jpeg({ quality: 90 })
        .toBuffer();
      const personagens = await Promise.all(
        unicas.map(async (k) => shrinkReferencia(await getObjectBuffer(s3, k))),
      );
      jpeg = await generateImage({
        prompt,
        referencias: [
          { mimeType: "image/jpeg", data: original.toString("base64") },
          ...personagens,
        ],
        aspectRatio: proporcaoMaisProxima(width, height),
        imageSize: qualidade === "pro" ? "2K" : "1K",
        qualidade,
      });
    }

    const fileKey = newKey(userId, "generated", "image/jpeg");
    await putObject(s3, fileKey, jpeg, "image/jpeg");
    await somarArmazenamento(userId, jpeg.length);
    return NextResponse.json({ key: fileKey, size: jpeg.length });
  } catch (e) {
    await estornarSeHouver(cobranca);
    if (e instanceof ImageConfigError)
      return NextResponse.json(
        {
          error: "Chave do Gemini não configurada no servidor.",
          code: "CONFIG_MISSING",
        },
        { status: 500 },
      );
    if (e instanceof ImageBlockedError)
      return NextResponse.json(
        {
          error: `${e.message} Créditos devolvidos. Tente outra foto ou marque a pessoa de novo.`,
          code: "BLOCKED",
        },
        { status: 422 },
      );
    if (e instanceof ImageProviderError)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    console.error("[imagens/trocar]", e);
    return NextResponse.json(
      {
        error: (e as Error).message,
        code: "PROVIDER_ERROR",
      },
      { status: 502 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}
