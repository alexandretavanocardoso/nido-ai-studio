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
  /**
   * Quando a notícia ou o post foi publicado, como a fonte mostra: data e hora
   * (ISO 8601) ou só a data (AAAA-MM-DD). Ausente se a pesquisa não achou.
   */
  publicadoEm?: string;
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

const DATA_ISO =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Data de publicação válida (ISO, com ou sem hora) ou undefined. */
export function lerPublicadoEm(v: string | undefined): string | undefined {
  const t = (v ?? "").trim().replace(" ", "T");
  return DATA_ISO.test(t) && !Number.isNaN(Date.parse(t)) ? t : undefined;
}

/** Início da contagem de tempo dos ids do X (ms). */
const EPOCA_DO_X = BigInt(1288834974657);

/**
 * Quando o item foi publicado. Post do X: a hora exata está no próprio id do
 * link (vale até para radares antigos). Notícia: o que a pesquisa informou —
 * às vezes só o dia (`comHora` = false).
 */
export function quandoPublicado(
  i: Pick<ItemRadar, "url" | "publicadoEm">,
): { data: Date; comHora: boolean } | null {
  const id = i.url?.match(
    /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d{15,20})/,
  )?.[1];
  if (id)
    return {
      data: new Date(Number((BigInt(id) >> BigInt(22)) + EPOCA_DO_X)),
      comHora: true,
    };
  const iso = lerPublicadoEm(i.publicadoEm);
  if (!iso) return null;
  const comHora = iso.includes("T");
  // Só o dia: meio-dia local, pra não virar a véspera em nenhum fuso.
  return { data: new Date(comHora ? iso : `${iso}T12:00:00`), comHora };
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
