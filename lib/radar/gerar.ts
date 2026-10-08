import { z } from "zod";
import {
  AIParseError,
  AIProviderError,
  getClient,
  usosRecentes,
} from "@/lib/ai/anthropic";
import { askJson } from "@/lib/ai/parse";
import type { Character } from "@/lib/types";
import { emAltaNoX } from "./grok";
import { lerPublicadoEm, type ItemRadar } from "./tipos";

/**
 * Monta o radar do dia de um personagem:
 *  1. (opcional) Grok lê o que está em alta no X nos temas;
 *  2. Claude Haiku pesquisa as notícias das últimas 24–48h com a busca na web
 *     oficial da Anthropic (fontes citadas), junta com o que veio do X e tira
 *     repetidos;
 *  3. o modelo principal (Sonnet) refaz as notas com rigor e marca o que é
 *     promocional — o Haiku pesquisa bem e barato, mas dá 9 com facilidade.
 */
/**
 * Modelo do radar: Haiku 4.5 (US$ 1 / US$ 5 por milhão de tokens). Medido em
 * 07/10/2026 com 3 buscas: ~25 mil tokens de entrada, US$ 0,066 por radar. O
 * Sonnet 5.5 com 4 buscas custou US$ 0,27 (os resultados das buscas entram como
 * tokens de entrada) sem achar pautas melhores.
 */
const MODELO = process.env.RADAR_MODEL?.trim() || "claude-haiku-4-5-20251001";
const PRECO = { entrada: 1, saida: 5 } as const;
/** Buscas na web por radar (US$ 0,01 cada + os tokens dos resultados). */
const MAX_BUSCAS = 3;
const MAX_ITENS = 8;

const texto = z.preprocess(
  (v) => (Array.isArray(v) ? v.join("; ") : v),
  z.string(),
);
const itemSchema = z.object({
  titulo: texto,
  resumo: texto.optional().default(""),
  porque: texto.optional().default(""),
  ideia: texto.optional().default(""),
  fonte: z.enum(["noticia", "x"]).catch("noticia"),
  origem: texto.optional(),
  url: z.string().optional(),
  publicadoEm: z.string().optional().catch(undefined),
  nota: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number())
    .catch(5),
});
const respostaSchema = z.object({
  resumo: texto.optional().default(""),
  itens: z.array(itemSchema).default([]),
});

export interface RadarGerado {
  resumo: string;
  itens: ItemRadar[];
  /** O X foi consultado e respondeu. */
  usouX: boolean;
  custo: {
    entrada: number;
    saida: number;
    buscas: number;
    usd: number;
    revisado: boolean;
  };
}

/** Só o que o editor de pautas precisa saber do personagem (a ficha inteira encareceria cada radar). */
export function perfilParaRadar(c: Character): string {
  const linha = (rotulo: string, v: unknown) => {
    const t = Array.isArray(v)
      ? v.filter(Boolean).join(", ")
      : typeof v === "string"
        ? v.trim()
        : "";
    return t ? `- ${rotulo}: ${t}` : "";
  };
  return [
    linha("Nome", c.identidade.nome),
    linha("Quem é", c.identidade.bio),
    linha("Ocupação", c.identidade.ocupacao),
    linha(
      "Nicho",
      [c.nicho.principal, c.nicho.subnicho].filter(Boolean).join(" · "),
    ),
    linha("Público", c.nicho.publico),
    linha("Promessa do perfil", c.nicho.promessa),
    linha("Diferencial", c.nicho.diferencial),
    linha("Jeito", c.soul.adjetivos),
    linha("Defende", c.soul.valoresDefende),
    linha("Nunca fala de", c.monetizacao.limites),
  ]
    .filter(Boolean)
    .join("\n");
}

