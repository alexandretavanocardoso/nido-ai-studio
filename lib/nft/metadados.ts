import { createHash } from "node:crypto";
import type { Character } from "@/lib/types";
import { BADGES, ESCADAS, METRICAS_BADGE, type Totais } from "./badges";

/**
 * O que o NFT do influencer mostra. Na rede ficam só o nome, o hash da ficha e
 * os badges; o resto (capa, bio, traços) sai daqui, servido pelo app em
 * /api/nft/meta/<asset> — e por isso pode ser esvaziado se o personagem for
 * apagado. Nada privado entra: modelo treinado, voz, prompts, referências e
 * declarações ficam de fora.
 */

/** Nome gravado na rede (carteiras cortam nomes longos; 32 é o costume). */
export const MAX_NOME_NA_REDE = 32;

export function nomeNaRede(c: Character): string {
  return Array.from(c.identidade.nome.trim()).slice(0, MAX_NOME_NA_REDE).join("");
}

/** JSON com as chaves em ordem alfabética, para o mesmo conteúdo dar sempre o mesmo texto. */
function emOrdem(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(emOrdem);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, emOrdem(x)]),
    );
  return v;
}

/**
 * A ficha como entra no hash: as seis seções escritas pela pessoa, sem
 * arquivos (referências, capa) e sem os metadados de IA. Prova o que era a
 * ficha no dia do mint sem publicar a ficha.
 */
export function fichaCanonica(c: Character): string {
  const { referencias: _r, capaKey: _c, ...visual } = c.visual;
  return JSON.stringify(
    emOrdem({
      identidade: c.identidade,
      visual,
      soul: c.soul,
      nicho: c.nicho,
      voz: c.voz,
      monetizacao: c.monetizacao,
    }),
  );
}

/** SHA-256 (hex) da ficha canônica. */
export function hashDaFicha(c: Character): string {
  return createHash("sha256").update(fichaCanonica(c), "utf8").digest("hex");
}

interface Traco {
  trait_type: string;
  value: string | number;
  display_type?: "number";
}

export interface MetadadosNft {
  name: string;
  symbol: string;
  description: string;
  image?: string;
  external_url: string;
  attributes: Traco[];
  properties?: {
    category: "image";
    files: Array<{ uri: string; type: string }>;
  };
}

const curto = (s: string | undefined, max: number): string =>
  Array.from((s ?? "").replace(/\s+/g, " ").trim()).slice(0, max).join("");

/**
 * Metadados do NFT (formato da Metaplex). `personagem` null = o personagem foi
 * apagado no app: o NFT continua existindo, sem capa nem bio.
 */
export function metadadosDoNft(o: {
  base: string;
  asset: string;
  /** Nome gravado na rede. */
  nome: string;
  personagem: Character | null;
  temCapa: boolean;
  /** Ids dos badges que valem, e o total de cada métrica. */
  badges: string[];
  totais: Partial<Totais>;
  mintadoEm: Date | null;
}): MetadadosNft {
  const c = o.personagem;
  const tracos: Traco[] = [{ trait_type: "Synthetic", value: "Yes" }];
  const traco = (nome: string, valor: string | undefined, max = 60) => {
    const v = curto(valor, max);
    if (v) tracos.push({ trait_type: nome, value: v });
  };
  if (c) {
    traco("Niche", c.nicho.principal);
    traco("Archetype", c.soul.arquetipo);
    traco("Form", c.identidade.forma);
    traco("Style", c.visual.estilo ?? "realista");
    traco("Language", c.identidade.idioma);
  } else {
    tracos.push({ trait_type: "Status", value: "Archived" });
  }
  if (o.mintadoEm)
    tracos.push({
      trait_type: "Minted",
      value: o.mintadoEm.toISOString().slice(0, 10),
    });

  // Por métrica: o total e o badge mais alto. A lista completa de badges fica
  // gravada no próprio NFT; aqui vai o resumo que carteiras e explorers mostram.
  const conquistados = BADGES.filter((b) => o.badges.includes(b.id));
  for (const m of METRICAS_BADGE) {
    const e = ESCADAS[m];
    const total = Math.round(o.totais[m] ?? 0);
    if (total > 0)
      tracos.push({ trait_type: e.tituloEn, value: total, display_type: "number" });
    const maior = conquistados.filter((b) => b.metrica === m).at(-1);
    if (maior)
      tracos.push({ trait_type: `${e.tituloEn} badge`, value: maior.rotulo });
  }
  if (conquistados.length)
    tracos.push({
      trait_type: "Badges",
      value: conquistados.length,
      display_type: "number",
    });

  const imagem =
    c && o.temCapa ? `${o.base}/api/nft/meta/${o.asset}/imagem` : undefined;
  return {
    name: o.nome,
    symbol: "NIDO",
    description: c
      ? curto(c.identidade.bio, 500) ||
        "Influencer sintético criado no NIDO AI Studio."
      : "Influencer arquivado no NIDO AI Studio.",
    ...(imagem ? { image: imagem } : {}),
    external_url: o.base,
    attributes: tracos,
    ...(imagem
      ? {
          properties: {
            category: "image",
            files: [{ uri: imagem, type: "image/jpeg" }],
          },
        }
      : {}),
  };
}

/** Metadados da coleção. */
export function metadadosDaColecao(base: string): MetadadosNft {
  return {
    name: "NIDO Influencers",
    symbol: "NIDO",
    description:
      "Influencers sintéticos criados no NIDO AI Studio. Cada NFT é intransferível e carrega os badges que o influencer conquistou.",
    image: `${base}/logo/NIDO%20AI%20STUDIO.png`,
    external_url: base,
    attributes: [],
  };
}
