import { FERRAMENTAS, type Ferramenta } from "./ferramentas";
import { MAIS_FERRAMENTAS } from "./ferramentas-mais";

/** Todas as ferramentas do MCP, na ordem em que aparecem para o cliente. */
export const TODAS: Ferramenta[] = [...FERRAMENTAS, ...MAIS_FERRAMENTAS];

export const ferramentaPorNome = (nome: string) =>
  TODAS.find((f) => f.name === nome) ?? null;
