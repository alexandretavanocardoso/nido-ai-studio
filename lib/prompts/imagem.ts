import type { Character } from "@/lib/types";

/**
 * Monta o prompt de IMAGEM a partir das respostas.
 * Edite livremente — tudo que precisa está no objeto character.
 */
export function promptImagem(c: Character): string {
  const d = c.identidade;
  const v = c.visual;
  const partes: string[] = [];

  const sujeito = [
    d.nome || "personagem",
    d.genero && labelGenero(d.genero),
    d.idadeAparente,
    d.forma && `tipo ${d.forma}`,
    d.cidade && `baseado em ${d.cidade}`,
  ]
    .filter(Boolean)
    .join(", ");
  if (sujeito) partes.push(sujeito);

  if (d.bio) partes.push(`essência: ${d.bio}`);

  const aparencia: string[] = [];
  if (v.cabelo) aparencia.push(`cabelo ${v.cabelo}`);
  if (v.pele) aparencia.push(`pele ${v.pele}`);
  if (v.olhos) aparencia.push(`olhos ${v.olhos}`);
  if (v.roupa) aparencia.push(`roupa ${v.roupa}`);
  if (v.acessorios) aparencia.push(`acessórios ${v.acessorios}`);
  if (v.tracosMarcantes) aparencia.push(`traços marcantes: ${v.tracosMarcantes}`);
  if (aparencia.length) partes.push(aparencia.join(", "));

  if (v.paleta) partes.push(`paleta: ${v.paleta}`);

  // Composição padrão útil para quase todos os geradores
  partes.push("enquadramento meio-corpo, luz suave, foco nítido no rosto, fundo coerente com a estética");

  let out = partes.join(". ");

  if (c.soul.adjetivos.length) {
    out += `\n\nVibe: ${c.soul.adjetivos.join(", ")}.`;
  }
  return out;
}

function labelGenero(g: string) {
  if (g === "feminino") return "mulher";
  if (g === "masculino") return "homem";
  return "pessoa não-binária";
}
