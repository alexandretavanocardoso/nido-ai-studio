import type { Character, StepId } from "./types";

export type Status = "rascunho" | "completo";

/**
 * Only Nome + ≥1 referência de imagem são obrigatórios para marcar como completo.
 * Os demais campos ajudam no %, mas não bloqueiam o status.
 */
export function status(c: Character): Status {
  const temNome = c.identidade.nome.trim().length > 0;
  const temRef = c.visual.referencias.length > 0;
  return temNome && temRef ? "completo" : "rascunho";
}

/** Porcentagem de preenchimento (0–100), por etapa. */
export function stepCompletion(c: Character): Record<StepId, number> {
  return {
    identidade: pct([
      !!c.identidade.nome.trim(),
      !!c.identidade.genero,
      !!c.identidade.forma,
      !!c.identidade.bio?.trim(),
      !!c.identidade.idioma?.trim(),
    ]),
    visual: pct([
      c.visual.referencias.length > 0,
      !!c.visual.cabelo?.trim(),
      !!c.visual.pele?.trim(),
      !!c.visual.roupa?.trim(),
      !!c.visual.paleta?.trim(),
    ]),
    soul: pct([
      !!c.soul.arquetipo?.trim(),
      c.soul.adjetivos.length >= 3,
      c.soul.gostos.comidas.length + c.soul.gostos.hobbies.length > 0,
      !!c.soul.origem?.trim(),
      !!c.soul.reacoes.critica?.trim() || !!c.soul.reacoes.elogio?.trim(),
    ]),
    nicho: pct([
      !!c.nicho.principal?.trim(),
      !!c.nicho.publico?.trim(),
      !!c.nicho.promessa?.trim(),
      c.nicho.plataformas.length > 0,
      !!c.nicho.diferencial?.trim(),
    ]),
    voz: pct([
      c.voz.girias.length + c.voz.bordoes.length > 0,
      !!c.voz.abertura?.trim() || !!c.voz.fechamento?.trim(),
      c.voz.exemplos.filter((e) => e.trim()).length >= 1,
      !!c.voz.vozTimbre?.trim(),
    ]),
    monetizacao: pct([
      c.monetizacao.modelos.length > 0,
      c.monetizacao.marcasOk.length + c.monetizacao.marcasNao.length > 0,
      !!c.monetizacao.transparencia?.trim(),
    ]),
    revisao: status(c) === "completo" ? 100 : 0,
  };
}

function pct(checks: boolean[]): number {
  if (!checks.length) return 0;
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

export interface Inconsistencia {
  tipo: "vazio" | "contradicao" | "sugestao";
  campo: string;
  mensagem: string;
}

export function checarConsistencia(c: Character): Inconsistencia[] {
  const out: Inconsistencia[] = [];

  if (!c.identidade.nome.trim())
    out.push({ tipo: "vazio", campo: "identidade.nome", mensagem: "Falta dar nome ao personagem." });

  if (c.visual.referencias.length === 0)
    out.push({ tipo: "vazio", campo: "visual.referencias", mensagem: "Adicione pelo menos 1 imagem de referência." });

  if (!c.identidade.bio?.trim())
    out.push({ tipo: "sugestao", campo: "identidade.bio", mensagem: "Uma bio de 1 linha ajuda a travar a essência do personagem." });

  if (c.soul.adjetivos.length < 3)
    out.push({ tipo: "sugestao", campo: "soul.adjetivos", mensagem: "Prefira pelo menos 3 adjetivos — menos que isso deixa a personalidade solta." });

  if (!c.nicho.principal?.trim())
    out.push({ tipo: "sugestao", campo: "nicho.principal", mensagem: "Sem nicho principal, o Prompt Mestre fica genérico." });

  // Contradições
  const adjetivos = c.soul.adjetivos.map((a) => a.toLowerCase());
  const odeiaConteudos = c.soul.odeia.conteudos.map((a) => a.toLowerCase());
  const humorAlto = c.voz.tomHumor >= 65;
  const odeiaPiadas = odeiaConteudos.some((x) => x.includes("piada") || x.includes("humor"));
  if (humorAlto && odeiaPiadas)
    out.push({
      tipo: "contradicao",
      campo: "voz.tomHumor x soul.odeia.conteudos",
      mensagem: "O tom está marcado como engraçado, mas o personagem odeia piadas. Reveja um dos dois.",
    });

  const serio = adjetivos.includes("sério") || adjetivos.includes("serio");
  const debochado = adjetivos.includes("debochado") || adjetivos.includes("sarcástico") || adjetivos.includes("sarcastico");
  if (serio && debochado)
    out.push({
      tipo: "contradicao",
      campo: "soul.adjetivos",
      mensagem: "Adjetivos conflitantes: 'sério' + 'debochado'. Combine ou escolha um.",
    });

  return out;
}
