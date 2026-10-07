import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import {
  cobrarOuResponder,
  creditosAtivos,
  estornarSeHouver,
} from "@/lib/creditos";
import { CREDITOS_TEXTO } from "@/lib/planos";
import {
  AIConfigError,
  AIParseError,
  AIProviderError,
  askClaude,
} from "@/lib/ai/anthropic";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { hydrate } from "@/lib/defaults";
import {
  pedidoEscrita,
  PLATAFORMAS,
  separarOpcoes,
  TIPOS_ESCRITA,
} from "@/lib/prompts/escrever";
import { promptSistema } from "@/lib/prompts/sistema";
import type { Character } from "@/lib/types";
import { idiomaDoPedido } from "@/lib/ai/idioma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    character: z.unknown(),
    tipo: z.enum(TIPOS_ESCRITA),
    plataforma: z.enum(PLATAFORMAS).default("instagram"),
    tema: z.string().trim().max(1500).default(""),
    comentario: z.string().trim().max(1000).optional(),
  })
  .refine(
    (b) =>
      b.tipo === "resposta"
        ? !!b.comentario && b.comentario.length >= 2
        : b.tema.length >= 3,
    {
      message: "Escreva o tema (ou cole o comentário a responder).",
    },
  );

/**
 * POST — escreve como o personagem: legenda, roteiro de vídeo curto ou
 * respostas a um comentário. A ficha vira o system prompt (Prompt de sistema).
 */
export async function POST(req: Request) {
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
    `escrever-${body.tipo}`,
  );
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const character = hydrate(body.character as Character);
    const texto = await askClaude({
      idioma: idiomaDoPedido(req),
      system: [
        promptSistema(character),
        "",
        "Você está escrevendo conteúdo para as suas redes. Escreva em português do Brasil, sempre como você mesmo (primeira pessoa), nunca como assistente.",
      ].join("\n"),
      user: pedidoEscrita(body),
      maxTokens: 2048,
    });
    return NextResponse.json({
      texto,
      opcoes: body.tipo === "roteiro" ? [texto] : separarOpcoes(texto),
    });
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
    return NextResponse.json(
      { error: (e as Error).message, code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
