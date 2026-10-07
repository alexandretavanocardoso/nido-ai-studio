"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Character } from "./types";
import { duplicateCharacter, emptyCharacter, hydrate } from "./defaults";
import { readPath, writePath } from "./paths";
import { deleteImageData, loadManyImages, saveImageData } from "./image-db";
import { ehCampoManual } from "@/lib/campos-manuais";

const STORE_KEY = "cis.characters.v1";

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw && raw.includes('"dataUrl":"data:')) {
      localStorage.setItem(
        STORE_KEY,
        raw.replace(/"dataUrl":"data:[^"]*"/g, '"dataUrl":""'),
      );
    }
  } catch {}
}

type Updater = (c: Character) => void;

export interface Suggestion {
  fieldId: string;
  valor: unknown;
  origem: "contexto" | "suposicao";
}

interface State {
  characters: Character[];
  createCharacter: () => string;
  deleteCharacter: (id: string) => void;
  duplicate: (id: string) => string | null;
  /** Adiciona um personagem pronto (ex.: importado de um JSON). Devolve o id. */
  adicionar: (c: Character) => string;
  update: (id: string, mutate: Updater) => void;
  rename: (id: string, nome: string) => void;
  get: (id: string) => Character | undefined;

  // v2 — sugestões / cadeado / histórico
  applySuggestions: (
    id: string,
    suggestions: Suggestion[],
    label: string,
  ) => void;
  confirmSuggestion: (id: string, fieldId: string) => void;
  confirmAllSuggestions: (id: string) => void;
  dropSuggestion: (id: string, fieldId: string) => void;
  toggleLock: (id: string, fieldId: string) => void;
  snapshotHistory: (id: string, label: string) => void;
  undoLast: (id: string) => void;
}

function cloneCharacter(c: Character): Character {
  const next = JSON.parse(
    JSON.stringify(c, (k, v) => (k === "dataUrl" ? undefined : v)),
  ) as Character;
  for (const ref of next.visual.referencias) {
    const orig = c.visual.referencias.find((r) => r.id === ref.id);
    if (orig?.dataUrl) ref.dataUrl = orig.dataUrl;
  }
  return next;
}

function mutateCharacter(
  list: Character[],
  id: string,
  mutate: Updater,
): Character[] {
  return list.map((c) => {
    if (c.id !== id) return c;
    const next = cloneCharacter(c);
    mutate(next);
    next.updatedAt = Date.now();
    return next;
  });
}

function mutateWithAutoConfirm(
  list: Character[],
  id: string,
  mutate: Updater,
): Character[] {
  return list.map((c) => {
    if (c.id !== id) return c;
    const next = cloneCharacter(c);
    mutate(next);
    next.updatedAt = Date.now();
    for (const fieldId of Object.keys(next._suggestions)) {
      const before = JSON.stringify(readPath(c as unknown, fieldId));
      const after = JSON.stringify(readPath(next as unknown, fieldId));
      if (before !== after) delete next._suggestions[fieldId];
    }
    return next;
  });
}

function rehydrateImages(state: State) {
  const ids = state.characters.flatMap((c) =>
    c.visual.referencias.map((r) => r.id),
  );
  if (ids.length === 0) return;
  loadManyImages(ids).then((map) => {
    if (map.size === 0) return;
    useCharacters.setState((prev) => ({
      characters: prev.characters.map((c) => {
        // Referências no S3 (key) não usam o IndexedDB.
        const touched = c.visual.referencias.some(
          (r) => map.has(r.id) && !r.dataUrl && !r.key,
        );
        if (!touched) return c;
        return {
          ...c,
          visual: {
            ...c.visual,
            referencias: c.visual.referencias.map((r) =>
              map.has(r.id) && !r.key ? { ...r, dataUrl: map.get(r.id)! } : r,
            ),
          },
        };
      }),
    }));
  });
}

function syncImagesToDb(prev: Character[], next: Character[]) {
  for (const nc of next) {
    const pc = prev.find((c) => c.id === nc.id);
    for (const ref of nc.visual.referencias) {
      if (
        ref.dataUrl &&
        (!pc || !pc.visual.referencias.some((r) => r.id === ref.id))
      ) {
        saveImageData(ref.id, ref.dataUrl);
      }
    }
    if (pc) {
      for (const pr of pc.visual.referencias) {
        if (!nc.visual.referencias.some((r) => r.id === pr.id)) {
          deleteImageData(pr.id);
        }
      }
    }
  }
  for (const pc of prev) {
    if (!next.some((c) => c.id === pc.id)) {
      for (const ref of pc.visual.referencias) {
        deleteImageData(ref.id);
      }
    }
  }
}

/**
 * A IA às vezes manda lista onde o campo é texto (ou o contrário). Ajusta pelo
 * tipo do campo numa ficha vazia: lista → texto junta com vírgula; texto → lista
 * separa por vírgula/linha.
 */
