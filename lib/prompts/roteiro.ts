import type { Character } from "@/lib/types";

export function promptRoteiro(c: Character): string {
  const d = c.identidade;
  const s = c.soul;
  const v = c.voz;
  const n = c.nicho;
  const m = c.monetizacao;

  const linhas: string[] = [];

  linhas.push(`Você vai escrever na voz de ${d.nome || "um personagem"}.`);
  if (d.bio) linhas.push(`Em uma frase: ${d.bio}`);

  if (s.arquetipo) linhas.push(`Arquétipo: ${s.arquetipo}.`);
  if (s.adjetivos.length) linhas.push(`Personalidade: ${s.adjetivos.join(", ")}.`);
  if (s.origem) linhas.push(`Origem: ${s.origem}`);

  if (n.principal) {
    const n2 = n.subnicho ? ` (${n.subnicho})` : "";
    linhas.push(`Nicho: ${n.principal}${n2}.`);
  }
  if (n.publico) linhas.push(`Público-alvo: ${n.publico}`);
  if (n.promessa) linhas.push(`Promessa: ${n.promessa}`);
  if (n.diferencial) linhas.push(`O que o diferencia: ${n.diferencial}`);

  const tom = tomDescricao(v);
  if (tom) linhas.push(`Tom de voz: ${tom}.`);
  if (v.girias.length) linhas.push(`Usa estas gírias/expressões: ${v.girias.join(", ")}.`);
  if (v.bordoes.length) linhas.push(`Bordões: ${v.bordoes.join(", ")}.`);
  if (v.proibidas.length) linhas.push(`NUNCA use estas palavras/expressões: ${v.proibidas.join(", ")}.`);
  if (v.abertura) linhas.push(`Costuma começar assim: ${v.abertura}`);
  if (v.fechamento) linhas.push(`Costuma terminar assim: ${v.fechamento}`);
  linhas.push(`Emoji: ${v.emoji}. Frases ${v.tamanhoFrase}.`);

  if (v.exemplos.filter((e) => e.trim()).length) {
    linhas.push("Exemplos de falas dele (calibre o estilo por aqui):");
    v.exemplos.filter((e) => e.trim()).forEach((e, i) => linhas.push(`  ${i + 1}. ${e}`));
  }

  const gostos = Object.values(s.gostos).flat();
  if (gostos.length) linhas.push(`Gosta de: ${gostos.join(", ")}.`);
  const odeia = Object.values(s.odeia).flat();
  if (odeia.length) linhas.push(`Odeia: ${odeia.join(", ")}.`);
  if (s.valoresDefende) linhas.push(`Defende: ${s.valoresDefende}`);
  if (s.valoresCombate) linhas.push(`Combate: ${s.valoresCombate}`);

  if (m.limites) linhas.push(`Limites éticos (jamais pisar): ${m.limites}`);
  if (m.transparencia)
    linhas.push(`Transparência: ${m.transparencia}`);

  linhas.push("");
  linhas.push("Regras:");
  linhas.push("- Mantenha coerência com todos os pontos acima.");
  linhas.push("- Se o pedido conflitar com os limites ou a transparência, recuse e proponha alternativa.");
  linhas.push("- Prefira exemplos concretos a frases genéricas.");

  return linhas.join("\n");
}

function tomDescricao(v: Character["voz"]): string {
  const partes: string[] = [];
  partes.push(mapaEscala("formalidade", v.tomFormalidade));
  partes.push(mapaEscala("humor", v.tomHumor));
  partes.push(mapaEscala("complexidade", v.tomComplexidade));
  return partes.filter(Boolean).join(", ");
}

function mapaEscala(dim: "formalidade" | "humor" | "complexidade", val: number): string {
  const left = { formalidade: "formal", humor: "sério", complexidade: "técnico" }[dim];
  const right = { formalidade: "informal", humor: "engraçado", complexidade: "simples" }[dim];
  if (val < 35) return `bastante ${left}`;
  if (val < 55) return `tendendo a ${left}`;
  if (val < 65) return "equilibrado";
  if (val < 85) return `tendendo a ${right}`;
  return `bastante ${right}`;
}
