import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import OpenAI from "openai";
import { maxTokensMotion, MODELOS_MOTION, type EsforcoMotion, type ModeloMotion } from "./modelos";
import type { ParteMotion } from "./prompt";

/**
 * Chama o modelo escolhido (Claude ou Gemini) em streaming — uma animação
 * longa leva minutos — e devolve o texto e os tokens usados. `aoEscrever`
 * recebe quantos caracteres já saíram, para a tela mostrar o andamento.
 */

export interface RespostaIA {
  texto: string;
  entrada: number;
  saida: number;
  /** Quem respondeu (outro modelo, se o pedido caiu na reserva da Anthropic). */
  modelo: string;
}

/** Erro com mensagem pronta para a tela (o detalhe técnico vai para o log). */
export class ErroIA extends Error {}

const precisa = (nome: string) => {
  const v = process.env[nome]?.trim();
  if (!v) throw new ErroIA(`Falta a variável ${nome} no worker.`);
  return v;
};

export async function escrever(o: {
  modelo: ModeloMotion;
  esforco: EsforcoMotion;
  sistema: string;
  partes: ParteMotion[];
  aoEscrever: (caracteres: number) => void;
}): Promise<RespostaIA> {
  const provedor = MODELOS_MOTION[o.modelo].provedor;
  return provedor === "google" ? escreverGemini(o) : provedor === "openai" ? escreverOpenAI(o) : escreverClaude(o);
}

async function escreverClaude(o: Parameters<typeof escrever>[0]): Promise<RespostaIA> {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = new Anthropic({
    apiKey: precisa("ANTHROPIC_API_KEY"),
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
    timeout: 40 * 60 * 1000,
  });
  // Reserva no servidor: se o modelo recusar (classificadores de segurança), a
  // Anthropic refaz o pedido no modelo recomendado. O Haiku não tem reserva.
  const reserva = o.modelo !== "claude-haiku-5-5";
  try {
    const stream = client.beta.messages.stream({
      model: o.modelo,
      max_tokens: maxTokensMotion(o.esforco),
      thinking: { type: "adaptive" },
      output_config: { effort: o.esforco },
      system: o.sistema,
      messages: [
        {
          role: "user",
          content: o.partes.map((p) =>
            p.tipo === "texto"
              ? { type: "text" as const, text: p.texto }
              : {
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: p.mime, data: p.base64 },
                },
          ),
        },
      ],
      ...(reserva ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    stream.on("text", (_, total) => o.aoEscrever(total.length));
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal")
      throw new ErroIA("O modelo recusou o pedido. Mude o texto do pedido e tente de novo.");
    if (msg.stop_reason === "max_tokens")
      throw new ErroIA("A animação passou do tamanho máximo de resposta. Tente um vídeo mais curto ou um esforço menor.");
    // Se houve reserva, vale só o que veio depois da última troca de modelo.
    const ultimaTroca = msg.content.map((b) => b.type).lastIndexOf("fallback");
    const texto = msg.content
      .slice(ultimaTroca + 1)
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const u = msg.usage;
    return {
      texto,
      entrada: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      saida: u.output_tokens,
      modelo: msg.model,
    };
  } catch (e) {
    if (e instanceof ErroIA) throw e;
    console.error("[motion] Anthropic:", e);
    if (e instanceof Anthropic.AuthenticationError) throw new ErroIA("Chave da Anthropic inválida no worker (ANTHROPIC_API_KEY).");
    if (e instanceof Anthropic.RateLimitError) throw new ErroIA("Limite de uso da Anthropic atingido. Tente de novo em alguns minutos.");
    if (e instanceof Anthropic.BadRequestError) throw new ErroIA(`A Anthropic recusou o pedido: ${e.message.slice(0, 200)}`);
    if (e instanceof Anthropic.APIError)
      throw new ErroIA(`A Anthropic falhou (HTTP ${e.status ?? "?"}). Tente de novo em instantes.`);
    throw new ErroIA("Falha de conexão com a Anthropic. Tente de novo.");
  }
}

/** GPT na Responses API da OpenAI (o esforço vai em `reasoning.effort`, de low a max). */
async function escreverOpenAI(o: Parameters<typeof escrever>[0]): Promise<RespostaIA> {
  const client = new OpenAI({ apiKey: precisa("OPENAI_API_KEY"), timeout: 40 * 60 * 1000 });
  try {
    const stream = await client.responses.create({
      model: o.modelo,
      instructions: o.sistema,
      input: [
        {
          role: "user",
          content: o.partes.map((p) =>
            p.tipo === "texto"
              ? { type: "input_text" as const, text: p.texto }
              : { type: "input_image" as const, image_url: `data:${p.mime};base64,${p.base64}`, detail: "high" as const },
          ),
        },
      ],
      reasoning: { effort: o.esforco },
      max_output_tokens: maxTokensMotion(o.esforco),
      stream: true,
    });
    let texto = "";
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") {
        texto += ev.delta;
        o.aoEscrever(texto.length);
      } else if (ev.type === "response.completed") {
        const u = ev.response.usage;
        return { texto, entrada: u?.input_tokens ?? 0, saida: u?.output_tokens ?? 0, modelo: ev.response.model };
      } else if (ev.type === "response.incomplete") {
        const motivo = ev.response.incomplete_details?.reason;
        throw new ErroIA(
          motivo === "max_output_tokens"
            ? "A animação passou do tamanho máximo de resposta. Tente um vídeo mais curto ou um esforço menor."
            : `O GPT parou antes de terminar (${motivo ?? "sem motivo"}). Mude o texto do pedido e tente de novo.`,
        );
      } else if (ev.type === "response.failed") {
        throw new ErroIA(`A OpenAI falhou: ${ev.response.error?.message ?? "sem detalhe"}`.slice(0, 300));
      } else if (ev.type === "error") {
        throw new ErroIA(`A OpenAI falhou: ${ev.message}`.slice(0, 300));
      }
    }
    throw new ErroIA("A OpenAI encerrou a resposta sem terminar. Tente de novo.");
  } catch (e) {
    if (e instanceof ErroIA) throw e;
    console.error("[motion] OpenAI:", e);
    if (e instanceof OpenAI.AuthenticationError) throw new ErroIA("Chave da OpenAI inválida no worker (OPENAI_API_KEY).");
    if (e instanceof OpenAI.RateLimitError) throw new ErroIA("Limite de uso da OpenAI atingido. Tente de novo em alguns minutos.");
    if (e instanceof OpenAI.BadRequestError) throw new ErroIA(`A OpenAI recusou o pedido: ${e.message.slice(0, 200)}`);
    if (e instanceof OpenAI.APIError)
      throw new ErroIA(`A OpenAI falhou (HTTP ${e.status ?? "?"}). Tente de novo em instantes.`);
    throw new ErroIA("Falha de conexão com a OpenAI. Tente de novo.");
  }
}

