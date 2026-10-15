import {
  GenerateVideosOperation,
  GoogleGenAI,
  type GenerateVideosResponse,
} from "@google/genai";
import type { EstadoVideo } from "./jobs";
import type { ModeloCriar } from "./precos";

/**
 * Veo pela API do Gemini (Google): "Criar vídeo" a partir da imagem do
 * personagem (já no formato do vídeo, ver `recortarParaFormato`) e de um texto.
 * O pedido vira uma operação longa, consultada pelo nome.
 *  - O áudio vem sempre (a API não deixa desligar): sem áudio pedido, ele sai
 *    na união das cenas (ver `unirCenas`). O preço é o mesmo.
 *  - O vídeo pronto fica 2 dias no Google e só baixa com a chave: o resultado
 *    é "veo:<uri>", lido por `buscarResultado`.
 * Chave em GEMINI_API_KEY (a mesma do Nano Banana e do Omni).
 */
export const MODELO_VEO: Partial<Record<ModeloCriar, string>> = {
  "veo3.1_lite": "veo-3.1-lite-generate-preview",
};

export const RECUSA_VEO =
  "O Veo recusou a imagem ou o pedido. Ele não aceita algumas pessoas reconhecíveis, crianças nem conteúdo sensível. Tente outra imagem, outro texto ou outro modelo.";

let cliente: GoogleGenAI | null = null;

export function getVeo(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  cliente ??= new GoogleGenAI({ apiKey });
  return cliente;
}

/** Pede uma cena. Devolve o nome da operação (o id do pedido no Google). */
export async function enviarCriacaoVeo(
  ai: GoogleGenAI,
  input: {
    modelo: ModeloCriar;
    /** Já no formato do vídeo (ver `recortarParaFormato`). */
    imageUrl: string;
    promptText: string;
    vertical: boolean;
    duracao: number;
  },
): Promise<string> {
  const model = MODELO_VEO[input.modelo];
  if (!model) throw new Error("Este modelo não está disponível no Google.");
  const img = await fetch(input.imageUrl);
  if (!img.ok)
    throw new Error(`download da imagem falhou (HTTP ${img.status})`);
  const op = await ai.models.generateVideos({
    model,
    source: {
      prompt: input.promptText.slice(0, 1000),
      image: {
        imageBytes: Buffer.from(await img.arrayBuffer()).toString("base64"),
        mimeType: "image/jpeg",
      },
    },
    config: {
      numberOfVideos: 1,
      aspectRatio: input.vertical ? "9:16" : "16:9",
      durationSeconds: input.duracao,
      resolution: "720p",
      // Partindo de uma imagem, é o único valor que a API aceita.
      personGeneration: "allow_adult",
    },
  });
  if (!op.name) throw new Error("O Google não devolveu o pedido do vídeo.");
  console.info("[veo] vídeo na fila:", op.name);
  return op.name;
}

export async function consultarVeo(
  ai: GoogleGenAI,
  nome: string,
): Promise<EstadoVideo> {
  const op = new GenerateVideosOperation();
  op.name = nome;
  try {
    return estadoDaOperacao(await ai.operations.getVideosOperation({ operation: op }));
  } catch (e) {
    const status = statusDoErro(e);
    if (status === 404)
      return { estado: "erro", mensagem: "O Google não encontrou o vídeo." };
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429)
      return { estado: "erro", mensagem: mensagemDeErroVeo(e) };
    // Falha passageira: segue "processando" e a próxima consulta tenta de novo.
    console.warn("[veo] consulta", nome, (e as Error).message);
    return { estado: "processando" };
  }
}

const BARRADO = /recogni|celebrit|public figure|likeness|child|minor|safety|policy|prohibit|block|sensitive/i;

export function estadoDaOperacao(op: {
  done?: boolean;
  error?: Record<string, unknown>;
  response?: GenerateVideosResponse;
}): EstadoVideo {
  if (!op.done) return { estado: "processando" };
  if (op.error) {
    const msg = String(op.error.message ?? "");
    console.warn("[veo] falhou:", msg || "(sem detalhe)");
    return {
      estado: "erro",
      mensagem: BARRADO.test(msg) ? RECUSA_VEO : "O Veo não conseguiu gerar o vídeo.",
    };
  }
  const uri = op.response?.generatedVideos?.[0]?.video?.uri;
  if (uri) return { estado: "concluido", videoUrl: `veo:${uri}` };
  // O filtro do Google termina a operação sem vídeo (e sem cobrar).
  console.warn(
    "[veo] sem vídeo:",
    op.response?.raiMediaFilteredReasons?.join(" ") || "(sem motivo)",
  );
  return { estado: "erro", mensagem: RECUSA_VEO };
}

/** Baixa um resultado: o do Veo ("veo:<uri>") só sai com a chave; os outros, pela URL. */
export function buscarResultado(url: string): Promise<Response> {
  if (!url.startsWith("veo:")) return fetch(url);
  return fetch(url.slice("veo:".length), {
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY?.trim() ?? "" },
  });
}

/** Limite de uso, Google fora do ar ou rede: nada foi gerado, dá para tentar de novo. */
export function veoPassageiro(e: unknown): boolean {
  const status = statusDoErro(e);
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

export function mensagemDeErroVeo(e: unknown): string {
  const status = statusDoErro(e);
  const msg = (e as Error)?.message ?? "";
  console.error("[veo]", status ?? "", msg);
  if (status === 429 || /quota|rate limit|exhausted/i.test(msg))
    return "Limite de uso do Gemini atingido. Tente de novo em alguns minutos.";
  if (status === 401 || status === 403 || /api key/i.test(msg))
    return "A chave do Gemini não tem acesso ao Veo. Confira GEMINI_API_KEY (precisa de faturamento ativo).";
  if (BARRADO.test(msg)) return RECUSA_VEO;
  if (status === 400) return "O Google recusou o pedido do vídeo.";
  return `Falha no Veo${status ? ` (HTTP ${status})` : ""}.`;
}

/** Status HTTP do erro do SDK (ApiError tem `status`). */
function statusDoErro(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}
