import { z } from "zod";
import {
  AIParseError,
  AIProviderError,
  getClient,
  mensagemAnthropic,
  PRECO_TEXTO,
} from "@/lib/ai/anthropic";
import { objetosJsonNoTexto } from "@/lib/radar/gerar";
import {
  CATEGORIAS,
  type Categoria,
  type EmpresaAchada,
  type Fonte,
} from "./tipos";

/**
 * Agente que procura fornecedores de IA de uma categoria (vídeo, imagem ou
 * voz): o Claude pesquisa com a busca na web oficial da Anthropic, em chinês e
 * em inglês, e devolve uma ficha por empresa, com as fontes.
 *
 * Roda uma vez por semana e é lido por quem vai negociar: aqui vale o modelo
 * principal (o Haiku do radar diário acha menos e confere pior o que é API de
 * verdade). O preço abaixo é o do modelo padrão; se FORNECEDORES_MODEL apontar
 * para outro, o custo gravado fica aproximado.
 */
const MODELO = process.env.FORNECEDORES_MODEL?.trim() || "claude-sonnet-5-5";
/** Buscas na web por categoria (US$ 0,01 cada + os tokens dos resultados). */
const MAX_BUSCAS = 6;
const MAX_EMPRESAS = 8;
const PRECO_BUSCA = 0.01;

/** O que cada categoria quer dizer para o NIDO, e termos de busca em chinês. */
const ALVO: Record<Categoria, { oQue: string; emChines: string }> = {
  video: {
    oQue: "geração de vídeo por IA: texto ou imagem para vídeo, avatar que fala (lip-sync), troca de pessoa em vídeo, vídeo com personagem consistente",
    emChines: "视频生成 大模型 API、图生视频 开放平台、数字人 口型同步 API、AI视频 企业服务",
  },
  imagem: {
    oQue: "geração e edição de imagem por IA: texto para imagem, edição com imagem de referência, personagem consistente entre fotos, troca de rosto",
    emChines: "文生图 大模型 API、图像生成 开放平台、人物一致性 图像编辑 API",
  },
  voz: {
    oQue: "voz por IA: texto para fala (TTS), clonagem de voz, vozes em português do Brasil, dublagem",
    emChines: "语音合成 API、声音克隆 开放平台、多语种 TTS 大模型",
  },
};

/** Fornecedores e modelos que o NIDO já usa: não são novidade. */
const JA_USAMOS =
  "fal.ai, Runway, ElevenLabs, Google (Gemini / Nano Banana), OpenAI (GPT Image), BytePlus / ByteDance (Seedance, Seedream), Kling (Kuaishou), Flux (Black Forest Labs)";

