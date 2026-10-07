import Anthropic from "@anthropic-ai/sdk";
import { instrucaoIdioma, type IdiomaIA } from "./idioma";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIConfigError(
      "Nenhuma chave da Anthropic configurada no servidor.",
    );
  }
  // Chave sem workspace: a API exige o workspace em cada chamada.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey,
    ...(workspace
      ? { defaultHeaders: { "anthropic-workspace-id": workspace } }
      : {}),
  });
}

export class AIConfigError extends Error {
  code = "ANTHROPIC_KEY_MISSING" as const;
}
export class AIProviderError extends Error {
  code = "ANTHROPIC_PROVIDER" as const;
  constructor(
    public upstream: unknown,
    message: string,
  ) {
    super(message);
  }
}
export class AIParseError extends Error {
  code = "ANTHROPIC_PARSE" as const;
}

interface AskOptions {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  /** Idioma do texto gerado (padrão: o que o prompt pedir, em geral português). */
  idioma?: IdiomaIA;
}

/** Mensagem em português para erros de configuração da Anthropic (o resto vira "tente de novo"). */
function mensagemAnthropic(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const msg = (err as Error)?.message ?? "";
  if (/must be a valid workspace ID/i.test(msg))
    return "ANTHROPIC_WORKSPACE_ID inválido: use o ID do workspace que começa com wrkspc_ (Console → Settings → Workspaces).";
  if (/not scoped to a workspace|anthropic-workspace-id/i.test(msg))
    return "A chave da Anthropic não está ligada a um workspace: adicione ANTHROPIC_WORKSPACE_ID no .env ou crie a chave dentro de um workspace.";
  if (status === 401)
    return "Chave da Anthropic inválida. Confira ANTHROPIC_API_KEY.";
  if (status === 404)
    return "Modelo da Anthropic não encontrado. Confira ANTHROPIC_MODEL.";
  if (status === 400 && msg)
    return `A Anthropic recusou o pedido: ${msg.replace(/^\d+\s*/, "").slice(0, 200)}`;
  return "Falha ao chamar a Anthropic. Tente de novo em instantes.";
}

/** Preço do modelo padrão (Claude Sonnet 5.5), em US$ por milhão de tokens. */
export const PRECO_TEXTO = { entrada: 2, saida: 10 } as const;

export interface UsoTexto {
  entrada: number;
  saida: number;
  /** Custo da chamada em US$, pelos preços acima. */
  custo: number;
  /** A resposta bateu no limite de tamanho (max_tokens) e saiu incompleta. */
  cortado: boolean;
}

export function custoDoUso(entrada: number, saida: number): number {
  return (
    (entrada * PRECO_TEXTO.entrada + saida * PRECO_TEXTO.saida) / 1_000_000
  );
}

/** Tokens das últimas chamadas (mais recente por último) — para medir custo. */
const usos: UsoTexto[] = [];
export function usosRecentes(): UsoTexto[] {
  return [...usos];
}

/**
 * Chama o modelo e devolve só o texto principal da resposta.
 */
export async function askClaude({
  system,
  user,
  maxTokens = 4096,
  model = DEFAULT_MODEL,
  idioma,
}: AskOptions): Promise<string> {
  const client = getClient();
  const t0 = Date.now();
  let res;
  try {
    res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: system + instrucaoIdioma(idioma),
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    throw new AIProviderError(err, mensagemAnthropic(err));
  }
  const dur = Date.now() - t0;
  const uso: UsoTexto = {
    entrada: res.usage?.input_tokens ?? 0,
    saida: res.usage?.output_tokens ?? 0,
    custo: custoDoUso(
      res.usage?.input_tokens ?? 0,
      res.usage?.output_tokens ?? 0,
    ),
    cortado: res.stop_reason === "max_tokens",
  };
  usos.push(uso);
  if (usos.length > 50) usos.shift();
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new AIParseError("A IA voltou vazia. Tente de novo.");
  }
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[anthropic] ${model} · ${dur}ms · ${uso.entrada}+${uso.saida} tokens · US$ ${uso.custo.toFixed(4)}`,
    );
  }
  return text;
}
