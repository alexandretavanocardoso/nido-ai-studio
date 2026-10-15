import type { askClaude } from "@/lib/ai/anthropic";

/** Modelo de texto da live (respostas ao vivo e cenário): rápido e barato. */
export const MODELO_LIVE = process.env.LIVE_MODEL?.trim() || "claude-haiku-5-5";

/**
 * Resposta direta, sem raciocínio: na live o que pesa é a velocidade. Cada
 * modelo desliga de um jeito (o Sonnet 5.5 recusa "disabled"; o Opus 5.5 não
 * desliga e fica no esforço mínimo).
 */
export const SEM_RACIOCINIO: Pick<Parameters<typeof askClaude>[0], "thinking" | "effort"> =
  /sonnet-5-5/.test(MODELO_LIVE)
    ? { thinking: { type: "between_tools" }, effort: "low" }
    : /opus-5-5|fable|mythos/.test(MODELO_LIVE)
      ? { effort: "low" }
      : { thinking: { type: "disabled" }, effort: "low" };
