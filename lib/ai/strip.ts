/**
 * Remove metadados de IA e campos pesados do personagem antes de enviar
 * para a Anthropic — a imagem (dataUrl base64) explode o payload sem valor
 * para o modelo.
 */
export function stripMetadata(c: unknown): unknown {
  if (!c || typeof c !== "object") return c;
  const copy = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
  delete copy._suggestions;
  delete copy._locks;
  delete copy._history;
  const visual = copy.visual as { referencias?: unknown[] } | undefined;
  if (visual?.referencias) {
    visual.referencias = visual.referencias.map((r) => {
      if (r && typeof r === "object") {
        const { dataUrl, ...rest } = r as Record<string, unknown>;
        void dataUrl;
        return { ...rest, dataUrl: "<referência de imagem, não enviada>" };
      }
      return r;
    });
  }
  return copy;
}
