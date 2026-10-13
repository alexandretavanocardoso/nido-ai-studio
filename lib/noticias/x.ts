import { fontesDaResposta, textoDaResposta } from "@/lib/radar/grok";

/**
 * O que os perfis acompanhados publicaram no X, via Grok (xAI) com a busca no
 * X restrita a esses perfis. Só roda com XAI_API_KEY. O que pesa no custo são
 * os posts lidos (US$ 5 por mil, uns 10 por busca): por isso uma busca por
 * perfil. Devolve texto corrido; quem organiza é o Claude (./pesquisar.ts).
 */
const URL_XAI = "https://api.x.ai/v1/responses";
const modelo = () => process.env.XAI_MODEL?.trim() || "grok-4.3";
/** Limite da busca do Grok para a lista de perfis. */
export const MAX_PERFIS = 10;

export async function postsDoX(o: {
  perfis: string[];
  /** Só posts deste dia para cá (AAAA-MM-DD). */
  desde: string;
}): Promise<{ texto: string; fontes: string[] } | null> {
  const chave = process.env.XAI_API_KEY?.trim();
  const perfis = o.perfis.slice(0, MAX_PERFIS);
  if (!chave || !perfis.length) return null;
  const pedido =
    `Leia no X o que estas contas publicaram de ${o.desde} para cá: ${perfis.map((p) => `@${p}`).join(", ")}.\n` +
    "Cada busca custa dinheiro: faça exatamente UMA busca por conta e responda com o que ela trouxer — não refine nem repita buscas. " +
    "Para cada conta, liste até 6 posts que são novidade de verdade (lançamento, recurso novo, mudança de preço ou de limite, campanha, parceria, problema no serviço); ignore respostas, reposts e conversa fiada. " +
    "De cada post diga: o que anuncia, em 1–2 frases; o link do post; a data e a hora em que foi publicado (UTC). Seja breve e factual; não invente. Se a conta não publicou nada relevante, diga isso.";
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
        tools: [
          { type: "x_search", from_date: o.desde, allowed_x_handles: perfis },
        ],
        max_tool_calls: perfis.length,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(
        "[noticias] Grok respondeu",
        res.status,
        JSON.stringify(data)?.slice(0, 300),
      );
      return null;
    }
    // Guarda o consumo no log para conferir o custo real (posts lidos e tokens).
    console.log(
      "[noticias] Grok uso:",
      JSON.stringify((data as { usage?: unknown })?.usage ?? null),
    );
    const texto = textoDaResposta(data);
    return texto
      ? { texto: texto.slice(0, 8000), fontes: fontesDaResposta(data) }
      : null;
  } catch (e) {
    console.warn(
      "[noticias] Grok falhou (segue só com a web):",
      (e as Error).message,
    );
    return null;
  }
}
