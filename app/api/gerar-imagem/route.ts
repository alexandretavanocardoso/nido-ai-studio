import { NextResponse } from "next/server";
import { missaoCumprida } from "@/lib/pontos-server";
import { z } from "zod";
import {
  generateImage,
  ImageBlockedError,
  ImageConfigError,
  ImageProviderError,
  shrinkReferencia,
} from "@/lib/ai/gemini";
import { allow, hit, readIp } from "@/lib/ai/rate-limit";
import { recursosDisponiveis } from "@/lib/recursos";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import {
  cobrarOuResponder,
  creditosAtivos,
  estornarSeHouver,
  planoAtual,
  type Cobranca,
} from "@/lib/creditos";
import { bloqueioImagem, creditosImagem } from "@/lib/planos";
import { personaPronta } from "@/lib/persona/server";
import { getUserId } from "@/lib/auth/server";
import { hydrate } from "@/lib/defaults";
import { buildImagePrompt } from "@/lib/prompts/gerar-imagem";
import sharp from "sharp";
import { blocoTexto, gerarImagemFal } from "@/lib/ai/fal-imagem";
import {
  gerarImagemOpenAI,
  getOpenAIKey,
  OpenAIImagemError,
} from "@/lib/ai/openai-imagem";
import { MODELOS_IMAGEM, MODELOS_IMAGEM_IDS } from "@/lib/ai/modelos-imagem";
import { getFal, mensagemDeErro } from "@/lib/fal";
import {
  getObjectBuffer,
  getS3,
  newKey,
  ownsKey,
  presignGet,
  putObject,
} from "@/lib/storage/s3";
import type { Character } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Geração leva de ~10s a ~1min (Nano Banana Pro 2K, Seedream 4K, GPT Image alta). */
export const maxDuration = 120;

const PER_MINUTE = Number(process.env.IMAGE_RATE_LIMIT_PER_MINUTE ?? 5);
/** Cota diária de imagens por conta (ou IP sem login). Janela de 24h, em UTC. */
const PER_DAY = Number(process.env.IMAGE_DAILY_LIMIT ?? 30);

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

const BodySchema = z.object({
  character: z.looseObject({ id: z.string() }),
  tipo: z.enum(["referencia", "retrato"]),
  qualidade: z.enum(["padrao", "pro"]).default("padrao"),
  /** Modelo de imagem (ver lib/ai/modelos-imagem.ts). Nano Banana = Gemini; GPT Image = OpenAI (ou fal.ai sem a chave); os outros = fal.ai. */
  modelo: z.enum(MODELOS_IMAGEM_IDS).default("nano-banana"),
  /** Só GPT Image: texto que deve aparecer escrito na imagem. */
  textoNaImagem: z.string().trim().max(200).optional(),
  /**
   * Referências: base64 já reduzido no cliente (modo anônimo) ou a key do
   * arquivo no S3 (modo logado) — aí o servidor baixa e reduz.
   */
  referencias: z
    .array(
      z.union([
        z
          .string()
          .regex(
            DATA_URL,
            "Referência precisa ser uma imagem JPEG, PNG ou WebP.",
          ),
        z.object({ key: z.string().min(1) }),
      ]),
    )
    .max(4, "No máximo 4 imagens de referência."),
});

/**
 * POST — gera a imagem do personagem (card de referência ou retrato) com
 * o prompt neutro montado a partir da ficha, mais as referências anexadas.
 * Com login ligado, exige conta (cada imagem custa dinheiro). Com S3, a
 * imagem gerada já fica salva no bucket e a resposta traz a key.
 */
