import type { StepId } from "@/lib/types";
import { ehCampoManual } from "@/lib/campos-manuais";

/**
 * Todos os campos da ficha que a IA pode preencher, por etapa (caminho
 * completo, igual ao `fieldId` dos formulários). Fonte única para:
 *  - o que "Preencher esta etapa com IA" pede;
 *  - o que as rotas de IA aceitam de volta (o resto é descartado).
 * Campo novo num formulário → entra aqui também.
 */
export const CAMPOS_FICHA: Record<Exclude<StepId, "revisao">, string[]> = {
  identidade: [
    "identidade.nome",
    "identidade.handles",
    "identidade.ocupacao",
    "identidade.genero",
    "identidade.forma",
    "identidade.idadeAparente",
    "identidade.cidade",
    "identidade.idioma",
    "identidade.sotaque",
    "identidade.bio",
  ],
  visual: [
    "visual.cabelo",
    "visual.pele",
    "visual.olhos",
    "visual.roupa",
    "visual.acessorios",
    "visual.tracosMarcantes",
    "visual.paleta",
    "visual.cenarios",
  ],
  soul: [
    "soul.arquetipo",
    "soul.adjetivos",
    "soul.gostos.comidas",
    "soul.gostos.musicas",
    "soul.gostos.hobbies",
    "soul.gostos.marcas",
    "soul.gostos.lugares",
    "soul.gostos.series",
    "soul.odeia.manias",
    "soul.odeia.conteudos",
    "soul.odeia.comportamentos",
    "soul.odeia.assuntos",
    "soul.valoresDefende",
    "soul.valoresCombate",
    "soul.medos",
    "soul.manias",
    "soul.defeitos",
    "soul.origem",
    "soul.reacoes.elogio",
    "soul.reacoes.critica",
    "soul.reacoes.polemica",
    "soul.reacoes.hater",
    "soul.regrasConsistencia",
  ],
  nicho: [
    "nicho.principal",
    "nicho.subnicho",
    "nicho.publico",
    "nicho.promessa",
    "nicho.performaFormatos",
    "nicho.performaTemas",
    "nicho.performaGanchos",
    "nicho.performaDuracao",
    "nicho.performaFrequencia",
    "nicho.performaHorarios",
    "nicho.concorrentes",
    "nicho.diferencial",
    "nicho.plataformas",
    "nicho.ideiasConteudo",
  ],
  voz: [
    "voz.tomFormalidade",
    "voz.tomHumor",
    "voz.tomComplexidade",
    "voz.girias",
    "voz.bordoes",
    "voz.proibidas",
    "voz.abertura",
    "voz.fechamento",
    "voz.emoji",
    "voz.tamanhoFrase",
    "voz.exemplos",
    "voz.vozGenero",
    "voz.vozTimbre",
    "voz.vozRitmo",
  ],
  monetizacao: [
    "monetizacao.modelos",
    "monetizacao.marcasOk",
    "monetizacao.marcasNao",
    "monetizacao.limites",
    "monetizacao.transparencia",
  ],
};

const TODOS = new Set(Object.values(CAMPOS_FICHA).flat());

/** A IA pode preencher este campo? (existe na ficha e não é só manual, como o nome) */
export const campoAceitoDaIA = (fieldId: string): boolean =>
  TODOS.has(fieldId) && !ehCampoManual(fieldId);

/** Campos que a IA deve preencher nesta etapa (sem os manuais). */
export const camposDaEtapaParaIA = (
  step: Exclude<StepId, "revisao">,
): string[] => CAMPOS_FICHA[step].filter((c) => !ehCampoManual(c));
