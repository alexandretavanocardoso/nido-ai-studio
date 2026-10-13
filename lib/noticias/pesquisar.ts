import { z } from "zod";
import { AIParseError } from "@/lib/ai/anthropic";
import {
  pesquisarNaWeb,
  PRECO_BUSCA_WEB,
  reemitirJson,
} from "@/lib/ai/busca-web";
import { objetosJsonNoTexto } from "@/lib/radar/gerar";
import { lerPublicadoEm } from "@/lib/radar/tipos";
import {
  alvosLidos,
  type Agente,
  type Alvo,
  type NoticiaAchada,
} from "./tipos";
import { postsDoX } from "./x";

/**
 * Agente de notícias do admin. Para os alvos de um agente (lib/noticias/tipos.ts):
 *  1. (com XAI_API_KEY) o Grok lê o que os perfis publicaram no X;
 *  2. o Claude Haiku confere os sites oficiais e a imprensa com a busca na web,
 *     junta com o que veio do X, tira repetidos e diz o que muda para o NIDO.
 * Roda todo dia: o modelo é o mesmo do radar (lib/radar/gerar.ts), barato e
 * bom de pesquisa.
 */
const MODELO = process.env.NOTICIAS_MODEL?.trim() || "claude-haiku-4-5-20251001";
const PRECO = { entrada: 1, saida: 5 } as const;
/** Buscas na web por rodada: uma por alvo, entre 4 e 8 (US$ 0,01 cada + os tokens dos resultados). */
const maxBuscas = (alvos: number) => Math.min(8, Math.max(4, alvos));
const MAX_ITENS = 12;

const PAPEL: Record<Agente, { system: string; oQue: string; impacto: string }> = {
  concorrentes: {
    system:
      "Você é analista de mercado de uma plataforma de influenciadores virtuais. Você acompanha os concorrentes e conta, sem alarde, o que eles fizeram e o que isso significa.",
    oQue: "Novidades dos CONCORRENTES do NIDO: lançamento ou recurso novo, modelo de IA que passaram a oferecer, mudança de preço ou de plano, campanha ou viral, parceria, captação, problema público.",
    impacto:
      "o que isso significa para o NIDO: ameaça, ideia que vale copiar, ou brecha que eles deixaram",
  },
  ias: {
    system:
      "Você é o engenheiro responsável pelas integrações de IA de uma plataforma. Você acompanha os fornecedores e avisa o time do que muda na prática.",
    oQue: "Novidades das IAs que o NIDO USA: modelo novo, mudança de preço ou de limite, recurso novo da API ou da ferramenta, modelo que vai ser desligado, instabilidade. Em cada alvo está escrito para que o NIDO o usa: é isso que diz o que importa.",
    impacto:
      "o que muda para o NIDO na prática: custo, qualidade, algo a migrar ou a testar, ou nada a fazer",
  },
};

const FORMATO = (impacto: string) =>
  `{"itens": [{"alvo": "id do alvo, exatamente como na lista", "titulo": "...", "resumo": "o que aconteceu, 1–2 frases", "impacto": "${impacto}", "fonte": "x" | "site" | "noticia", "url": "https://...", "publicadoEm": "2026-10-13T14:30:00Z", "nota": 1-10}]}`;

export function pedidoNoticias(o: {
  agente: Agente;
  alvos: Alvo[];
  desde: string;
  hoje: string;
  noX: string | null;
  conhecidas: string[];
}): string {
  const papel = PAPEL[o.agente];
  return [
    `Hoje é ${o.hoje}.`,
    "",
    "[QUEM PEDE]",
    "NIDO AI Studio: plataforma brasileira em que criadores e marcas criam e operam influenciadores virtuais (personagem com rosto consistente, imagens, vídeos, voz) e publicam nas redes.",
    "",
    "[O QUE PROCURAR]",
    papel.oQue,
    "",
    "[ALVOS]",
    ...o.alvos.map(
      (a) =>
        `- id "${a.id}": ${a.nome}` +
        (a.uso ? ` · o NIDO usa: ${a.uso}` : "") +
        (a.x.length ? ` · X: ${a.x.map((p) => `@${p}`).join(", ")}` : "") +
        (a.sites.length ? ` · páginas oficiais: ${a.sites.join(", ")}` : ""),
    ),
    "",
    ...(o.noX
      ? ["[O QUE ELES PUBLICARAM NO X — coletado por outra ferramenta]", o.noX, ""]
      : []),
    ...(o.conhecidas.length
      ? [
          "[JÁ REGISTRADAS — não repita]",
          ...o.conhecidas.map((t) => `- ${t}`),
          "",
        ]
      : []),
    "[TAREFA]",
    `Use a busca na web (no máximo ${maxBuscas(o.alvos.length)} buscas) para achar o que cada alvo anunciou de ${o.desde} para cá, nas páginas oficiais e na imprensa.`,
    `Depois escolha até ${MAX_ITENS} novidades, juntando repetidas: o mesmo anúncio no X, no site e numa matéria é UM item só (prefira o link oficial).`,
    "Dê nota de 1 a 10 pela importância para o NIDO: 9–10 = pede decisão ou ação agora; 6–8 = vale saber; abaixo de 6 = curiosidade. Seja rigoroso — na maioria dos dias não há 9.",
    "Não invente fatos, números nem links. Só use URL que veio dos resultados da busca ou do bloco do X. Nada anterior ao período pedido.",
    'Em "publicadoEm" coloque quando foi publicado, como a fonte mostra: ISO 8601 com hora, ou só a data. Deixe de fora se você não viu a data — nunca chute.',
    'Se não houve novidade, responda {"itens": []}. Isso é um resultado normal.',
    "",
    "[SAÍDA]",
    "Depois de pesquisar, responda com UM objeto JSON e nada depois dele:",
    FORMATO(papel.impacto),
    "Escreva os textos em português do Brasil.",
  ].join("\n");
}