export function pedidoFornecedores(o: {
  categoria: Categoria;
  conhecidas: string[];
  hoje: string;
}): string {
  const alvo = ALVO[o.categoria];
  return [
    `Hoje é ${o.hoje}.`,
    "",
    "[QUEM PEDE]",
    "NIDO AI Studio: plataforma brasileira em que criadores e marcas criam e operam influenciadores virtuais (personagem com rosto consistente, imagens, vídeos, voz) e publicam nas redes. Compramos geração de IA por API e revendemos em créditos.",
    "Procuramos empresas com quem valha a pena conversar direto para fechar algo melhor que a tabela pública: preço por volume, acesso antecipado a modelos, exclusividade ou revenda na América Latina.",
    "",
    "[CATEGORIA DESTA PESQUISA]",
    alvo.oQue,
    "",
    "[JÁ USAMOS — não liste]",
    JA_USAMOS,
    ...(o.conhecidas.length
      ? ["", "[JÁ ESTÃO NA NOSSA LISTA — não repita, procure outras]", o.conhecidas.join(", ")]
      : []),
    "",
    "[TAREFA]",
    `Use a busca na web (no máximo ${MAX_BUSCAS} buscas) para achar até ${MAX_EMPRESAS} empresas desta categoria.`,
    `Prioridade para a China: faça a maior parte das buscas em chinês (por exemplo: ${alvo.emChines}) e, havendo boas opções, pelo menos metade da lista deve ser de empresas chinesas. Complete com outros países (Coreia, Japão, Singapura, Índia, Europa, Israel, EUA), buscando em inglês.`,
    "Prefira empresa que tem modelo próprio e vende por API ou plataforma para empresas. Revendedor de modelo dos outros, aplicativo só para consumidor e projeto sem empresa por trás valem pouco.",
    "Dê nota de 1 a 10 pela chance de virar um bom acordo para o NIDO: 9–10 = modelo forte, API aberta a empresas de fora da China e sinal de que fecha parceria; 6–8 = promissora, com alguma dúvida; abaixo de 6 = ligação fraca. Seja rigoroso.",
    'Não invente nada. Preço só o que a fonte mostra (senão deixe "preco" de fora). Em "api" responda "sim" só se você viu documentação ou página da API; "nao" se viu que não tem; "incerto" no resto.',
    'Em "linkedin" coloque a página da EMPRESA no LinkedIn só se o endereço apareceu nos resultados; nunca monte o endereço de cabeça. Em "pessoas" liste nomes e cargos de fundadores ou de quem cuida de parcerias e vendas, só se estavam públicos nas fontes.',
    'Em "fontes" coloque de 1 a 3 páginas que você realmente abriu nos resultados e que sustentam a ficha.',
    "",
    "[SAÍDA]",
    "Depois de pesquisar, responda com UM objeto JSON e nada depois dele:",
    '{"empresas": [{"nome": "nome em inglês (nome em chinês, se tiver)", "pais": "...", "categorias": ["video" | "imagem" | "voz"], "oferece": "o que vende, 1–2 frases", "api": "sim" | "nao" | "incerto", "preco": "como a fonte mostra", "site": "https://...", "linkedin": "https://www.linkedin.com/company/...", "pessoas": "Nome (cargo); Nome (cargo)", "porque": "por que interessa ao NIDO, 1–2 frases", "nota": 1-10, "fontes": [{"titulo": "...", "url": "https://..."}]}]}',
    "Escreva os textos em português do Brasil.",
  ].join("\n");
}

const texto = z.preprocess(
  (v) => (Array.isArray(v) ? v.join("; ") : v),
  z.string(),
);
const opcional = texto.nullish().catch(undefined);
const empresaSchema = z.object({
  nome: texto,
  pais: opcional,
  categorias: z.array(z.string()).catch([]),
  oferece: texto.optional().default(""),
  api: z.enum(["sim", "nao", "incerto"]).catch("incerto"),
  preco: opcional,
  site: opcional,
  linkedin: opcional,
  pessoas: opcional,
  porque: texto.optional().default(""),
  nota: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number())
    .catch(5),
  fontes: z
    .array(z.object({ titulo: texto.optional().default(""), url: z.string() }))
    .catch([]),
});
const respostaSchema = z.object({ empresas: z.array(empresaSchema) });

const FORMATO_INESPERADO =
  "A pesquisa de fornecedores veio num formato inesperado. Tente de novo.";

const url = (v: string | null | undefined) =>
  v && /^https?:\/\/\S+$/.test(v.trim()) ? v.trim().slice(0, 300) : null;
const curto = (v: string | null | undefined, max: number) =>
  v?.trim().slice(0, max) || null;

/** Lê o JSON da resposta (o último objeto com uma lista "empresas") e limpa cada ficha. */
export function lerEmpresas(
  textoFinal: string,
  categoria: Categoria,
): EmpresaAchada[] {
  const obj = objetosJsonNoTexto(textoFinal)
    .filter(
      (o) =>
        !!o &&
        typeof o === "object" &&
        Array.isArray((o as { empresas?: unknown }).empresas),
    )
    .at(-1);
  const r = respostaSchema.safeParse(obj);
  if (!r.success) throw new AIParseError(FORMATO_INESPERADO);
  return r.data.empresas
    .filter((e) => e.nome.trim())
    .map((e) => {
      const categorias = CATEGORIAS.filter((c) => e.categorias.includes(c));
      const linkedin = url(e.linkedin);
      return {
        nome: e.nome.trim().slice(0, 120),
        pais: curto(e.pais, 60),
        // A categoria pesquisada sempre entra: foi por ela que a empresa apareceu.
        categorias: categorias.includes(categoria)
          ? categorias
          : [...categorias, categoria],
        oferece: e.oferece.trim().slice(0, 600),
        api: e.api,
        preco: curto(e.preco, 300),
        site: url(e.site),
        linkedin: linkedin && /linkedin\.com\//i.test(linkedin) ? linkedin : null,
        pessoas: curto(e.pessoas, 400),
        porque: e.porque.trim().slice(0, 600),
        nota: Math.min(
          10,
          Math.max(1, Math.round(Number.isFinite(e.nota) ? e.nota : 5)),
        ),
        fontes: e.fontes
          .map((f): Fonte | null => {
            const u = url(f.url);
            return u ? { titulo: f.titulo.trim().slice(0, 160) || u, url: u } : null;
          })
          .filter((f): f is Fonte => !!f)
          .slice(0, 3),
      };
    })
    .sort((a, b) => b.nota - a.nota)
    .slice(0, MAX_EMPRESAS);
}

