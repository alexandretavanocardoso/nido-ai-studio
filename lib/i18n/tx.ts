import { TEXTOS_EN } from "./textos-en";

/**
 * Tradução por texto: tx("Salvar") devolve o texto no idioma ativo.
 * Sem tradução cadastrada, devolve o próprio português.
 * O idioma ativo é definido por <ComIdioma>, que remonta a árvore quando ele muda.
 */
export type IdiomaAtivo = "pt" | "en";

let idiomaAtivo: IdiomaAtivo = "pt";

export function definirIdiomaAtivo(i: IdiomaAtivo) {
  idiomaAtivo = i;
}

export function idiomaAtual(): IdiomaAtivo {
  return idiomaAtivo;
}

export function tx(pt: string): string {
  if (idiomaAtivo === "pt" || !pt) return pt;
  const chave = pt.replace(/\s+/g, " ").trim();
  const en = TEXTOS_EN[chave];
  if (!en) return pt;
  const inicio = pt.match(/^\s*/)![0] ? " " : "";
  const fim = pt.match(/\s*$/)![0] ? " " : "";
  return inicio + en + fim;
}
