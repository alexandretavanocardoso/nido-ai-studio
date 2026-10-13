/** Notícias do admin: o que o cliente e o servidor compartilham. */

export const AGENTES = ["concorrentes", "ias"] as const;
export type Agente = (typeof AGENTES)[number];
export const NOME_AGENTE: Record<Agente, string> = {
  concorrentes: "Concorrentes",
  ias: "IAs que usamos",
};

export interface Alvo {
  id: string;
  nome: string;
  /** Perfis no X, sem @. Vazio = não é lido no X. */
  x: string[];
  /** Páginas oficiais onde saem as novidades (blog, changelog). */
  sites: string[];
  /** Para que o NIDO usa (entra no pedido: é o que diz o que importa). */
  uso?: string;
}

/**
 * Quem cada agente acompanha. Para acompanhar mais alguém, é só acrescentar
 * aqui (no máximo 10 perfis do X por agente: é o limite da busca do Grok, e
 * cada perfil é uma busca paga por dia).
 */
export const ALVOS: Record<Agente, Alvo[]> = {
  concorrentes: [
    {
      id: "higgsfield",
      nome: "Higgsfield",
      x: ["higgsfield_ai"],
      sites: ["https://higgsfield.ai"],
    },
    { id: "real-oficial", nome: "Real Oficial", x: ["acgfbr"], sites: [] },
  ],
  ias: [
    {
      id: "chatgpt",
      nome: "ChatGPT (OpenAI)",
      x: ["OpenAI"],
      sites: ["https://openai.com/news"],
      uso: "GPT Image para gerar imagens",
    },
    {
      id: "claude-code",
      nome: "Claude Code (Anthropic)",
      x: ["claudeai"],
      sites: [
        "https://www.anthropic.com/news",
        "https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md",
      ],
      uso: "API do Claude para todo o texto do app; Claude Code no desenvolvimento",
    },
    {
      id: "grok",
      nome: "Grok (xAI)",
      x: ["xai"],
      sites: ["https://x.ai/news"],
      uso: "busca no X do radar e destes agentes",
    },
    // As que geram o produto: preço novo ou modelo desligado aqui muda o custo e o que o app entrega.
    {
      id: "fal",
      nome: "fal.ai",
      x: ["fal"],
      sites: ["https://fal.ai"],
      uso: "hospeda Seedream, Flux, Kling e Seedance; quase toda imagem e a troca de pessoa em vídeo passam por ele",
    },
    {
      id: "kling",
      nome: "Kling (Kuaishou)",
      x: ["Kling_ai"],
      sites: ["https://klingai.com"],
      uso: "Kling O3: motor padrão da troca de pessoa em vídeo",
    },
    {
      id: "seedance",
      nome: "Seedance / Seedream (ByteDance)",
      x: ["BytePlusGlobal"],
      sites: ["https://www.byteplus.com", "https://seed.bytedance.com"],
      uso: "Seedance: motor premium de vídeo; Seedream: modelo de imagem",
    },
    {
      id: "runway",
      nome: "Runway",
      x: ["runwayml"],
      sites: ["https://runwayml.com"],
      uso: "API usada no Criar vídeo (Veo)",
    },
    {
      id: "elevenlabs",
      nome: "ElevenLabs",
      x: ["ElevenLabs"],
      sites: ["https://elevenlabs.io/blog"],
      uso: "vozes e fala dos personagens",
    },
    {
      id: "gemini",
      nome: "Gemini / Nano Banana (Google)",
      x: ["googleaidevs"],
      sites: ["https://ai.google.dev/gemini-api/docs/changelog"],
      uso: "Nano Banana para imagem e Gemini na API",
    },
  ],
};

/** Alvos que o agente consegue ler (têm perfil no X ou site). */
export const alvosLidos = (agente: Agente) =>
  ALVOS[agente].filter((a) => a.x.length || a.sites.length);

export type FonteNoticia = "x" | "site" | "noticia";
export const NOME_FONTE: Record<FonteNoticia, string> = {
  x: "X",
  site: "Site oficial",
  noticia: "Imprensa",
};

/** O que a pesquisa devolve de cada notícia. */
export interface NoticiaAchada {
  alvo: string;
  titulo: string;
  resumo: string;
  impacto: string;
  fonte: FonteNoticia;
  url: string | null;
  publicadoEm: string | null;
  nota: number;
}

export interface Noticia extends NoticiaAchada {
  id: string;
  agente: Agente;
  criadoEm: string;
}

export interface NoticiasAdmin {
  itens: Noticia[];
  /** Quando o agente rodou pela última vez com sucesso (null = nunca). */
  ultimaBusca: string | null;
  /** O X está configurado neste deploy (XAI_API_KEY). */
  comX: boolean;
}

export interface ResumoNoticias {
  achados: number;
  novos: number;
  usd: number;
  /** Agentes que leram o X nesta rodada. */
  usouX: Agente[];
  falhas: Array<{ agente: Agente; erro: string }>;
}

/**
 * Identidade da notícia para não gravar a mesma duas vezes: o post do X pelo
 * id; outra página pelo endereço sem parâmetros; sem link, o título.
 */
export function chaveNoticia(titulo: string, url: string | null): string {
  if (url) {
    const post = url.match(
      /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/,
    )?.[1];
    if (post) return `x:${post}`;
    try {
      const u = new URL(url);
      return (
        u.hostname.toLowerCase().replace(/^www\./, "") +
        u.pathname.replace(/\/+$/, "").toLowerCase()
      );
    } catch {
      /* link ilegível: cai no título */
    }
  }
  return titulo
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}
