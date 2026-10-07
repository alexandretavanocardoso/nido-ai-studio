import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import {
  cobrarOuResponder,
  creditosAtivos,
  estornarSeHouver,
} from "@/lib/creditos";
import { CREDITOS_TEXTO } from "@/lib/planos";
import { z } from "zod";
import {
  AIConfigError,
  AIParseError,
  AIProviderError,
} from "@/lib/ai/anthropic";
import { askJson } from "@/lib/ai/parse";
import { regenerarSecaoPrompt } from "@/lib/ai/prompts";
import { expandirRespostaSchema } from "@/lib/ai/schema";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { stripMetadata } from "@/lib/ai/strip";
import { idiomaDoPedido } from "@/lib/ai/idioma";
import { REGRA_NOME } from "@/lib/campos-manuais";
import { sugestoesDaSecao } from "@/lib/ai/secao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  character: z.unknown(),
  stepId: z.enum([
    "identidade",
    "visual",
    "soul",
    "nicho",
    "voz",
    "monetizacao",
  ]),
  stepTitulo: z.string(),
  campos: z.array(z.string()).min(1),
  instrucao: z.string().optional(),
  travados: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const ip = readIp(req);
  const gate = await allow(ip);
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: `Muitas chamadas seguidas. Tente de novo em ${gate.retryAfter}s.`,
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
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

  // Com créditos ativos, a IA de texto exige conta e cobra por chamada.
  const userId = await getUserId();
  if (creditosAtivos() && !userId)
    return NextResponse.json(
      { error: "Entre na sua conta para usar a IA.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_TEXTO.regenerarSecao,
    "texto",
    "regenerar-secao",
  );
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const ficha = JSON.stringify(stripMetadata(body.character), null, 2);
    const user = await regenerarSecaoPrompt({
      ficha,
      stepId: body.stepId,
      stepTitulo: body.stepTitulo,
      // Sempre com o prefixo da etapa ("nicho.principal"): sem ele a IA responde sem a seção.
      campos: body.campos
        .map((c) =>
          c.startsWith(`${body.stepId}.`) ? c : `${body.stepId}.${c}`,
        )
        .join(", "),
      instrucao: body.instrucao,
      travados: body.travados.join(", "),
    });
    const data = await askJson({
      idioma: idiomaDoPedido(req),
      system:
        "Regenere APENAS a seção pedida. Responda com JSON válido no mesmo esquema do fluxo de expansão, mas somente para essa seção. Sem Markdown." +
        " " +
        REGRA_NOME,
      user,
      schema: expandirRespostaSchema,
      maxTokens: 8192,
    });
    const suggestions = sugestoesDaSecao(
      data as Record<string, unknown>,
      body.stepId,
      body.campos,
    );
    return NextResponse.json({ suggestions });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof AIConfigError)
      return NextResponse.json(
        {
          error: "Chave da Anthropic não configurada.",
          code: "CONFIG_MISSING",
        },
        { status: 500 },
      );
    if (e instanceof AIProviderError)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    if (e instanceof AIParseError)
      return NextResponse.json(
        { error: e.message, code: "PARSE_ERROR" },
        { status: 502 },
      );
    return NextResponse.json(
      { error: (e as Error).message, code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
