import type { ItemRadar } from "./tipos";

/**
 * Radar global: os assuntos do dia por nicho, iguais para todo mundo. É montado
 * uma vez por dia pela plataforma (não gasta créditos de ninguém).
 * Vale no cliente e no servidor.
 */
export type IdiomaRadar = "pt" | "en";

export interface NichoGlobal {
  id: string;
  nome: Record<IdiomaRadar, string>;
  /** O que a pesquisa de notícias procura. O primeiro tema também vai para o X. */
  temas: Record<IdiomaRadar, string[]>;
}

export const NICHOS_GLOBAIS: NichoGlobal[] = [
  {
    id: "tecnologia",
    nome: { pt: "Tecnologia", en: "Technology" },
    temas: {
      pt: ["tecnologia", "big techs, aplicativos e gadgets"],
      en: ["technology", "big tech, apps and gadgets"],
    },
  },
  {
    id: "ia",
    nome: { pt: "IA", en: "AI" },
    temas: {
      pt: ["inteligência artificial", "novos modelos e ferramentas de IA"],
      en: ["artificial intelligence", "new AI models and tools"],
    },
  },
  {
    id: "startups",
    nome: { pt: "Startups", en: "Startups" },
    temas: {
      pt: ["startups", "rodadas de investimento e venture capital"],
      en: ["startups", "funding rounds and venture capital"],
    },
  },
  {
    id: "influencer-ia",
    nome: { pt: "Influencer IA", en: "AI Influencers" },
    temas: {
      pt: [
        "influenciadores de IA",
        "influenciadores virtuais e criadores de conteúdo sintético",
      ],
      en: ["AI influencers", "virtual influencers and synthetic creators"],
    },
  },
];

export const nichoGlobal = (id: string | null | undefined) =>
  NICHOS_GLOBAIS.find((n) => n.id === id) ?? null;

export interface RadarGlobal {
  id: string;
  nicho: string;
  idioma: IdiomaRadar;
  /** Dia do radar (AAAA-MM-DD, horário de Brasília). */
  dia: string;
  resumo: string | null;
  itens: ItemRadar[];
  comX: boolean;
  criadoEm: string;
}

/**
 * "Perfil" usado no lugar da ficha de um personagem: o radar global dá nota para
 * qualquer criador que cobre o nicho, e a ideia de post não tem voz de ninguém.
 */
export function perfilDoNicho(n: NichoGlobal, idioma: IdiomaRadar): string {
  const nome = n.nome[idioma];
  return idioma === "en"
    ? [
        `- Who: any content creator who covers ${nome} on social media (not one specific person)`,
        `- Niche: ${nome}`,
        `- Audience: people who follow ${nome} and want to know what is new today`,
        "- Post ideas: neutral and easy to adapt — no personal voice, catchphrases or opinions of a specific creator",
        `- In the summary, talk about the niche ("for anyone covering ${nome}"), never about "the character"`,
      ].join("\n")
    : [
        `- Quem é: qualquer criador de conteúdo que cobre ${nome} nas redes (não é uma pessoa específica)`,
        `- Nicho: ${nome}`,
        `- Público: gente que acompanha ${nome} e quer saber o que há de novo hoje`,
        "- Ideias de post: neutras e fáceis de adaptar — sem voz própria, bordões ou opiniões de um criador específico",
        `- No resumo, fale do nicho ("para quem cobre ${nome}"), nunca de "o personagem"`,
      ].join("\n");
}

/** Idiomas em que o radar global é montado todo dia (RADAR_GLOBAL_IDIOMAS; padrão: pt e en). */
export function idiomasDoRadarGlobal(
  env: string | undefined = process.env.RADAR_GLOBAL_IDIOMAS,
): IdiomaRadar[] {
  const lista = (env ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is IdiomaRadar => s === "pt" || s === "en");
  return lista.length ? [...new Set(lista)] : ["pt", "en"];
}