const texto = z.preprocess(
  (v) => (Array.isArray(v) ? v.join("; ") : v),
  z.string(),
);
const itemSchema = z.object({
  alvo: texto.optional().default(""),
  titulo: texto,
  resumo: texto.optional().default(""),
  impacto: texto.optional().default(""),
  fonte: z.enum(["x", "site", "noticia"]).catch("noticia"),
  url: z.string().nullish().catch(undefined),
  publicadoEm: z.string().nullish().catch(undefined),
  nota: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number())
    .catch(5),
});
const respostaSchema = z.object({ itens: z.array(itemSchema) });

const semAcento = (t: string) =>
  t
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Lê o JSON da resposta (o último objeto com uma lista "itens") e limpa cada notícia. */
export function lerNoticias(textoFinal: string, alvos: Alvo[]): NoticiaAchada[] {
  const obj = objetosJsonNoTexto(textoFinal)
    .filter(
      (o) =>
        !!o &&
        typeof o === "object" &&
        Array.isArray((o as { itens?: unknown }).itens),
    )
    .at(-1);
  const r = respostaSchema.safeParse(obj);
  if (!r.success)
    throw new AIParseError(
      "As notícias vieram num formato inesperado. Tente de novo.",
    );
  return r.data.itens
    .map((i): NoticiaAchada | null => {
      // O alvo vem pelo id; aceita também o nome ("Higgsfield", "ChatGPT (OpenAI)").
      const dito = semAcento(i.alvo);
      const alvo = alvos.find(
        (a) =>
          dito &&
          (semAcento(a.id) === dito || semAcento(a.nome).startsWith(dito)),
      );
      if (!alvo || !i.titulo.trim()) return null;
      const url =
        i.url && /^https?:\/\/\S+$/.test(i.url.trim())
          ? i.url.trim().slice(0, 500)
          : null;
      return {
        alvo: alvo.id,
        titulo: i.titulo.trim().slice(0, 200),
        resumo: i.resumo.trim().slice(0, 600),
        impacto: i.impacto.trim().slice(0, 500),
        fonte: url && /^https?:\/\/(www\.)?(x|twitter)\.com\//.test(url) ? "x" : i.fonte,
        url,
        publicadoEm: lerPublicadoEm(i.publicadoEm ?? undefined) ?? null,
        nota: Math.min(
          10,
          Math.max(1, Math.round(Number.isFinite(i.nota) ? i.nota : 5)),
        ),
      };
    })
    .filter((i): i is NoticiaAchada => !!i)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, MAX_ITENS);
}

export interface NoticiasPesquisadas {
  itens: NoticiaAchada[];
  /** O X foi consultado e respondeu. */
  usouX: boolean;
  /** Só a parte do Claude (o consumo do Grok vai para o log). */
  usd: number;
}

export async function pesquisarAgente(o: {
  agente: Agente;
  /** Só novidades deste dia para cá (AAAA-MM-DD). */
  desde: string;
  hoje: string;
  /** Títulos das últimas notícias já gravadas (o agente não repete). */
  conhecidas: string[];
}): Promise<NoticiasPesquisadas> {
  const alvos = alvosLidos(o.agente);
  if (!alvos.length) return { itens: [], usouX: false, usd: 0 };
  const noX = await postsDoX({
    perfis: alvos.flatMap((a) => a.x),
    desde: o.desde,
  });
  const papel = PAPEL[o.agente];
  const r = await pesquisarNaWeb({
    modelo: MODELO,
    system: papel.system,
    user: pedidoNoticias({ ...o, alvos, noX: noX?.texto ?? null }),
    maxBuscas: maxBuscas(alvos.length),
  });
  let { entrada, saida } = r;

  let itens: NoticiaAchada[];
  try {
    itens = lerNoticias(r.texto, alvos);
  } catch (e) {
    if (!(e instanceof AIParseError) || !r.texto.trim()) throw e;
    console.warn(
      "[noticias] resposta sem JSON legível; pedindo reemissão. Fim da resposta:",
      r.texto.slice(-300),
    );
    const de = await reemitirJson({
      modelo: MODELO,
      formato: FORMATO(papel.impacto),
      anotacoes: r.texto,
    });
    entrada += de.entrada;
    saida += de.saida;
    itens = lerNoticias(de.texto, alvos);
  }
  return {
    itens,
    usouX: !!noX,
    usd:
      (entrada * PRECO.entrada + saida * PRECO.saida) / 1_000_000 +
      r.buscas * PRECO_BUSCA_WEB,
  };
}