const MODELO_FICHA = emptyCharacter() as unknown as Record<string, unknown>;
function ajustarTipo(fieldId: string, valor: unknown): unknown {
  const modelo = readPath(MODELO_FICHA, fieldId);
  if (typeof modelo === "string" && Array.isArray(valor))
    return valor.map(String).join(", ");
  if (Array.isArray(modelo) && typeof valor === "string")
    return valor
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  return valor;
}

export const useCharacters = create<State>()(
  persist(
    (set, get) => ({
      characters: [],
      createCharacter: () => {
        const c = emptyCharacter();
        set({ characters: [c, ...get().characters] });
        return c.id;
      },
      deleteCharacter: (id) =>
        set({ characters: get().characters.filter((c) => c.id !== id) }),
      duplicate: (id) => {
        const found = get().characters.find((c) => c.id === id);
        if (!found) return null;
        const copy = duplicateCharacter(found);
        set({ characters: [copy, ...get().characters] });
        return copy.id;
      },
      adicionar: (c) => {
        set({ characters: [c, ...get().characters] });
        return c.id;
      },
      update: (id, mutate) => {
        set({
          characters: mutateWithAutoConfirm(get().characters, id, mutate),
        });
      },
      rename: (id, nome) =>
        get().update(id, (c) => {
          c.identidade.nome = nome;
        }),
      get: (id) => get().characters.find((c) => c.id === id),

      applySuggestions: (id, suggestions, label) => {
        // snapshot + apply em uma passagem só, sem auto-confirmar (os próprios
        // writes abaixo é que escrevem os valores novos — eles NÃO podem ser
        // interpretados como "edição do usuário").
        set({
          characters: mutateCharacter(get().characters, id, (c) => {
            const { _history, ...rest } = c;
            void _history;
            c._history = [
              {
                at: Date.now(),
                label,
                snapshot: JSON.parse(JSON.stringify(rest)),
              },
              ...c._history,
            ].slice(0, 3);
            for (const s of suggestions) {
              if (c._locks.includes(s.fieldId) || ehCampoManual(s.fieldId))
                continue;
              writePath(
                c as unknown as Record<string, unknown>,
                s.fieldId,
                ajustarTipo(s.fieldId, s.valor),
              );
              c._suggestions[s.fieldId] = s.origem;
            }
          }),
        });
      },
      confirmSuggestion: (id, fieldId) =>
        set({
          characters: mutateCharacter(get().characters, id, (c) => {
            delete c._suggestions[fieldId];
          }),
        }),
      confirmAllSuggestions: (id) =>
        set({
          characters: mutateCharacter(get().characters, id, (c) => {
            c._suggestions = {};
          }),
        }),
      dropSuggestion: (id, fieldId) =>
        set({
          characters: mutateCharacter(get().characters, id, (c) => {
            delete c._suggestions[fieldId];
          }),
        }),
      toggleLock: (id, fieldId) =>
        set({
          characters: mutateCharacter(get().characters, id, (c) => {
            c._locks = c._locks.includes(fieldId)
              ? c._locks.filter((f) => f !== fieldId)
              : [...c._locks, fieldId];
          }),
        }),
      snapshotHistory: (id, label) =>
        set({
          characters: mutateCharacter(get().characters, id, (c) => {
            const { _history, ...rest } = c;
            void _history;
            c._history = [
              {
                at: Date.now(),
                label,
                snapshot: JSON.parse(JSON.stringify(rest)),
              },
              ...c._history,
            ].slice(0, 3);
          }),
        }),
      undoLast: (id) => {
        const c = get().characters.find((x) => x.id === id);
        if (!c || c._history.length === 0) return;
        const [head, ...rest] = c._history;
        set({
          characters: get().characters.map((x) =>
            x.id === id
              ? ({
                  ...head.snapshot,
                  _history: rest,
                  updatedAt: Date.now(),
                } as Character)
              : x,
          ),
        });
      },
    }),
    {
      name: STORE_KEY,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.characters = state.characters.map((c) => hydrate(c));
        rehydrateImages(state);
      },
      partialize: (state) =>
        ({
          ...state,
          characters: state.characters.map((c) => ({
            ...c,
            visual: {
              ...c.visual,
              referencias: c.visual.referencias.map(
                ({ dataUrl: _, ...rest }) => rest,
              ),
            },
            _history: c._history.map((h) => ({
              ...h,
              snapshot: {
                ...h.snapshot,
                visual: {
                  ...h.snapshot.visual,
                  referencias: h.snapshot.visual.referencias.map(
                    ({ dataUrl: _, ...rest }) => rest,
                  ),
                },
              },
            })),
          })),
        }) as unknown as State,
    },
  ),
);

useCharacters.subscribe((state, prev) => {
  if (state.characters !== prev.characters) {
    syncImagesToDb(prev.characters, state.characters);
  }
});
