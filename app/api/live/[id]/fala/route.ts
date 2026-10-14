import { NextResponse } from "next/server";
import { z } from "zod";
import { askClaude, AIConfigError } from "@/lib/ai/anthropic";
import { carregarLive } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";
import { carregarPersonagem } from "@/lib/personagens";
import { INSTRUCAO_LIVE, pedidoLive, promptPersonaAvulsa } from "@/lib/prompts/live";
import { promptSistema } from "@/lib/prompts/sistema";
import { mensagemDeErroVoz } from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Modelo das respostas ao vivo: rápido, para a fala sair logo. */
const MODELO_LIVE = process.env.LIVE_MODEL?.trim() || "claude-haiku-5-5";
/**
 * Resposta direta, sem raciocínio: na live o que pesa é a fala sair rápido.
 * Cada modelo desliga de um jeito (o Sonnet 5.5 recusa "disabled"; o Opus 5.5
 * não desliga e fica no esforço mínimo).
 */
const SEM_RACIOCINIO: Pick<Parameters<typeof askClaude>[0], "thinking" | "effort"> =
  /sonnet-5-5/.test(MODELO_LIVE)
    ? { thinking: { type: "between_tools" }, effort: "low" }
    : /opus-5-5|fable|mythos/.test(MODELO_LIVE)
      ? { effort: "low" }
      : { thinking: { type: "disabled" }, effort: "low" };
/** Voz ao vivo: o modelo de menor latência da ElevenLabs. */
const VOZ_LIVE = process.env.LIVE_VOICE_MODEL?.trim() || "eleven_flash_v2_5";

const Texto = z.string().trim().min(1).max(600);
const BodySchema = z.object({
  /** responder: a IA responde a mensagem como o personagem · falar: fala o texto como está. */
  modo: z.enum(["responder", "falar"]),
  texto: Texto,
  autor: z.string().trim().max(60).optional(),
  /** Últimas trocas da live, para a resposta ter contexto. */
  anteriores: z
    .array(
      z.object({
        autor: z.string().trim().max(60).optional(),
        texto: Texto,
        resposta: z.string().trim().max(600),
      }),
    )
    .max(6)
    .default([]),
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
  if (live.status !== "no_ar")
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
  if (body.modo === "responder") {
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
          user: pedidoLive(
            { autor: body.autor, texto: body.texto },
            body.anteriores,
          ),
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
    const audio = await el.textToSpeech.stream(live.voice_id, {
      text: texto,
      modelId: VOZ_LIVE,
      outputFormat: "pcm_16000",
    });
    return new Response(audio, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "x-live-texto": encodeURIComponent(texto),
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
