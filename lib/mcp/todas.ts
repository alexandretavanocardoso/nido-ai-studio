import { FERRAMENTAS, type Ferramenta } from "./ferramentas";
import { MAIS_FERRAMENTAS } from "./ferramentas-mais";
import { FERRAMENTAS_MOTION } from "./ferramentas-motion";
import { FERRAMENTAS_PRODUTO } from "./ferramentas-produto";

/** Todas as ferramentas do MCP, na ordem em que aparecem para o cliente. */
export const TODAS: Ferramenta[] = [
  ...FERRAMENTAS,
  ...MAIS_FERRAMENTAS,
  ...FERRAMENTAS_PRODUTO,
  ...FERRAMENTAS_MOTION,
];

export const ferramentaPorNome = (nome: string) =>
  TODAS.find((f) => f.name === nome) ?? null;
