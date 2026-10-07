/**
 * Idioma em que a IA escreve: vem do cookie "nido-idioma", que o navegador
 * grava quando o usuário troca o idioma da interface.
 */
export type IdiomaIA = "pt" | "en";

export function idiomaDoPedido(req: Request): IdiomaIA {
  const cookie = req.headers.get("cookie") ?? "";
  return /(?:^|;\s*)nido-idioma=en(?:;|$)/.test(cookie) ? "en" : "pt";
}

/** Trecho somado ao system prompt quando o texto gerado deve sair em inglês. */
export function instrucaoIdioma(idioma: IdiomaIA | undefined): string {
  if (idioma !== "en") return "";
  return (
    "\n\nOUTPUT LANGUAGE: write every piece of generated text (values, captions, scripts, suggestions, explanations) " +
    "in natural, fluent English, even though these instructions and the character profile may be in Portuguese. " +
    "This overrides any earlier instruction to write in Portuguese (pt-BR). " +
    "Keep JSON keys, ids and enum values exactly as specified — only the human-readable text goes in English."
  );
}
