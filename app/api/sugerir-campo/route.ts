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
import { sugerirCampoPrompt } from "@/lib/ai/prompts";
import { sugerirCampoRespostaSchema } from "@/lib/ai/schema";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { stripMetadata } from "@/lib/ai/strip";
import { idiomaDoPedido } from "@/lib/ai/idioma";
import { ehCampoManual } from "@/lib/campos-manuais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  character: z.unknown(),
  fieldId: z.string().min(1),
  fieldDescricao: z.string().min(1),
  instrucao: z.string().optional(),
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

  if (ehCampoManual(body.fieldId))
    return NextResponse.json(
      {
        error:
          "O nome do personagem é escolhido por você — a IA não sugere nome.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );

  // Com créditos ativos, a IA de texto exige conta e cobra por chamada.
  const userId = await getUserId();
  if (creditosAtivos() && !userId)
    return NextResponse.json(
      { error: "Entre na sua conta para usar a IA.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_TEXTO.sugerirCampo,
    "texto",
    "sugerir-campo",
  );
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const ficha = JSON.stringify(stripMetadata(body.character), null, 2);
    const user = await sugerirCampoPrompt({
      ficha,
      fieldId: body.fieldId,
      fieldDescricao: body.fieldDescricao,
      instrucao: body.instrucao,
    });
    const data = await askJson({
      idioma: idiomaDoPedido(req),
      system:
        'Responda APENAS com um objeto JSON {"valor": ...}, sem Markdown, sem texto em volta.',
      user,
      schema: sugerirCampoRespostaSchema,
      maxTokens: 1024,
    });
    return NextResponse.json({ valor: data.valor });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    return handle(e);
  }
}

function handle(e: unknown) {
  if (e instanceof AIConfigError)
    return NextResponse.json(
      {
        error: "Chave da Anthropic não configurada no servidor.",
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