export function pedidoRadar(o: {
  perfil: string;
  temas: string[];
  hoje: string;
  noX: string | null;
  idioma: "pt" | "en";
}): string {
  const en = o.idioma === "en";
  return [
    en ? `Today is ${o.hoje}.` : `Hoje é ${o.hoje}.`,
    "",
    en ? "[CHARACTER]" : "[PERSONAGEM]",
    o.perfil ||
      (en ? "(profile not filled in yet)" : "(ficha ainda não preenchida)"),
    "",
    en ? "[TOPICS TO WATCH]" : "[TEMAS PARA ACOMPANHAR]",
    ...o.temas.map((t) => `- ${t}`),
    "",
    ...(o.noX
      ? [
          en
            ? "[TRENDING ON X TODAY — collected by another tool]"
            : "[EM ALTA NO X HOJE — coletado por outra ferramenta]",
          o.noX,
          "",
        ]
      : []),
    en ? "[TASK]" : "[TAREFA]",
    en
      ? `Use web search (at most ${MAX_BUSCAS} searches) to find what happened in the last 24–48 hours on these topics. Prefer news from today and real, checkable facts.`
      : `Use a busca na web (no máximo ${MAX_BUSCAS} buscas) para achar o que aconteceu nas últimas 24–48 horas nesses temas. Prefira notícias de hoje e fatos reais, verificáveis.`,
    en
      ? `Then pick up to ${MAX_ITENS} items that this character could post about, merging duplicates (the same story from the news and from X is ONE item).`
      : `Depois escolha até ${MAX_ITENS} assuntos sobre os quais este personagem poderia postar, juntando repetidos (a mesma história na notícia e no X é UM item só).`,
    en
      ? "Score each item from 1 to 10 for THIS character: 9–10 = hot today and squarely in their niche (they should post now); 6–8 = relevant; below 6 = weak link. Be strict — most days have few 9s."
      : "Dê nota de 1 a 10 para ESTE personagem: 9–10 = quente hoje e bem no nicho dele (vale postar agora); 6–8 = relevante; abaixo de 6 = ligação fraca. Seja rigoroso — a maioria dos dias tem poucos 9.",
    en
      ? "Do not invent facts, numbers or links. Only use a URL that came from the search results or from the X block."
      : "Não invente fatos, números nem links. Só use URL que veio dos resultados da busca ou do bloco do X.",
    en
      ? 'In "publicadoEm" put when the story or post was published, as the source shows it: date and time in ISO 8601 with the time zone (2026-10-07T14:30:00-03:00), or only the date (2026-10-07) when the time is not shown. Leave it out if you did not see a date — never guess.'
      : 'Em "publicadoEm" coloque quando a notícia ou o post foi publicado, como a fonte mostra: data e hora em ISO 8601 com o fuso (2026-10-07T14:30:00-03:00), ou só a data (2026-10-07) quando a hora não aparece. Deixe de fora se você não viu a data — nunca chute.',
    "",
    en ? "[OUTPUT]" : "[SAÍDA]",
    en
      ? "After searching, answer with ONE JSON object and nothing after it:"
      : "Depois de pesquisar, responda com UM objeto JSON e nada depois dele:",
    `{"resumo": "${en ? "2–3 sentences: what matters today for this character" : "2–3 frases: o que importa hoje para este personagem"}", "itens": [{"titulo": "...", "resumo": "${en ? "what happened, 1–2 sentences" : "o que aconteceu, 1–2 frases"}", "porque": "${en ? "why it matters to this character" : "por que importa para este personagem"}", "ideia": "${en ? "a post idea in their voice" : "ideia de post na linha dele"}", "fonte": "noticia" | "x", "origem": "${en ? "outlet or @profile" : "veículo ou @perfil"}", "url": "https://...", "publicadoEm": "2026-10-07T14:30:00-03:00", "nota": 1-10}]}`,
    en
      ? "Write everything in English."
      : "Escreva tudo em português do Brasil.",
  ].join("\n");
}

/**
 * Todos os objetos JSON "soltos" num texto: para cada `{`, acha o `}` que o
 * fecha (respeitando aspas e escapes) e tenta ler. Serve para respostas com
 * texto antes ou depois do JSON, cercas de Markdown ou mais de um objeto.
 */
export function objetosJsonNoTexto(texto: string): unknown[] {
  const achados: unknown[] = [];
  for (let i = texto.indexOf("{"); i >= 0; i = texto.indexOf("{", i + 1)) {
    let nivel = 0;
    let emTexto = false;
    let escape = false;
    for (let k = i; k < texto.length; k++) {
      const ch = texto[k];
      if (emTexto) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') emTexto = false;
        continue;
      }
      if (ch === '"') emTexto = true;
      else if (ch === "{") nivel++;
      else if (ch === "}" && --nivel === 0) {
        try {
          achados.push(JSON.parse(texto.slice(i, k + 1)));
          i = k; // objeto lido: continua depois dele (não relê os objetos de dentro)
        } catch {
          /* não era JSON válido: tenta o próximo `{` */
        }
        break;
      }
    }
  }
  return achados;
}

const FORMATO_INESPERADO =
  "O radar veio num formato inesperado. Tente de novo.";

