import { GERAR_DA_IMAGEM } from "@/data/prompts/gerar-da-imagem";
import { montarEsqueleto, montarPerguntas } from "@/lib/prompts/gerar-no-claude";

const IDEIA_VAZIA = "(Sem anotações extras — baseie tudo no que você vê na imagem.)";

export function buildPromptFromImage(ideia: string): string {
  const valores: Record<string, string> = {
    ideia: ideia.trim() || IDEIA_VAZIA,
    perguntas: montarPerguntas(),
    esqueleto: montarEsqueleto(),
  };
  return GERAR_DA_IMAGEM.replace(
    /\{\{(ideia|perguntas|esqueleto)\}\}/g,
    (_, k: string) => valores[k]
  );
}