const NIVEL: Partial<Record<EsforcoMotion, ThinkingLevel>> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

async function escreverGemini(o: Parameters<typeof escrever>[0]): Promise<RespostaIA> {
  const ai = new GoogleGenAI({ apiKey: precisa("GEMINI_API_KEY") });
  try {
    const stream = await ai.models.generateContentStream({
      model: o.modelo,
      contents: [
        {
          role: "user",
          parts: o.partes.map((p) =>
            p.tipo === "texto" ? { text: p.texto } : { inlineData: { mimeType: p.mime, data: p.base64 } },
          ),
        },
      ],
      config: {
        systemInstruction: o.sistema,
        thinkingConfig: { thinkingLevel: NIVEL[o.esforco] ?? ThinkingLevel.HIGH },
        maxOutputTokens: 65_536,
      },
    });
    let texto = "";
    let entrada = 0;
    let saida = 0;
    let fim: string | undefined;
    for await (const c of stream) {
      for (const p of c.candidates?.[0]?.content?.parts ?? []) if (p.text && !p.thought) texto += p.text;
      fim = c.candidates?.[0]?.finishReason ?? fim;
      if (c.usageMetadata) {
        entrada = c.usageMetadata.promptTokenCount ?? entrada;
        saida = (c.usageMetadata.candidatesTokenCount ?? 0) + (c.usageMetadata.thoughtsTokenCount ?? 0);
      }
      o.aoEscrever(texto.length);
    }
    if (fim === "MAX_TOKENS")
      throw new ErroIA("A animação passou do tamanho máximo de resposta. Tente um vídeo mais curto ou um esforço menor.");
    if (fim && fim !== "STOP")
      throw new ErroIA(`O Gemini parou antes de terminar (${fim}). Mude o texto do pedido e tente de novo.`);
    return { texto, entrada, saida, modelo: o.modelo };
  } catch (e) {
    if (e instanceof ErroIA) throw e;
    console.error("[motion] Gemini:", e);
    const status = e instanceof ApiError ? e.status : undefined;
    if (status === 400 && /api key/i.test((e as Error).message))
      throw new ErroIA("Chave do Gemini inválida no worker (GEMINI_API_KEY).");
    if (status === 429) throw new ErroIA("Limite de uso do Gemini atingido (o Argon exige a chave paga).");
    throw new ErroIA(`O Gemini falhou${status ? ` (HTTP ${status})` : ""}. Tente de novo em instantes.`);
  }
}