export async function POST(req: Request) {
  let userId: string | null = null;
  let key = `img:${readIp(req)}`;
  if (recursosDisponiveis().login) {
    userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        {
          error: "Entre na sua conta para gerar imagens.",
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      );
    }
    key = `img:${userId}`;
  }

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

  // Persona treinada não precisa do card: o rosto vem do treino.
  if (
    body.tipo === "retrato" &&
    body.modelo !== "persona" &&
    body.referencias.length === 0
  ) {
    return NextResponse.json(
      {
        error: "Para o retrato, selecione a imagem do card de referência.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  }

  // GPT Image vai direto na OpenAI quando há OPENAI_API_KEY; sem ela, pelo fal.
  const usaOpenAI = body.modelo === "gpt-image" && !!getOpenAIKey();
  const usaFal = !usaOpenAI && MODELOS_IMAGEM[body.modelo].provedor === "fal";
  const fal = usaFal ? getFal() : null;
  if (usaFal && !fal) {
    return NextResponse.json(
      {
        error: "Modelo indisponível: FAL_KEY não configurada no servidor.",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  }

  // Cota só depois de validar: pedido inválido não gasta imagem.
  const gate = await allow(key, PER_MINUTE);
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: `Muitas imagens seguidas. Tente de novo em ${gate.retryAfter}s.`,
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }
  // Com créditos, o saldo é o limite. Sem login (modo dev), vale a cota diária fixa.
  if (!creditosAtivos()) {
    const cota = await hit(key, PER_DAY, 86_400);
    if (!cota.ok) {
      const horas = Math.ceil(cota.retryAfter / 3600);
      return NextResponse.json(
        {
          error: `Você atingiu o limite de ${PER_DAY} imagens por dia. Libera em ~${horas}h.`,
          code: "QUOTA_EXCEEDED",
        },
        { status: 429, headers: { "Retry-After": String(cota.retryAfter) } },
      );
    }
  }

  const bloqueio = bloqueioImagem(
    await planoAtual(userId),
    body.modelo,
    body.qualidade,
  );
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );

  const s3 = userId ? getS3() : null;
  for (const r of body.referencias) {
    if (typeof r !== "string" && (!s3 || !ownsKey(userId!, r.key)))
      return NextResponse.json(
        { error: "Referência de imagem inválida.", code: "BAD_INPUT" },
        { status: 400 },
      );
  }

  const character = hydrate(body.character as unknown as Character);
  let prompt = buildImagePrompt(character, "neutro", body.tipo);
  // Com imagem-base, o personagem já existe: a IA só reposiciona, não redesenha
  // (sem isto, cada geração inventava outro bigode, chapéu, roupa…).
  if (body.tipo === "referencia" && body.referencias.length > 0)
    prompt = `${IDENTIDADE_DA_BASE}\n\n${prompt}`;
  // "Imagem com texto" (GPT Image) é a única que pode escrever na imagem.
  if (MODELOS_IMAGEM[body.modelo].aceitaTexto && body.textoNaImagem)
    prompt += blocoTexto(body.textoNaImagem);
  else prompt += `\n\n${SEM_TEXTO}`;

  // Limites do plano: espaço (a imagem vai pro S3) e gerações ao mesmo tempo.
  if (s3) {
    const semEspaco = await armazenamentoOuResponder(userId);
    if (semEspaco) return semEspaco;
  }
  const vaga = await vagaOuResponder(userId, "imagem");
  if (vaga instanceof NextResponse) return vaga;

  const cobrado = await cobrarOuResponder(
    userId,
    creditosImagem(body.modelo, body.qualidade),
    "imagem",
    body.modelo,
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }
  const cobranca: Cobranca | null = cobrado.cobranca;

  try {
    let jpeg: Buffer;
    if (usaOpenAI) {
      // A OpenAI recebe as referências como arquivo (não por URL, como o fal).
      const referencias = await Promise.all(
        body.referencias.map(async (r) => {
          const ref =
            typeof r === "string"
              ? { mimeType: r.match(DATA_URL)![1], data: r.match(DATA_URL)![2] }
              : await shrinkReferencia(await getObjectBuffer(s3!, r.key));
          return {
            mimeType: ref.mimeType,
            data: Buffer.from(ref.data, "base64"),
          };
        }),
      );
      jpeg = await sharp(
        await gerarImagemOpenAI({
          tipo: body.tipo,
          prompt,
          referencias,
          qualidade: body.qualidade,
        }),
      )
        .jpeg({ quality: 90 })
        .toBuffer();
    } else if (fal) {
      // fal baixa as referências por URL: S3 → URL pré-assinada; base64 → upload no storage do fal.
      const imageUrls = await Promise.all(
        body.referencias.map(async (r) => {
          if (typeof r !== "string") return presignGet(s3!, r.key, 3600);
          const [, mimeType, data] = r.match(DATA_URL)!;
          return fal.storage.upload(
            new Blob([Buffer.from(data, "base64")], { type: mimeType }),
          );
        }),
      );
      // Persona treinada: o LoRA do personagem vem do servidor (nunca do navegador).
      let persona:
        | { loraUrl: string; gatilho: string; base: "flux1" | "flux2" }
        | undefined;
      if (body.modelo === "persona") {
        const p =
          userId && s3 ? await personaPronta(userId, character.id) : null;
        if (!p) throw new SemPersonaError();
        persona = {
          loraUrl: await presignGet(s3!, p.key, 3600),
          gatilho: p.gatilho,
          base: p.alvo === "flux1" ? "flux1" : "flux2",
        };
      }
      const bruto = await gerarImagemFal(fal, {
        modelo: body.modelo as Exclude<typeof body.modelo, "nano-banana">,
        tipo: body.tipo,
        prompt,
        imageUrls,
        qualidade: body.qualidade,
        persona,
      });
      // Sem S3 a imagem volta no JSON: limita a 2048px pra caber nos 4,5 MB da Vercel.
      const img = sharp(bruto).rotate();
      jpeg = await (
        s3
          ? img
          : img.resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
      )
        .jpeg({ quality: 90 })
        .toBuffer();
    } else {
      const referencias = await Promise.all(
        body.referencias.map(async (r) => {
          if (typeof r === "string") {
            const [, mimeType, data] = r.match(DATA_URL)!;
            return { mimeType, data };
          }
          return shrinkReferencia(await getObjectBuffer(s3!, r.key));
        }),
      );
      jpeg = await generateImage({
        prompt,
        referencias,
        aspectRatio: body.tipo === "retrato" ? "2:3" : "16:9",
        imageSize: body.qualidade === "pro" ? "2K" : "1K",
        qualidade: body.qualidade,
      });
    }

    await missaoCumprida(userId, "primeira_imagem");
    if (s3) {
      const fileKey = newKey(userId!, "generated", "image/jpeg");
      await putObject(s3, fileKey, jpeg, "image/jpeg");
      await somarArmazenamento(userId, jpeg.length);
      return NextResponse.json({ key: fileKey, size: jpeg.length });
    }
    return NextResponse.json({
      image: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      size: jpeg.length,
    });
  } catch (e) {
    await estornarSeHouver(cobranca);
    if (e instanceof SemPersonaError)
      return NextResponse.json(
        {
          error:
            "Este personagem ainda não tem persona treinada. Treine na etapa Visual.",
          code: "BAD_INPUT",
        },
        { status: 400 },
      );
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
        { error: e.message, code: "BLOCKED" },
        { status: 422 },
      );
    if (e instanceof OpenAIImagemError)
      return NextResponse.json(
        { error: e.message, code: e.bloqueado ? "BLOCKED" : "PROVIDER_ERROR" },
        { status: e.bloqueado ? 422 : 502 },
      );
    if (e instanceof ImageProviderError)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    console.error("[gerar-imagem]", e);
    if (usaFal)
      return NextResponse.json(
        { error: mensagemDeErro(e), code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    return NextResponse.json(
      { error: (e as Error).message, code: "UNKNOWN" },
      { status: 500 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}

/** Vai antes do prompt quando há imagem-base do personagem. */
const IDENTIDADE_DA_BASE = `IDENTITY — MOST IMPORTANT RULE
The attached image(s) show THIS EXACT CHARACTER, already designed. Reproduce the very same person: same face and facial structure, same hair and facial hair, same body, same skin, same outfit, same accessories, same colours, same props, same art style. Do NOT invent, add, remove or redesign anything — ignore any instruction below about inventing a signature trait; the trait is whatever the attached image already shows. Only re-pose and re-frame the character into the layout described below.`;

/** Vai no fim de todo prompt: o Nano Banana tende a "escrever" rótulos e códigos do prompt na imagem. */
const SEM_TEXTO = `NO TEXT: the image must contain absolutely no written text — no titles, labels, view names, numbers, captions, colour codes, watermarks or annotations anywhere.`;

class SemPersonaError extends Error {}
