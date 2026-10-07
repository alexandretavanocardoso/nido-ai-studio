import type { Character } from "@/lib/types";

/**
 * Monta o Prompt de sistema do personagem — texto pronto pra colar em qualquer
 * chat (API ou interface) para que a IA responda sempre no estilo do personagem.
 *
 * O template base está em data/prompts/sistema-personagem.md, mas aqui a gente
 * monta diretamente em TS: a geração é client-side, não precisa chamar a API.
 */
export function promptSistema(c: Character): string {
  const d = c.identidade;
  const s = c.soul;
  const n = c.nicho;
  const v = c.voz;
  const m = c.monetizacao;

  const nome = d.nome || "o personagem";
  const linhas: string[] = [];

  linhas.push(
    `Você é ${nome}${d.ocupacao ? `, ${d.ocupacao}` : ""}.`
  );

  if (d.bio) linhas.push(d.bio);
  linhas.push("");

  if (s.origem) {
    linhas.push("[QUEM VOCÊ É]");
    linhas.push(s.origem);
    linhas.push("");
  }

  const perso: string[] = [];
  if (s.arquetipo) perso.push(`Arquétipo: ${s.arquetipo}`);
  if (s.adjetivos.length) perso.push(`Traços: ${s.adjetivos.join(", ")}`);
  if (s.valoresDefende) perso.push(`O que você defende: ${s.valoresDefende}`);
  if (s.valoresCombate) perso.push(`O que você combate: ${s.valoresCombate}`);
  if (s.medos) perso.push(`Medos reais: ${s.medos}`);
  if (s.manias || s.defeitos)
    perso.push(`Manias e defeitos: ${[s.manias, s.defeitos].filter(Boolean).join("; ")}`);
  if (perso.length) {
    linhas.push("[PERSONALIDADE]");
    linhas.push(...perso);
    linhas.push("");
  }

  const gostos = [
    s.gostos.comidas.length && `comidas: ${s.gostos.comidas.join(", ")}`,
    s.gostos.musicas.length && `músicas: ${s.gostos.musicas.join(", ")}`,
    s.gostos.hobbies.length && `hobbies: ${s.gostos.hobbies.join(", ")}`,
    s.gostos.marcas.length && `marcas: ${s.gostos.marcas.join(", ")}`,
    s.gostos.lugares.length && `lugares: ${s.gostos.lugares.join(", ")}`,
    s.gostos.series.length && `séries/filmes: ${s.gostos.series.join(", ")}`,
  ].filter(Boolean);
  if (gostos.length) {
    linhas.push("[GOSTOS]");
    gostos.forEach((g) => linhas.push(`- ${g}`));
    linhas.push("");
  }

  const odeia = [
    s.odeia.manias.length && `manias: ${s.odeia.manias.join(", ")}`,
    s.odeia.conteudos.length && `conteúdos: ${s.odeia.conteudos.join(", ")}`,
    s.odeia.comportamentos.length && `comportamentos: ${s.odeia.comportamentos.join(", ")}`,
    s.odeia.assuntos.length && `assuntos: ${s.odeia.assuntos.join(", ")}`,
  ].filter(Boolean);
  if (odeia.length) {
    linhas.push("[O QUE VOCÊ ODEIA]");
    odeia.forEach((g) => linhas.push(`- ${g}`));
    linhas.push("");
  }

  linhas.push("[COMO VOCÊ FALA]");
  linhas.push(`Tom: ${tomDescricao(v)}.`);
  linhas.push(`Frases ${v.tamanhoFrase}, uso de emoji ${v.emoji}.`);
  if (v.girias.length) linhas.push(`Gírias próprias: ${v.girias.join(", ")}.`);
  if (v.bordoes.length) linhas.push(`Bordões: ${v.bordoes.join(", ")}.`);
  if (v.proibidas.length)
    linhas.push(`NUNCA usa estas palavras/expressões: ${v.proibidas.join(", ")}.`);
  if (v.abertura) linhas.push(`Costuma abrir assim: ${v.abertura}`);
  if (v.fechamento) linhas.push(`Costuma fechar assim: ${v.fechamento}`);
  const falas = v.exemplos.filter((e) => e.trim());
  if (falas.length) {
    linhas.push("");
    linhas.push("Exemplos de falas suas (replique esse estilo):");
    falas.forEach((e, i) => linhas.push(`${i + 1}. ${e}`));
  }
  linhas.push("");

  const criador: string[] = [];
  if (n.principal) criador.push(`Nicho: ${n.principal}${n.subnicho ? ` (${n.subnicho})` : ""}`);
  if (n.publico) criador.push(`Público: ${n.publico}`);
  if (n.promessa) criador.push(`Promessa: ${n.promessa}`);
  if (n.diferencial) criador.push(`Diferencial: ${n.diferencial}`);
  if (criador.length) {
    linhas.push("[CONTEXTO DE CRIADOR]");
    linhas.push(...criador);
    linhas.push("");
  }

  if (s.regrasConsistencia.length) {
    linhas.push("[REGRAS DE CONSISTÊNCIA — INEGOCIÁVEIS]");
    s.regrasConsistencia.forEach((r) => linhas.push(`- ${r}`));
    linhas.push("");
  }

  if (m.limites) {
    linhas.push("[LIMITES ÉTICOS]");
    linhas.push(m.limites);
    linhas.push("");
  }
  if (m.transparencia) {
    linhas.push("[TRANSPARÊNCIA]");
    linhas.push(
      `Você é um personagem sintético. Se perguntarem diretamente, você confirma e não finge ser uma pessoa real. Sinalização pública: ${m.transparencia}`
    );
    linhas.push("");
  }

  const reacoes = [
    s.reacoes.elogio && `Elogio: ${s.reacoes.elogio}`,
    s.reacoes.critica && `Crítica: ${s.reacoes.critica}`,
    s.reacoes.polemica && `Polêmica: ${s.reacoes.polemica}`,
    s.reacoes.hater && `Hater: ${s.reacoes.hater}`,
  ].filter(Boolean);
  if (reacoes.length) {
    linhas.push("[COMO VOCÊ RESPONDE A SITUAÇÕES]");
    reacoes.forEach((r) => linhas.push(`- ${r}`));
    linhas.push("");
  }

  linhas.push("[REGRAS GERAIS]");
  linhas.push("- Fique no personagem o tempo todo.");
  linhas.push("- Prefira exemplos concretos a frases genéricas.");
  linhas.push(
    "- Se o que te pedirem conflitar com seus limites ou com a transparência, recuse e proponha alternativa — do seu jeito."
  );

  return linhas.join("\n");
}

function tomDescricao(v: Character["voz"]): string {
  return [
    escala("formalidade", v.tomFormalidade),
    escala("humor", v.tomHumor),
    escala("complexidade", v.tomComplexidade),
  ].join(", ");
}
function escala(dim: "formalidade" | "humor" | "complexidade", val: number): string {
  const left = { formalidade: "formal", humor: "sério", complexidade: "técnico" }[dim];
  const right = { formalidade: "informal", humor: "engraçado", complexidade: "simples" }[dim];
  if (val < 35) return `bastante ${left}`;
  if (val < 55) return `tendendo a ${left}`;
  if (val < 65) return "equilibrado";
  if (val < 85) return `tendendo a ${right}`;
  return `bastante ${right}`;
}
