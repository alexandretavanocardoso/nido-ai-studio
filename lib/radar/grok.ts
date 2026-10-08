/**
 * O que está em alta no X sobre os temas do personagem, via Grok (xAI) com a
 * ferramenta de busca no X. Só roda com XAI_API_KEY.
 *
 * Custo medido em 07/10/2026 (2 temas): US$ 0,11 com grok-4.3 fazendo uma busca
 * por tema (2 buscas, 20 posts). O que pesa são os posts lidos (US$ 5 por mil,
 * uns 10 por busca), não os tokens. Com grok-4.7 e o pedido antigo ("no máximo
 * 25 posts") saía US$ 0,41: ele fazia 9 a 12 buscas e lia 55 posts.
 * Devolve texto corrido; quem organiza e dá nota é o Claude (lib/radar/gerar.ts).
 */
const URL_XAI = "https://api.x.ai/v1/responses";
const modelo = () => process.env.XAI_MODEL?.trim() || "grok-4.3";

/** Só os primeiros temas vão para o X: cada tema é uma busca (~US$ 0,055). */
const MAX_TEMAS_NO_X = 3;
/** Rede de segurança; no teste o grok-4.7 passou deste teto, então não conte só com ele. */
const MAX_BUSCAS = MAX_TEMAS_NO_X;
const ontem = () =>
  new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

export const grokDisponivel = () => !!process.env.XAI_API_KEY?.trim();

export interface EmAltaNoX {
  texto: string;
  /** Links dos posts citados, quando a API devolve. */
  fontes: string[];
}

/** Texto final de uma resposta da Responses API (os blocos output_text das mensagens). */
export function textoDaResposta(data: unknown): string {
  const d = data as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };
  if (typeof d?.output_text === "string" && d.output_text.trim())
    return d.output_text.trim();
  return (d?.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("\n")
    .trim();
}

export function fontesDaResposta(data: unknown): string[] {
  const d = data as {
    citations?: Array<string | { url?: string }>;
    output?: Array<{
      content?: Array<{ annotations?: Array<{ url?: string }> }>;
    }>;
  };
  const urls = [
    ...(d?.citations ?? []).map((c) => (typeof c === "string" ? c : c.url)),
    ...(d?.output ?? [])
      .flatMap((o) => o.content ?? [])
      .flatMap((c) => c.annotations ?? [])
      .map((a) => a.url),
  ].filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
  return [...new Set(urls)].slice(0, 30);
}

export async function emAltaNoX(o: {
  temas: string[];
  idioma: "pt" | "en";
}): Promise<EmAltaNoX | null> {
  const chave = process.env.XAI_API_KEY?.trim();
  if (!chave || !o.temas.length) return null;
  const temas = o.temas.slice(0, MAX_TEMAS_NO_X);
  const pedido =
    o.idioma === "en"
      ? `Search X for what is trending in the last 24 hours about each of these topics: ${temas.join("; ")}.\n` +
        "Each search costs money: run exactly ONE search per topic (most engaged posts first) and answer from what it returns — do not refine or repeat searches. For each topic list up to 3 things people are talking about: what happened, why it is getting attention, and the link to one representative post with the date and time it was posted (UTC). Be brief and factual; do not invent. If nothing relevant is trending for a topic, say so."
      : `Procure no X o que está em alta nas últimas 24 horas sobre cada um destes temas: ${temas.join("; ")}.\n` +
        "Cada busca custa dinheiro: faça exatamente UMA busca por tema (posts com mais engajamento primeiro, em português ou inglês) e responda com o que ela trouxer — não refine nem repita buscas. Para cada tema, liste até 3 assuntos que estão sendo comentados: o que aconteceu, por que está chamando atenção e o link de um post representativo com a data e a hora em que foi publicado (UTC). Seja breve e factual; não invente. Se não houver nada relevante em alta num tema, diga isso.";
  try {
    const res = await fetch(URL_XAI, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chave}`,
      },
      body: JSON.stringify({
        model: modelo(),
        input: [{ role: "user", content: pedido }],
        // Só posts de ontem para cá.
        tools: [{ type: "x_search", from_date: ontem() }],
        max_tool_calls: MAX_BUSCAS,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(
        "[radar] Grok respondeu",
        res.status,
        JSON.stringify(data)?.slice(0, 300),
      );
      return null;
    }
    // Guarda o consumo no log para conferir o custo real (posts lidos e tokens).
    console.log(
      "[radar] Grok uso:",
      JSON.stringify((data as { usage?: unknown })?.usage ?? null),
    );
    const texto = textoDaResposta(data);
    return texto
      ? { texto: texto.slice(0, 6000), fontes: fontesDaResposta(data) }
      : null;
  } catch (e) {
    console.warn(
      "[radar] Grok falhou (o radar segue só com notícias):",
      (e as Error).message,
    );
    return null;
  }
}
