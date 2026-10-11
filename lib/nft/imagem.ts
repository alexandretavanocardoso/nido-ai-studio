import type { Character } from "@/lib/types";

/**
 * Imagem do personagem que vira a imagem do NFT: o Retrato. Compartilhado entre
 * a tela (prévia) e o servidor (cópia feita no mint).
 *
 * A imagem do NFT é pública, por isso só serve um retrato GERADO: a capa
 * escolhida, se ela for um retrato; senão o retrato mais recente. As
 * referências enviadas pela pessoa e as outras imagens nunca entram. Sem
 * retrato não há imagem, e o mint pede que um seja gerado antes.
 */
export function imagemDoNft(c: Character): string | null {
  const retratos = (c.geradas ?? [])
    .filter((g) => g.tipo === "retrato" && g.key)
    .sort((a, b) => b.createdAt - a.createdAt);
  const capa = c.visual.capaKey || null;
  if (capa && retratos.some((g) => g.key === capa)) return capa;
  return retratos[0]?.key ?? null;
}

/** O personagem tem um retrato gerado (a imagem do NFT)? */
export const temRetrato = (c: Character): boolean => imagemDoNft(c) !== null;
