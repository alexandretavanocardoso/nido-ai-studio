import type { z } from "zod";
import { AIParseError, askClaude, usosRecentes } from "./anthropic";
import { extractJson } from "./schema";
import type { IdiomaIA } from "./idioma";

/**
 * Chama o modelo esperando JSON válido no schema. Se a primeira chamada
 * vier malformada, tenta reparar uma vez pedindo pro próprio modelo
 * reemitir só o JSON correto.
 */
export async function askJson<T extends z.ZodTypeAny>({
  system,
  user,
  schema,
  maxTokens,
  idioma,
  imagens,
}: {
  system: string;
  user: string;
  schema: T;
  maxTokens?: number;
  idioma?: IdiomaIA;
  /** Imagens que vão junto com o pedido (só na primeira chamada; o reparo é só texto). */
  imagens?: Parameters<typeof askClaude>[0]["imagens"];
}): Promise<z.infer<T>> {
  const raw = await askClaude({ system, user, maxTokens, idioma, imagens });
  const first = tryParse(raw, schema);
  if (first.ok) return first.data;

  // Resposta cortada no limite de tamanho: "consertar" só gastaria outra chamada
  // inteira para devolver um JSON incompleto. Falha logo (a rota devolve os créditos).
  if (usosRecentes().at(-1)?.cortado)
    throw new AIParseError(
      "A resposta da IA ficou grande demais e saiu incompleta. Tente de novo.",
    );

  // tenta reparar — passa o JSON ruim e pede só o JSON corrigido
  const repair = await askClaude({
    system:
      "Você é um reparador de JSON. Receba o texto a seguir e devolva APENAS o JSON válido correspondente, sem texto em volta, sem Markdown.",
    user: `JSON a reparar:\n\n${raw}\n\nErro de validação: ${first.error}`,
    maxTokens: maxTokens ?? 4096,
  });
  const second = tryParse(repair, schema);
  if (second.ok) return second.data;
  throw new AIParseError(
    `A IA respondeu em um formato que não bateu com o esperado. Último erro: ${second.error}`,
  );
}

function tryParse<T extends z.ZodTypeAny>(
  raw: string,
  schema: T,
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const trimmed = extractJson(raw);
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" · "),
    };
  }
  return { ok: true, data: parsed.data };
}
