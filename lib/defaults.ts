import { nanoid } from "nanoid";
import type { Character } from "./types";

export function emptyCharacter(): Character {
  const now = Date.now();
  return {
    id: nanoid(10),
    createdAt: now,
    updatedAt: now,
    identidade: { nome: "" },
    visual: { referencias: [] },
    soul: {
      adjetivos: [],
      gostos: {
        comidas: [],
        musicas: [],
        hobbies: [],
        marcas: [],
        lugares: [],
        series: [],
      },
      odeia: { manias: [], conteudos: [], comportamentos: [], assuntos: [] },
      reacoes: {},
      regrasConsistencia: [],
    },
    nicho: {
      performaFormatos: [],
      concorrentes: [],
      plataformas: [],
      ideiasConteudo: [],
    },
    voz: {
      tomFormalidade: 50,
      tomHumor: 50,
      tomComplexidade: 50,
      girias: [],
      bordoes: [],
      proibidas: [],
      emoji: "pouco",
      tamanhoFrase: "medias",
      exemplos: [],
    },
    monetizacao: { modelos: [], marcasOk: [], marcasNao: [] },
    pontosEmAberto: [],
    _suggestions: {},
    _locks: [],
    _history: [],
  };
}

export function duplicateCharacter(c: Character): Character {
  const copy = JSON.parse(JSON.stringify(c)) as Character;
  copy.id = nanoid(10);
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  copy.identidade.nome = c.identidade.nome ? `${c.identidade.nome} (cópia)` : "";
  copy._suggestions = {};
  copy._locks = [];
  copy._history = [];
  return copy;
}

/**
 * Migração defensiva: personagens antigos no localStorage não têm
 * `_suggestions`, `_locks`, `_history`, `pontosEmAberto`, `regrasConsistencia`,
 * `ideiasConteudo`. Esse helper garante que ninguém crashe ao ler um objeto
 * antigo depois do upgrade.
 */
export function hydrate(c: Character): Character {
  const base = emptyCharacter();
  return {
    ...c,
    pontosEmAberto: c.pontosEmAberto ?? [],
    _suggestions: c._suggestions ?? {},
    _locks: c._locks ?? [],
    _history: c._history ?? [],
    soul: {
      ...base.soul,
      ...c.soul,
      regrasConsistencia: c.soul?.regrasConsistencia ?? [],
    },
    nicho: {
      ...base.nicho,
      ...c.nicho,
      ideiasConteudo: c.nicho?.ideiasConteudo ?? [],
    },
  };
}