export interface PesquisaFeita {
  empresas: EmpresaAchada[];
  custo: { entrada: number; saida: number; buscas: number; usd: number };
}

export async function pesquisarCategoria(o: {
  categoria: Categoria;
  /** Nomes das empresas que já estão na lista (o agente procura outras). */
  conhecidas: string[];
  hoje: string;
}): Promise<PesquisaFeita> {
  const client = getClient();
  const tools = [
    { type: "web_search_20250305", name: "web_search", max_uses: MAX_BUSCAS },
  ];
  const mensagens: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: pedidoFornecedores(o) },
  ];
  let entrada = 0;
  let saida = 0;
  let buscas = 0;
  let textoFinal = "";
  const somar = (uso: {
    input_tokens?: number;
    output_tokens?: number;
    server_tool_use?: { web_search_requests?: number };
  }) => {
    entrada += uso?.input_tokens ?? 0;
    saida += uso?.output_tokens ?? 0;
    buscas += uso?.server_tool_use?.web_search_requests ?? 0;
  };
  const textoDe = (content: Array<{ type: string; text?: string }>) =>
    content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("");
  try {
    // A busca roda no servidor da Anthropic; uma resposta longa pode vir em pedaços (pause_turn).
    for (let volta = 0; volta < 4; volta++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages.create({
        model: MODELO,
        max_tokens: 8000,
        system:
          "Você é um analista de parcerias de uma plataforma de IA generativa. Você descobre fornecedores pouco conhecidos, confere o que eles realmente vendem e julga, com rigor, com quem vale a pena negociar.",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: mensagens as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: tools as any,
      });
      somar(res.usage);
      textoFinal = textoDe(res.content);
      if (res.stop_reason !== "pause_turn") break;
      mensagens.push({ role: "assistant", content: res.content });
    }
  } catch (e) {
    throw new AIProviderError(e, mensagemAnthropic(e));
  }

  let empresas: EmpresaAchada[];
  try {
    empresas = lerEmpresas(textoFinal, o.categoria);
  } catch (e) {
    if (!(e instanceof AIParseError) || !textoFinal.trim()) throw e;
    // A pesquisa já foi paga: em vez de jogar fora, pede só o JSON do que ela achou.
    console.warn(
      "[fornecedores] resposta sem JSON legível; pedindo reemissão. Fim da resposta:",
      textoFinal.slice(-300),
    );
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await client.messages.create({
        model: MODELO,
        max_tokens: 8000,
        system:
          "Você converte anotações de pesquisa em JSON. Responda APENAS com o objeto JSON pedido, sem texto em volta, sem Markdown.",
        messages: [
          {
            role: "user",
            content:
              "Estas são as anotações de uma pesquisa de fornecedores. Devolva o mesmo conteúdo neste formato, sem inventar nada e sem acrescentar empresas:\n" +
              '{"empresas": [{"nome": "...", "pais": "...", "categorias": ["video" | "imagem" | "voz"], "oferece": "...", "api": "sim" | "nao" | "incerto", "preco": "...", "site": "https://...", "linkedin": "https://...", "pessoas": "...", "porque": "...", "nota": 1-10, "fontes": [{"titulo": "...", "url": "https://..."}]}]}\n\n[ANOTAÇÕES]\n' +
              textoFinal.slice(0, 24_000),
          },
        ],
      });
      somar(res.usage);
      empresas = lerEmpresas(textoDe(res.content), o.categoria);
    } catch (erro) {
      if (erro instanceof AIParseError) throw erro;
      throw new AIProviderError(erro, mensagemAnthropic(erro));
    }
  }

  return {
    empresas,
    custo: {
      entrada,
      saida,
      buscas,
      usd:
        (entrada * PRECO_TEXTO.entrada + saida * PRECO_TEXTO.saida) / 1_000_000 +
        buscas * PRECO_BUSCA,
    },
  };
}
