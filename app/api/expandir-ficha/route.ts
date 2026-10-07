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
import { expandirPrompt } from "@/lib/ai/prompts";
import { expandirRespostaSchema } from "@/lib/ai/schema";
import { extractPontosEmAberto, toSuggestions } from "@/lib/ai/flatten";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { idiomaDoPedido } from "@/lib/ai/idioma";
import { REGRA_NOME } from "@/lib/campos-manuais";
import { campoAceitoDaIA } from "@/lib/campos-ficha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  contexto: z
    .string()
    .min(10, "Escreva pelo menos uma frase sobre o personagem.")
    .max(4000),
  /** Nome escolhido pelo usuário (a IA não inventa nome). */
  nome: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  const ip = readIp(req);
  const gate = await allow(ip);
  if (!gate.ok) {
    return NextResponse.json(
      {
        error: `Muitas gerações seguidas. Tente de novo em ${gate.retryAfter}s.`,
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues[0].message
            : "Corpo da requisição inválido.",
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
    CREDITOS_TEXTO.expandirFicha,
    "texto",
    "expandir-ficha",
  );
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const user =
      (await expandirPrompt(body.contexto)) +
      `\n\n[NOME]\n${REGRA_NOME}${body.nome ? `\nNome definido pelo usuário: ${body.nome}` : ""}`;
    const data = await askJson({
      idioma: idiomaDoPedido(req),
      system:
        "Você é um diretor de criação. Responda SEMPRE com JSON válido no esquema pedido, nada mais.",
      user,
      schema: expandirRespostaSchema,
      // A ficha inteira passa de 8 mil tokens: com menos que isso a resposta saía cortada.
      maxTokens: 16000,
    });
    // Só campos da ficha (a IA às vezes inventa chaves).
    const suggestions = toSuggestions(data).filter((s) =>
      campoAceitoDaIA(s.fieldId),
    );
    const pontosEmAberto = extractPontosEmAberto(data);
    return NextResponse.json({ suggestions, pontosEmAberto });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AIConfigError) {
    return NextResponse.json(
      {
        error:
          "A IA ainda não está configurada neste servidor. Peça pro admin preencher a chave da Anthropic.",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  }
  if (e instanceof AIProviderError) {
    return NextResponse.json(
      { error: e.message, code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
  if (e instanceof AIParseError) {
    return NextResponse.json(
      { error: e.message, code: "PARSE_ERROR" },
      { status: 502 },
    );
  }
  const msg = (e as Error)?.message ?? "Erro inesperado.";
  console.error("[expandir-ficha] erro:", msg);
  return NextResponse.json({ error: msg, code: "UNKNOWN" }, { status: 500 });
}
