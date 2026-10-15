import { NextResponse } from "next/server";
import { z } from "zod";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import {
  AIConfigError,
  AIParseError,
  AIProviderError,
} from "@/lib/ai/anthropic";
import { askJson } from "@/lib/ai/parse";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { getUserId } from "@/lib/auth/server";
import { CENA_MAX_CARACTERES, MAX_CENAS_MUDAS_PRODUTO } from "@/lib/produto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  textos: z.array(z.string().trim().min(1).max(CENA_MAX_CARACTERES)).min(1).max(MAX_CENAS_MUDAS_PRODUTO),
});

const RespostaSchema = z.object({ traducoes: z.array(z.string()) });

const SISTEMA = [
  "You translate short video-scene descriptions from English into natural Brazilian Portuguese (pt-BR), for a reader who only wants to understand them.",
  'Keep the meaning, the order and the camera terms (translate them too: "medium shot" → "plano médio", "push-in" → "aproximação"). Do not add or remove anything.',
  'Answer with JSON only: {"traducoes": ["<translation of item 1>", "<translation of item 2>", ...]} — one translation per item, in the same order.',
].join("\n");

/**
 * POST — tradução para o português das cenas do vídeo de produto, só para
 * leitura na tela (o que vai para o modelo continua em inglês). Não cobra
 * créditos: são poucas frases (fração de centavo); o limite por minuto segura abuso.
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
  if (!(await getUserId()))
    return NextResponse.json(
      { error: "Entre na sua conta para usar a IA.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const { textos } = parsed.data;

  try {
    const r = await askJson({
      system: SISTEMA,
      user: JSON.stringify(textos),
      schema: RespostaSchema,
      maxTokens: 2500,
    });
    return NextResponse.json({ traducoes: textos.map((_, i) => r.traducoes[i]?.trim() ?? "") });
  } catch (e) {
    if (e instanceof AIConfigError)
      return NextResponse.json(
        { error: "Chave da Anthropic não configurada no servidor.", code: "CONFIG_MISSING" },
        { status: 500 },
      );
    if (e instanceof AIProviderError || e instanceof AIParseError)
      return NextResponse.json({ error: e.message, code: "PROVIDER_ERROR" }, { status: 502 });
    console.error("[produto/traduzir]", e);
    return NextResponse.json({ error: "Falha ao traduzir.", code: "UNKNOWN" }, { status: 500 });
  }
}
