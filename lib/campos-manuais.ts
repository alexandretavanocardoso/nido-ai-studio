/**
 * Campos que só a pessoa preenche: a IA nunca sugere, regenera nem expande
 * (o nome do personagem é decisão do criador). Vale no cliente e no servidor.
 */
export const CAMPOS_MANUAIS = [
  "identidade.nome",
  "identidade.nomeExtenso",
] as const;

export const ehCampoManual = (fieldId: string): boolean =>
  (CAMPOS_MANUAIS as readonly string[]).includes(fieldId);

/** Trecho dos prompts: a IA usa o nome que existe, sem inventar outro. */
export const REGRA_NOME =
  "O NOME do personagem é escolhido pelo usuário: NUNCA invente, sugira ou altere o nome (nem o nome por extenso). Não devolva os campos identidade.nome e identidade.nomeExtenso. Se a ficha já tiver nome, use-o como está; se não tiver, refira-se a ele como “o personagem”.";
