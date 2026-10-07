import type { Character } from "@/lib/types";

/**
 * Radar: o que está acontecendo hoje nos temas do personagem — notícias (busca
 * na web do Claude) e, com XAI_API_KEY, o que está em alta no X (Grok).
 * Vale no cliente e no servidor.
 */
export interface ItemRadar {
  titulo: string;
  /** O que aconteceu, em 1–2 frases. */
  resumo: string;
  /** Por que isso importa para ESTE personagem. */
  porque: string;
  /** Ideia de post na linha do personagem. */
  ideia: string;
  fonte: "noticia" | "x";
  /** Nome do veículo ou do perfil. */
  origem?: string;
  url?: string;
  /** Relevância para o personagem, de 1 a 10. */
  nota: number;
  /** Comunicado, conteúdo patrocinado ou texto de empresa vendendo algo (não é notícia). */
  promocional?: boolean;
}

export type StatusRadar = "ok" | "sem_creditos" | "erro";

export interface Radar {
  id: string;
  characterId: string;
  /** Dia do radar (AAAA-MM-DD, horário de Brasília). */
  dia: string;
  status: StatusRadar;
  resumo: string | null;
  itens: ItemRadar[];
  temas: string[];
  comX: boolean;
  vistoEm: string | null;
  criadoEm: string;
}

/** A partir desta nota o item é "destaque" e vira aviso (9–10 = quente hoje e no centro do nicho). */
export const NOTA_DESTAQUE = 9;
export const MAX_TEMAS = 6;

export const destaques = (r: Pick<Radar, "itens">) =>
  r.itens.filter((i) => i.nota >= NOTA_DESTAQUE);

/** Temas do radar: os que o usuário digitou + o nicho e o subnicho da ficha. */
export function temasDoPersonagem(
  c: Pick<Character, "nicho" | "radar">,
): string[] {
  const vistos = new Set<string>();
  return [...(c.radar?.temas ?? []), c.nicho?.principal, c.nicho?.subnicho]
    .map((t) => (t ?? "").trim())
    .filter((t) => {
      const k = t.toLowerCase();
      if (!t || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, MAX_TEMAS);
}

/** Dia de hoje em Brasília (AAAA-MM-DD) — o radar é "um por dia" nesse fuso. */
export function diaDeHoje(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}