/** Lê o JSON da resposta (o último objeto com uma lista "itens"), ordena por nota e limita. */
export function lerRadar(textoFinal: string): {
  resumo: string;
  itens: ItemRadar[];
} {
  const candidatos = objetosJsonNoTexto(textoFinal).filter(
    (o): o is Record<string, unknown> =>
      !!o &&
      typeof o === "object" &&
      Array.isArray((o as { itens?: unknown }).itens),
  );
  const obj = candidatos.at(-1);
  if (!obj) throw new AIParseError(FORMATO_INESPERADO);
  const r = respostaSchema.safeParse(obj);
  if (!r.success) throw new AIParseError(FORMATO_INESPERADO);
  const itens: ItemRadar[] = r.data.itens
    .filter((i) => i.titulo.trim())
    .map((i) => ({
      titulo: i.titulo.trim().slice(0, 200),
      resumo: i.resumo.trim().slice(0, 600),
      porque: i.porque.trim().slice(0, 400),
      ideia: i.ideia.trim().slice(0, 400),
      fonte: i.fonte,
      origem: i.origem?.trim().slice(0, 80) || undefined,
      url: i.url && /^https?:\/\//.test(i.url) ? i.url : undefined,
      publicadoEm: lerPublicadoEm(i.publicadoEm),
      nota: Math.min(
        10,
        Math.max(1, Math.round(Number.isFinite(i.nota) ? i.nota : 5)),
      ),
    }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, MAX_ITENS);
  return { resumo: r.data.resumo.trim().slice(0, 800), itens };
}

const revisaoSchema = z.object({
  resumo: texto.optional().default(""),
  itens: z
    .array(
      z.object({
        i: z.preprocess(
          (v) => (typeof v === "string" ? Number(v) : v),
          z.number(),
        ),
        nota: z.preprocess(
          (v) => (typeof v === "string" ? Number(v) : v),
          z.number(),
        ),
        promocional: z.boolean().optional().default(false),
      }),
    )
    .default([]),
});

/** Sem revisão, nenhum item vira "destaque": a nota de quem pesquisou é generosa demais. */
const TETO_SEM_REVISAO = 8;
const TETO_PROMOCIONAL = 4;

export function pedidoRevisao(o: {
  perfil: string;
  itens: ItemRadar[];
  hoje: string;
  idioma: "pt" | "en";
}): string {
  const lista = o.itens.map((it, i) => ({
    i,
    titulo: it.titulo,
    resumo: it.resumo,
    origem: it.origem ?? "",
    url: it.url ?? "",
    publicadoEm: it.publicadoEm ?? "",
    fonte: it.fonte,
  }));
  if (o.idioma === "en")
    return [
      `Today is ${o.hoje}.`,
      "",
      "[CHARACTER]",
      o.perfil || "(profile not filled in yet)",
      "",
      "[ITEMS FOUND BY THE RESEARCHER]",
      JSON.stringify(lista, null, 1),
      "",
      "[TASK]",
      "Score each item from 1 to 10 for THIS character. The researcher is too generous; you are the strict one.",
      "- 9–10: happened in the last 48 hours, is a checkable fact from a journalistic source or a real viral moment, AND sits at the centre of this character's niche. At most 1 or 2 per day; most days have none.",
      "- 7–8: recent and clearly connected to the niche.",
      "- 5–6: indirect connection, or general news the character could only comment on from the outside.",
      "- 1–4: off-niche, undated, an old or generic guide/list, or promotional.",
      "Mark promocional = true when the item is a press release, sponsored content or advertorial, a company blog selling its own product, or carries impressive numbers with no independent source. A promotional item never scores above 4.",
      "Judge only from what is written; do not assume facts that are not there.",
      "",
      "Then write the day's summary in 2–3 sentences, in English, based on YOUR scores: lead with the highest-scored items; if nothing scored 7 or more, say plainly that it is a quiet day for this character. Never highlight an item you scored low or marked as promotional.",
      "",
      'Answer with JSON only: {"resumo": "...", "itens": [{"i": 0, "nota": 1-10, "promocional": true|false}]} — one entry per item, same indexes.',
    ].join("\n");
  return [
    `Hoje é ${o.hoje}.`,
    "",
    "[PERSONAGEM]",
    o.perfil || "(ficha ainda não preenchida)",
    "",
    "[ITENS QUE O PESQUISADOR ACHOU]",
    JSON.stringify(lista, null, 1),
    "",
    "[TAREFA]",
    "Dê nota de 1 a 10 a cada item para ESTE personagem. O pesquisador é generoso demais; o rigoroso é você.",
    "- 9–10: aconteceu nas últimas 48 horas, é fato verificável de fonte jornalística ou um viral real, E está no centro do nicho do personagem. No máximo 1 ou 2 por dia; a maioria dos dias não tem nenhum.",
    "- 7–8: recente e claramente ligado ao nicho.",
    "- 5–6: ligação indireta, ou notícia geral que o personagem só comentaria de fora.",
    "- 1–4: fora do nicho, sem data, guia ou lista antiga e genérica, ou promocional.",
    "Marque promocional = true quando o item for comunicado de imprensa, conteúdo patrocinado ou publieditorial, blog de empresa vendendo o próprio produto, ou trouxer números impressionantes sem fonte independente. Item promocional nunca passa de 4.",
    "Julgue só pelo que está escrito; não suponha fatos que não estão ali.",
    "",
    "Depois escreva o resumo do dia em 2–3 frases, em português do Brasil, com base nas SUAS notas: comece pelos itens de nota mais alta; se nada chegou a 7, diga com clareza que o dia está fraco para este personagem. Nunca destaque um item que você deu nota baixa ou marcou como promocional.",
    "",
    'Responda só com JSON: {"resumo": "...", "itens": [{"i": 0, "nota": 1-10, "promocional": true|false}]} — uma entrada por item, com os mesmos índices.',
  ].join("\n");
}

/** Aplica as notas da revisão; item sem nota revisada fica no teto de "sem revisão". */
export function aplicarRevisao(
  itens: ItemRadar[],
  revisao: Array<{ i: number; nota: number; promocional?: boolean }> | null,
): ItemRadar[] {
  const porIndice = new Map((revisao ?? []).map((r) => [r.i, r]));
  return itens
    .map((it, i) => {
      const r = porIndice.get(i);
      if (!r || !Number.isFinite(r.nota))
        return { ...it, nota: Math.min(it.nota, TETO_SEM_REVISAO) };
      const nota = Math.min(10, Math.max(1, Math.round(r.nota)));
      return r.promocional
        ? { ...it, promocional: true, nota: Math.min(nota, TETO_PROMOCIONAL) }
        : { ...it, nota };
    })
    .sort((a, b) => b.nota - a.nota);
}

/**
 * Segunda passada, com o modelo principal (mais rigoroso): refaz as notas e
 * marca o que é promocional. Lê só títulos e resumos — custa menos de US$ 0,01.
 * Se falhar, o radar sai mesmo assim, mas sem nenhum "destaque".
 */
async function revisarNotas(o: {
  perfil: string;
  itens: ItemRadar[];
  hoje: string;
  idioma: "pt" | "en";
}): Promise<{
  itens: ItemRadar[];
  usd: number;
  revisado: boolean;
  resumo: string | null;
}> {
  if (!o.itens.length)
    return { itens: [], usd: 0, revisado: true, resumo: null };
  const antes = usosRecentes().length;
  try {
    const r = await askJson({
      system:
        o.idioma === "en"
          ? "You are a strict news editor. Answer with valid JSON only."
          : "Você é um editor de pautas rigoroso. Responda apenas com JSON válido.",
      user: pedidoRevisao(o),
      schema: revisaoSchema,
      maxTokens: 1500,
    });
    const usd = usosRecentes()
      .slice(antes)
      .reduce((t, u) => t + u.custo, 0);
    return {
      itens: aplicarRevisao(o.itens, r.itens),
      usd,
      revisado: true,
      resumo: r.resumo.trim().slice(0, 800) || null,
    };
  } catch (e) {
    console.warn(
      "[radar] revisão das notas falhou (segue sem destaques):",
      (e as Error).message,
    );
    return {
      itens: aplicarRevisao(o.itens, null),
      usd: 0,
      revisado: false,
      resumo: null,
    };
  }
}

export async function gerarRadar(o: {
  /** Personagem para quem o radar é montado… */
  character?: Character;
  /** …ou um perfil pronto (radar global: "qualquer criador do nicho"). */
  perfil?: string;
  temas: string[];
  /** Temas que vão para o X, se forem diferentes dos da pesquisa de notícias. */
  temasX?: string[];
  comX: boolean;
  idioma: "pt" | "en";
  hoje: string;
}): Promise<RadarGerado> {
  const noX = o.comX
    ? await emAltaNoX({ temas: o.temasX ?? o.temas, idioma: o.idioma })
    : null;
  const perfil = o.perfil ?? (o.character ? perfilParaRadar(o.character) : "");
  const client = getClient();
  const user = pedidoRadar({
    perfil,
    temas: o.temas,
    hoje: o.hoje,
    noX: noX?.texto ?? null,
    idioma: o.idioma,
  });
  const system =
    o.idioma === "en"
      ? "You are the content desk editor for a social media creator. You find what is happening today and judge, strictly, what is worth posting about."
      : "Você é o editor de pautas de um criador de conteúdo. Você descobre o que está acontecendo hoje e julga, com rigor, o que vale virar post.";
  const tools = [
    {
      // Busca oficial da Anthropic: as fontes vêm citadas (a versão com filtragem
      // dinâmica só existe nos modelos 4.6+; o Haiku 4.5 usa esta).
      type: "web_search_20250305",
      name: "web_search",
      max_uses: MAX_BUSCAS,
      user_location: {
        type: "approximate",
        country: o.idioma === "en" ? "US" : "BR",
      },
    },
  ];
  const mensagens: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: user },
  ];
  let entrada = 0;
  let saida = 0;
  let buscas = 0;
  let textoFinal = "";
  try {
    // A busca roda no servidor da Anthropic; uma resposta longa pode vir em pedaços (pause_turn).
    for (let volta = 0; volta < 4; volta++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages.create({
        model: MODELO,
        max_tokens: 6000,
        system,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: mensagens as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: tools as any,
      });
      entrada += res.usage?.input_tokens ?? 0;
      saida += res.usage?.output_tokens ?? 0;
      buscas += res.usage?.server_tool_use?.web_search_requests ?? 0;
      textoFinal = (res.content as Array<{ type: string; text?: string }>)
        .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
        .join("");
      if (res.stop_reason !== "pause_turn") break;
      mensagens.push({ role: "assistant", content: res.content });
    }
  } catch (e) {
    throw new AIProviderError(
      e,
      "Não consegui pesquisar as notícias agora. Tente de novo em instantes.",
    );
  }
  let lido: ReturnType<typeof lerRadar>;
  try {
    lido = lerRadar(textoFinal);
  } catch (e) {
    if (!(e instanceof AIParseError)) throw e;
    // A pesquisa já foi paga: em vez de jogar fora, pede só o JSON do que ela achou.
    console.warn(
      "[radar] resposta sem JSON legível; pedindo reemissão. Fim da resposta:",
      textoFinal.slice(-300),
    );
    if (!textoFinal.trim()) throw e;
    let reemitido = "";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages.create({
        model: MODELO,
        max_tokens: 6000,
        system:
          "Você converte anotações de pesquisa em JSON. Responda APENAS com o objeto JSON pedido, sem texto em volta, sem Markdown.",
        messages: [
          {
            role: "user",
            content:
              "Estas são as anotações de uma pesquisa de pautas. Devolva o mesmo conteúdo neste formato, sem inventar nada e sem acrescentar itens:\n" +
              '{"resumo": "...", "itens": [{"titulo": "...", "resumo": "...", "porque": "...", "ideia": "...", "fonte": "noticia" | "x", "origem": "...", "url": "https://...", "publicadoEm": "...", "nota": 1-10}]}\n\n[ANOTAÇÕES]\n' +
              textoFinal.slice(0, 24_000),
          },
        ],
      });
      entrada += res.usage?.input_tokens ?? 0;
      saida += res.usage?.output_tokens ?? 0;
      reemitido = (res.content as Array<{ type: string; text?: string }>)
        .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
        .join("");
    } catch (erroApi) {
      throw new AIProviderError(
        erroApi,
        "Não consegui montar o radar agora. Tente de novo em instantes.",
      );
    }
    lido = lerRadar(reemitido);
  }
  const revisao = await revisarNotas({
    perfil,
    itens: lido.itens,
    hoje: o.hoje,
    idioma: o.idioma,
  });
  const usd =
    (entrada * PRECO.entrada + saida * PRECO.saida) / 1_000_000 +
    buscas * 0.01 +
    revisao.usd;
  console.log(
    `[radar] ${MODELO} ${entrada}+${saida} tokens · ${buscas} buscas · revisão ${revisao.revisado ? "ok" : "falhou"} · US$ ${usd.toFixed(4)}`,
  );
  return {
    // O resumo do revisor reflete as notas finais; o do pesquisador é só reserva.
    resumo: revisao.resumo ?? lido.resumo,
    itens: revisao.itens,
    usouX: !!noX,
    custo: { entrada, saida, buscas, usd, revisado: revisao.revisado },
  };
}
