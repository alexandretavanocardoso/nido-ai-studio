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
import { checarConsistenciaPrompt } from "@/lib/ai/prompts";
import { checarRespostaSchema } from "@/lib/ai/schema";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { stripMetadata } from "@/lib/ai/strip";
import { idiomaDoPedido } from "@/lib/ai/idioma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ character: z.unknown() });

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
  } catch {
    return NextResponse.json(
      { error: "Corpo inválido.", code: "BAD_INPUT" },
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
    CREDITOS_TEXTO.checarConsistencia,
    "texto",
    "checar-consistencia",
  );
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const ficha = JSON.stringify(stripMetadata(body.character), null, 2);
    const user = await checarConsistenciaPrompt(ficha);
    const data = await askJson({
      idioma: idiomaDoPedido(req),
      system:
        "Você é um editor crítico. Responda apenas com JSON {alertas: [...]}, sem Markdown.",
      user,
      schema: checarRespostaSchema,
      maxTokens: 2048,
    });
    return NextResponse.json({ alertas: data.alertas });
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
