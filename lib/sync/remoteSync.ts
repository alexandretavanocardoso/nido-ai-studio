"use client";

import type { Character } from "@/lib/types";

/**
 * Camada de persistência remota (Neon, via /api/characters). O store
 * continua sendo a fonte da verdade em memória; estes helpers são
 * chamados por um syncer que roda no cliente quando há usuário logado.
 */
export async function listRemote(): Promise<Character[]> {
  try {
    const res = await fetch("/api/characters", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { characters: Array<Character | null> };
    return body.characters.filter((c): c is Character => !!c && !!c.id);
  } catch (e) {
    console.error("[sync] listRemote:", (e as Error).message);
    return [];
  }
}

export async function upsertRemote(characters: Character[]): Promise<void> {
  if (!characters.length) return;
  try {
    const res = await fetch("/api/characters", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characters }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error("[sync] upsertRemote:", (e as Error).message);
  }
}

export async function deleteRemote(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/characters/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error("[sync] deleteRemote:", (e as Error).message);
  }
}
