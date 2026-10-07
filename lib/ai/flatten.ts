import type { Suggestion } from "@/lib/store";
import type { ExpandirResposta } from "./schema";

interface Envelope {
  valor: unknown;
  origem?: "contexto" | "suposicao";
}

function isEnvelope(x: unknown): x is Envelope {
  return !!x && typeof x === "object" && "valor" in (x as object);
}

const SECAO_SIMPLES: (keyof ExpandirResposta)[] = [
  "identidade",
  "visual",
  "nicho",
  "voz",
  "monetizacao",
];

const SOUL_NESTED = ["gostos", "odeia", "reacoes"] as const;

/**
 * Converte o payload nested da IA em uma lista plana de Suggestion
 * (`{fieldId em dot-notation, valor, origem}`), pronta para `applySuggestions`.
 */
/**
 * A IA às vezes responde com chaves "achatadas" ("soul.arquetipo": {...}) em
 * vez de aninhadas ({ soul: { arquetipo: {...} } }). Converte para aninhado —
 * sem isto, a regeneração "funcionava" mas não preenchia nenhum campo.
 */
export function aninharChaves(obj: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [chave, valor] of Object.entries(obj as Record<string, unknown>)) {
    const partes = chave.split(".").filter(Boolean);
    let alvo = out;
    partes.forEach((parte, i) => {
      if (i === partes.length - 1) {
        const existente = alvo[parte];
        alvo[parte] =
          existente &&
          typeof existente === "object" &&
          valor &&
          typeof valor === "object" &&
          !isEnvelope(valor)
            ? { ...(existente as object), ...aninharChaves(valor) }
            : valor &&
                typeof valor === "object" &&
                !Array.isArray(valor) &&
                !isEnvelope(valor)
              ? aninharChaves(valor)
              : valor;
      } else {
        if (!alvo[parte] || typeof alvo[parte] !== "object") alvo[parte] = {};
        alvo = alvo[parte] as Record<string, unknown>;
      }
    });
  }
  return out;
}

export function toSuggestions(bruto: ExpandirResposta): Suggestion[] {
  const data = aninharChaves(bruto) as ExpandirResposta;
  const out: Suggestion[] = [];

  for (const sec of SECAO_SIMPLES) {
    const bloco = data[sec];
    if (!bloco || typeof bloco !== "object") continue;
    for (const [k, v] of Object.entries(bloco)) {
      if (isEnvelope(v)) {
        out.push({
          fieldId: `${sec}.${k}`,
          valor: v.valor,
          origem: v.origem ?? "suposicao",
        });
      }
    }
  }

  // soul tem sub-objetos nested (gostos/odeia/reacoes)
  const soul = data.soul;
  if (soul && typeof soul === "object") {
    for (const [k, v] of Object.entries(soul)) {
      if (
        (SOUL_NESTED as readonly string[]).includes(k) &&
        v &&
        typeof v === "object"
      ) {
        // Aceita { gostos: { comidas: {valor} } } e também { gostos: { valor: { comidas: [...] } } }.
        const grupo =
          isEnvelope(v) &&
          v.valor &&
          typeof v.valor === "object" &&
          !Array.isArray(v.valor)
            ? Object.fromEntries(
                Object.entries(v.valor as Record<string, unknown>).map(
                  ([k2, x]) => [
                    k2,
                    isEnvelope(x)
                      ? x
                      : { valor: x, origem: v.origem ?? "suposicao" },
                  ],
                ),
              )
            : (v as Record<string, unknown>);
        for (const [k2, v2] of Object.entries(grupo)) {
          if (isEnvelope(v2)) {
            out.push({
              fieldId: `soul.${k}.${k2}`,
              valor: v2.valor,
              origem: v2.origem ?? "suposicao",
            });
          }
        }
      } else if (isEnvelope(v)) {
        out.push({
          fieldId: `soul.${k}`,
          valor: v.valor,
          origem: v.origem ?? "suposicao",
        });
      }
    }
  }

  return out;
}

export function extractPontosEmAberto(data: ExpandirResposta) {
  return (data.pontosEmAberto ?? []).map((p) => ({
    decisao: p.decisao,
    porQueImporta: p.porQueImporta,
  }));
}
