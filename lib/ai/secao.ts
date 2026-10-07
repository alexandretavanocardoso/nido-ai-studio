import { toSuggestions } from "@/lib/ai/flatten";
import { campoAceitoDaIA } from "@/lib/campos-ficha";
import type { Suggestion } from "@/lib/store";

/**
 * Resposta do "Preencher esta etapa com IA" → sugestões só da etapa pedida.
 *  - Se a IA devolveu os campos soltos ({ tomHumor: … }), coloca dentro da etapa.
 *  - Descarta campos que não são da ficha (ou só manuais, como o nome).
 */
export function sugestoesDaSecao(
  data: Record<string, unknown>,
  stepId: string,
  campos: string[],
): Suggestion[] {
  const nomes = new Set(
    campos.map((c) => c.replace(`${stepId}.`, "").split(".")[0]),
  );
  const soltos = Object.keys(data).filter((k) => nomes.has(k.split(".")[0]));
  const normalizado =
    soltos.length && !data[stepId]
      ? {
          ...data,
          [stepId]: Object.fromEntries(soltos.map((k) => [k, data[k]])),
        }
      : data;
  const prefixo = `${stepId}.`;
  return toSuggestions(normalizado as Parameters<typeof toSuggestions>[0])
    .filter((s) => campoAceitoDaIA(s.fieldId))
    .filter((s) => s.fieldId === stepId || s.fieldId.startsWith(prefixo));
}
