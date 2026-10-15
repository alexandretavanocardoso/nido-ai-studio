import { NextResponse } from "next/server";
import { z } from "zod";
import { askClaude, AIConfigError } from "@/lib/ai/anthropic";
import { MODELO_LIVE, SEM_RACIOCINIO } from "@/lib/live/modelo";
import { carregarLive } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";
import { carregarPersonagem } from "@/lib/personagens";
import {
  INSTRUCAO_LIVE,
  pedidoEspontaneo,
  pedidoLive,
  promptPersonaAvulsa,
  proximoTipo,
  TIPOS_FALA,
} from "@/lib/prompts/live";
import { promptSistema } from "@/lib/prompts/sistema";
import { mensagemDeErroVoz } from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Voz ao vivo: o modelo de menor latência da ElevenLabs. */
const VOZ_LIVE = process.env.LIVE_VOICE_MODEL?.trim() || "eleven_flash_v2_5";

const BodySchema = z
  .object({
    /**
     * responder: a IA responde a mensagem como o personagem · falar: fala o
     * texto como está · espontanea: a IA fala por conta própria (chat parado).
     */
    modo: z.enum(["responder", "falar", "espontanea"]),
    texto: z.string().trim().max(600).default(""),
    autor: z.string().trim().max(60).optional(),
    /** Assunto da live (modo espontâneo). */
    tema: z.string().trim().max(300).optional(),
    /** Imagem da tela agora (o jogo), JPEG em base64: a IA comenta o que vê. */
    tela: z
      .string()
      .max(700_000)
      .regex(/^[A-Za-z0-9+/=]+$/)
      .optional(),
    /** Últimas trocas e falas da live, para ter contexto e não se repetir. */
    anteriores: z
      .array(
        z.object({
          autor: z.string().trim().max(60).optional(),
          texto: z.string().trim().max(600),
          resposta: z.string().trim().max(600),
          espontanea: z.boolean().optional(),
          tipo: z.enum(TIPOS_FALA).optional(),
        }),
      )
      .max(8)
      .default([]),
  })
  .refine((b) => b.modo === "espontanea" || b.texto.length > 0, {
    message: "Escreva o que falar.",
  });

/**
 * POST — a próxima fala da live, já em áudio: PCM 16 bits, mono, 16 kHz, em
 * streaming (o navegador repassa ao avatar enquanto chega). O texto falado vai
 * no cabeçalho `x-live-texto`. O custo está no preço por minuto da live.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const { pool, el, userId } = ctx;
  const live = await carregarLive(pool, userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  // Só a live com avatar fala pela IA (na sombra, quem fala é a pessoa).
  const voz = live.voice_id;
  if (live.status !== "no_ar" || !voz)
    return NextResponse.json(
      { error: "A live não está no ar.", code: "STATUS" },
      { status: 409 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;

  let texto = body.texto;
  // Fala espontânea: o tipo (assunto, piada, pergunta…) é sorteado aqui, sem repetir o último.
  const comTela = !!body.tela;
  const tipo =
    body.modo === "espontanea" ? proximoTipo(body.anteriores, Math.random(), comTela) : null;
  if (body.modo !== "falar") {
    // Com personagem: a ficha dele. Sem personagem: o que a pessoa escreveu.
    const personagem = live.character_id
      ? await carregarPersonagem(userId, live.character_id)
      : null;
    const quem = personagem
      ? promptSistema(personagem)
      : live.persona
        ? promptPersonaAvulsa(live.persona)
        : null;
    if (!quem)
      return NextResponse.json(
        { error: "Personagem não encontrado." },
        { status: 404 },
      );
    try {
      texto = (
        await askClaude({
          model: MODELO_LIVE,
          system: `${quem}\n\n${INSTRUCAO_LIVE}`,
          user:
            body.modo === "espontanea"
              ? pedidoEspontaneo({ tipo: tipo!, tema: body.tema, anteriores: body.anteriores, comTela })
              : pedidoLive({ autor: body.autor, texto: body.texto }, body.anteriores, comTela),
          imagens: body.tela ? [{ mediaType: "image/jpeg", data: body.tela }] : undefined,
          // Folga para modelos que ainda raciocinam um pouco; a instrução já pede no máximo ~40 palavras.
          maxTokens: 1024,
          ...SEM_RACIOCINIO,
          // A ficha do personagem é a mesma em todas as respostas da live.
          cacheSystem: true,
        })
      ).trim();
    } catch (e) {
      console.error("[live] resposta", e);
      return NextResponse.json(
        {
          error:
            e instanceof AIConfigError
              ? "Chave da Anthropic não configurada no servidor."
              : "Não consegui escrever a resposta. Tente de novo.",
          code: "PROVIDER_ERROR",
        },
        { status: 502 },
      );
    }
    if (!texto)
      return NextResponse.json(
        { error: "Não consegui escrever a resposta. Tente de novo." },
        { status: 502 },
      );
  }

  try {
    const audio = await el.textToSpeech.stream(voz, {
      text: texto,
      modelId: VOZ_LIVE,
      outputFormat: "pcm_16000",
    });
    return new Response(audio, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "x-live-texto": encodeURIComponent(texto),
        ...(tipo ? { "x-live-tipo": tipo } : {}),
      },
    });
  } catch (e) {
    console.error("[live] voz", e);
    return NextResponse.json(
      { error: mensagemDeErroVoz(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
