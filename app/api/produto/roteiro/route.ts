import { NextResponse } from "next/server";
import { z } from "zod";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import {
  AIConfigError,
  AIParseError,
  AIProviderError,
} from "@/lib/ai/anthropic";
import { idiomaDoPedido } from "@/lib/ai/idioma";
import { askJson } from "@/lib/ai/parse";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { shrinkReferencia } from "@/lib/ai/gemini";
import { getUserId } from "@/lib/auth/server";
import { getObjectBuffer, getS3, ownsKey } from "@/lib/storage/s3";
import {
  cobrarOuResponder,
  creditosAtivos,
  estornarSeHouver,
} from "@/lib/creditos";
import { CREDITOS_TEXTO } from "@/lib/planos";
import {
  CENA_MAX_CARACTERES,
  MAX_FOTOS_PRODUTO,
  cenasDoProduto,
  DURACOES_PRODUTO,
  MODELOS_FALADO_PRODUTO,
  MODELOS_MUDO_PRODUTO,
  pedidoRoteiroProduto,
  PRODUTO_MAX_CARACTERES,
  sistemaRoteiroProduto,
} from "@/lib/produto";
import { FALA_MAX_CARACTERES } from "@/lib/video/precos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  produto: z
    .string()
    .trim()
    .min(2, "Diga qual é o produto.")
    .max(PRODUTO_MAX_CARACTERES),
  cenario: z.string().trim().max(400).default(""),
  detalhes: z.string().trim().max(1000).default(""),
  /** O que a pessoa fala. Vazio no modo com fala: a IA escreve. */
  falas: z.string().trim().max(FALA_MAX_CARACTERES).default(""),
  modo: z.enum(["falado", "mudo"]),
  modelo: z.string(),
  duracao: z.number().int(),
  /** Fotos que a IA olha para montar as cenas: a pessoa e o produto. */
  imageKey: z.string().min(1).optional(),
  produtoKeys: z.array(z.string().min(1)).max(MAX_FOTOS_PRODUTO).default([]),
});

const RespostaSchema = z.object({
  cenas: z
    .array(
      z.object({
        cena: z.string().min(3),
        fala: z.string().optional(),
      }),
    )
    .min(1),
});

/**
 * POST — monta as cenas do vídeo de produto (Claude): o que se vê em cada uma
 * e, com fala, o que a pessoa diz (as falas escritas, divididas entre as
 * cenas, ou escritas pela IA). A tela mostra para editar antes de gerar.
 */
export async function POST(req: Request) {
  const bloqueio = await liberadoOuResponder("video_produto");
  if (bloqueio) return bloqueio;
  const gate = await allow(readIp(req));
  if (!gate.ok)
    return NextResponse.json(
      {
        error: `Muitas chamadas seguidas. Tente de novo em ${gate.retryAfter}s.`,
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;
  const modelos: readonly string[] =
    body.modo === "falado" ? MODELOS_FALADO_PRODUTO : MODELOS_MUDO_PRODUTO;
  if (
    !modelos.includes(body.modelo) ||
    !(DURACOES_PRODUTO as readonly number[]).includes(body.duracao)
  )
    return NextResponse.json(
      { error: "Modelo ou duração inválidos.", code: "BAD_INPUT" },
      { status: 400 },
    );

  const userId = await getUserId();
  if (creditosAtivos() && !userId)
    return NextResponse.json(
      { error: "Entre na sua conta para usar a IA.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_TEXTO.escrever,
    "texto",
    "roteiro-produto",
  );
  if (cobrado instanceof NextResponse) return cobrado;

  const segundos = cenasDoProduto(body.modo, body.modelo, body.duracao);
  const limpar = (t: string) => t.trim().replace(/\s+/g, " ");
  // A IA olha as fotos (a pessoa e o produto) para descrever o produto como ele
  // é: só pelo nome, ela inventava cores. Melhor esforço: sem as fotos, segue sem.
  const s3 = getS3();
  const keys = [body.imageKey, ...body.produtoKeys].filter(
    (k): k is string => !!k && !!userId && ownsKey(userId, k),
  );
  const imagens = s3
    ? await Promise.all(
        keys.map(async (k) => {
          const r = await shrinkReferencia(await getObjectBuffer(s3, k));
          return { mediaType: "image/jpeg" as const, data: r.data };
        }),
      ).catch((e) => {
        console.warn("[produto/roteiro] fotos:", (e as Error).message);
        return [];
      })
    : [];
  try {
    const r = await askJson({
      system: sistemaRoteiroProduto({
        modo: body.modo,
        segundos,
        temFalas: !!body.falas,
      }),
      user: pedidoRoteiroProduto(body),
      schema: RespostaSchema,
      maxTokens: 3000,
      idioma: idiomaDoPedido(req),
      imagens,
    });
    // Sempre o número de cenas do plano: a tela e a geração contam com ele.
    const cenas = segundos.map((_, i) => {
      const c = r.cenas[Math.min(i, r.cenas.length - 1)];
      return {
        cena: limpar(c.cena).slice(0, CENA_MAX_CARACTERES),
        ...(body.modo === "falado" ? { fala: limpar(c.fala ?? "") } : {}),
      };
    });
    return NextResponse.json({ cenas, segundos });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof AIConfigError)
      return NextResponse.json(
        {
          error: "Chave da Anthropic não configurada no servidor.",
          code: "CONFIG_MISSING",
        },
        { status: 500 },
      );
    if (e instanceof AIProviderError || e instanceof AIParseError)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    console.error("[produto/roteiro]", e);
    return NextResponse.json(
      { error: "Falha ao montar as cenas.", code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
