import type { Character } from "@/lib/types";
import {
  IMAGEM_FLUX,
  IMAGEM_MIDJOURNEY,
  IMAGEM_NEUTRO,
  RETRATO_FLUX,
  RETRATO_MIDJOURNEY,
  RETRATO_NEUTRO,
  TROCAS_3D,
} from "@/data/prompts/gerar-imagem";

export type FormatoImagem = "neutro" | "midjourney" | "flux";
export type TipoImagem = "retrato" | "referencia";

export interface PromptImagem {
  formato: FormatoImagem;
  nome: string;
  descricaoCurta: string;
  gerador: string;
  prompt: string;
}

/**
 * Monta o prompt de imagem no formato pedido, usando os campos visuais da
 * ficha. Qualquer campo vazio é omitido naturalmente. Com visual.estilo
 * "3d", os blocos de render fotográfico viram render 3D (TROCAS_3D).
 */
export function buildImagePrompt(
  c: Character,
  formato: FormatoImagem,
  tipo: TipoImagem = "referencia",
): string {
  const nome = c.identidade.nome?.trim() || "the character";
  const descricao = extractDescricaoVisual(c, formato);
  const negativos = extractNegativos(c, formato);

  const template =
    tipo === "retrato"
      ? formato === "midjourney"
        ? RETRATO_MIDJOURNEY
        : formato === "flux"
        ? RETRATO_FLUX
        : RETRATO_NEUTRO
      : formato === "midjourney"
      ? IMAGEM_MIDJOURNEY
      : formato === "flux"
      ? IMAGEM_FLUX
      : IMAGEM_NEUTRO;

  const base =
    c.visual.estilo === "3d"
      ? TROCAS_3D[formato].reduce((t, [de, para]) => t.split(de).join(para), template)
      : template;

  return base
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{descricao\}\}/g, descricao)
    .replace(/\{\{negativos\}\}/g, negativos);
}

export function buildAllImagePrompts(
  c: Character,
  tipo: TipoImagem = "referencia",
): PromptImagem[] {
  return [
    {
      formato: "neutro",
      nome: "Neutro",
      descricaoCurta: "Para ChatGPT, Nano Banana, Gemini — linguagem natural rica em detalhes.",
      gerador: "ChatGPT · Gemini · Nano Banana",
      prompt: buildImagePrompt(c, "neutro", tipo),
    },
    {
      formato: "midjourney",
      nome: "Midjourney",
      descricaoCurta: "Compacto, com --ar, --style raw, --v 6.1 e --no.",
      gerador: "Midjourney v6+",
      prompt: buildImagePrompt(c, "midjourney", tipo),
    },
    {
      formato: "flux",
      nome: "Flux / SD",
      descricaoCurta: "Positive + Negative separados, para Flux, Stable Diffusion, DALL·E.",
      gerador: "Flux · Stable Diffusion · DALL·E",
      prompt: buildImagePrompt(c, "flux", tipo),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Descrição do personagem a partir da ficha                            */
/* ------------------------------------------------------------------ */

/**
 * Extrai um parágrafo descritivo dos campos visuais da ficha, com algumas
 * cores do nicho/soul (idade, gênero, vibe) para calibrar o rosto e o porte.
 * Formato pode mudar levemente conforme o template (Midjourney gosta de
 * descrições em frases curtas separadas por vírgulas; neutro/flux aceitam
 * prosa mais rica).
 */
export function extractDescricaoVisual(c: Character, formato: FormatoImagem): string {
  const ideia = c.visual.ideiaLivre?.trim();

  // Partes vindas dos campos da ficha
  const partes: string[] = [];

  const basicos: string[] = [];
  if (c.identidade.genero) basicos.push(labelGenero(c.identidade.genero));
  if (c.identidade.idadeAparente) basicos.push(c.identidade.idadeAparente);
  if (c.identidade.forma && c.identidade.forma !== "humano") {
    basicos.push(`${c.identidade.forma} form`);
  }
  if (basicos.length) partes.push(basicos.join(", "));

  if (c.visual.cabelo) partes.push(`hair: ${c.visual.cabelo}`);
  if (c.visual.pele) partes.push(`skin: ${c.visual.pele}`);
  if (c.visual.olhos) partes.push(`eyes: ${c.visual.olhos}`);
  if (c.visual.tracosMarcantes) partes.push(`distinctive features: ${c.visual.tracosMarcantes}`);

  const roupa: string[] = [];
  if (c.visual.roupa) roupa.push(c.visual.roupa);
  if (c.visual.acessorios) roupa.push(`accessories: ${c.visual.acessorios}`);
  if (roupa.length) partes.push(`wearing: ${roupa.join("; ")}`);

  if (c.visual.paleta) partes.push(`color palette: ${c.visual.paleta}`);
  if (c.soul.adjetivos.length) {
    partes.push(`vibe: ${c.soul.adjetivos.slice(0, 5).join(", ")}`);
  }

  // Combinação ideia-livre + ficha
  const sep = formato === "midjourney" ? ", " : ". ";
  const camposStr = partes.join(sep);
  const camposFinal = camposStr && formato !== "midjourney" ? camposStr + "." : camposStr;

  if (ideia && camposFinal) {
    // Ideia primeiro, campos como complemento
    if (formato === "midjourney") return `${ideia}, additional details: ${camposFinal}`;
    return `${ideia}\n\nAdditional details: ${camposFinal}`;
  }
  if (ideia) return ideia;
  if (camposFinal) return camposFinal;
  return "no visual details provided yet";
}

function extractNegativos(_c: Character, _formato: FormatoImagem): string {
  // Campo "negativos" foi removido do modelo; mantido como no-op para preservar
  // o esqueleto do template (que ainda tem {{negativos}} ao fim do negative list).
  return "";
}

function labelGenero(g: string): string {
  if (g === "feminino") return "woman";
  if (g === "masculino") return "man";
  return "non-binary person";
}
