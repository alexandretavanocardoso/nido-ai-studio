import { AIProviderError, getClient, mensagemAnthropic } from "./anthropic";

/**
 * Pesquisa com a busca na web oficial da Anthropic, para os agentes do admin
 * (fornecedores, notícias). A busca roda no servidor da Anthropic e as fontes
 * vêm citadas; cada busca custa US$ 0,01 mais os tokens dos resultados.
 */
export const PRECO_BUSCA_WEB = 0.01;

export interface UsoBuscaWeb {
  entrada: number;
  saida: number;
  buscas: number;
}

const textoDe = (content: Array<{ type: string; text?: string }>) =>
  content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");

/** Faz o pedido com a busca ligada e devolve o texto final da resposta. */
export async function pesquisarNaWeb(o: {
  modelo: string;
  system: string;
  user: string;
  maxBuscas: number;
  maxTokens?: number;
}): Promise<UsoBuscaWeb & { texto: string }> {
  const client = getClient();
  const tools = [
    // A versão com filtragem dinâmica só existe nos modelos 4.6+; esta serve em todos.
    { type: "web_search_20250305", name: "web_search", max_uses: o.maxBuscas },
  ];
  const mensagens: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: o.user },
  ];
  const uso = { entrada: 0, saida: 0, buscas: 0 };
  let texto = "";
  try {
    // Uma resposta longa pode vir em pedaços (pause_turn).
    for (let volta = 0; volta < 4; volta++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages.create({
        model: o.modelo,
        max_tokens: o.maxTokens ?? 6000,
        system: o.system,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: mensagens as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: tools as any,
      });
      uso.entrada += res.usage?.input_tokens ?? 0;
      uso.saida += res.usage?.output_tokens ?? 0;
      uso.buscas += res.usage?.server_tool_use?.web_search_requests ?? 0;
      texto = textoDe(res.content);
      if (res.stop_reason !== "pause_turn") break;
      mensagens.push({ role: "assistant", content: res.content });
    }
  } catch (e) {
    throw new AIProviderError(e, mensagemAnthropic(e));
  }
  return { ...uso, texto };
}

/**
 * A pesquisa já foi paga mas a resposta veio sem JSON legível: em vez de jogar
 * fora, pede só o JSON do que ela achou.
 */
export async function reemitirJson(o: {
  modelo: string;
  /** O objeto esperado, como exemplo. */
  formato: string;
  anotacoes: string;
  maxTokens?: number;
}): Promise<{ texto: string; entrada: number; saida: number }> {
  try {
    const res = await getClient().messages.create({
      model: o.modelo,
      max_tokens: o.maxTokens ?? 6000,
      system:
        "Você converte anotações de pesquisa em JSON. Responda APENAS com o objeto JSON pedido, sem texto em volta, sem Markdown.",
      messages: [
        {
          role: "user",
          content:
            "Estas são as anotações de uma pesquisa. Devolva o mesmo conteúdo neste formato, sem inventar nada e sem acrescentar itens:\n" +
            `${o.formato}\n\n[ANOTAÇÕES]\n${o.anotacoes.slice(0, 24_000)}`,
        },
      ],
    });
    return {
      texto: textoDe(res.content as Array<{ type: string; text?: string }>),
      entrada: res.usage?.input_tokens ?? 0,
      saida: res.usage?.output_tokens ?? 0,
    };
  } catch (e) {
    throw new AIProviderError(e, mensagemAnthropic(e));
  }
}
