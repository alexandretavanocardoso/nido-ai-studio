"use client";

import { useCharacters } from "./store";
import type { Character } from "./types";

export function useCharacter(id: string) {
  const character = useCharacters((s) => s.characters.find((c) => c.id === id));
  const update = useCharacters((s) => s.update);
  function set(mutate: (c: Character) => void) {
    update(id, mutate);
  }
  return { character, set };
}
