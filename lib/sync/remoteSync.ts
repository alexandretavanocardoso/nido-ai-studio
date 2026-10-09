"use client";

import { create } from "zustand";
import type { Character } from "@/lib/types";

/**
 * Camada de persistência remota (Neon, via /api/characters). O store
 * continua sendo a fonte da verdade em memória; estes helpers são
 * chamados por um syncer que roda no cliente quando há usuário logado.
 */
/** `null` = não deu para ler a conta (rede, sessão): não é o mesmo que conta vazia. */
export async function listRemote(): Promise<Character[] | null> {
  try {
    const res = await fetch("/api/characters", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { characters: Array<Character | null> };
    return body.characters.filter((c): c is Character => !!c && !!c.id);
  } catch (e) {
    console.error("[sync] listRemote:", (e as Error).message);
    return null;
  }
}

const MARCAS_KEY = "cis.sync.v1";

/**
 * O que este navegador sabe da conta, guardado entre visitas:
 *  - `sincronizados`: ids que o servidor já confirmou. Se um deles some da
 *    conta, foi excluído em outro aparelho/aba — não é um personagem novo.
 *  - `excluir`: exclusões que ainda não chegaram ao servidor.
 */
export interface MarcasDeSync {
  sincronizados: string[];
  excluir: string[];
}

export function lerMarcas(userId: string): MarcasDeSync {
  try {
    const m = JSON.parse(localStorage.getItem(MARCAS_KEY) ?? "null") as
      | (MarcasDeSync & { userId: string })
      | null;
    if (m?.userId === userId)
      return { sincronizados: m.sincronizados ?? [], excluir: m.excluir ?? [] };
  } catch {}
  return { sincronizados: [], excluir: [] };
}

export function gravarMarcas(userId: string, marcas: MarcasDeSync | null) {
  try {
    if (marcas)
      localStorage.setItem(MARCAS_KEY, JSON.stringify({ userId, ...marcas }));
    else localStorage.removeItem(MARCAS_KEY);
  } catch {}
}

/**
 * Personagens que estão só neste navegador: a conta não os tem, então não
 * aparecem em outro aparelho. O syncer preenche; a tela inicial avisa.
 */
export const usePendentesDeSync = create<{
  recusados: string[];
  falharam: string[];
}>(() => ({ recusados: [], falharam: [] }));

export interface ResultadoUpsert {
  /** Ids gravados na conta. */
  salvos: string[];
  /** Ids que o servidor não aceitou (limite de personagens do plano). */
  recusados: string[];
  /** Ids que não chegaram ao banco (rede, sessão, corpo grande demais). */
  falharam: string[];
}

/**
 * Envia um personagem por requisição: assim um que falhe (ex.: referências
 * em base64 passando do limite de corpo) não impede os outros de salvar.
 */
export async function upsertRemote(
  characters: Character[],
): Promise<ResultadoUpsert> {
  const r: ResultadoUpsert = { salvos: [], recusados: [], falharam: [] };
  for (const c of characters) {
    try {
      const res = await fetch("/api/characters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characters: [c] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { recusados?: string[] };
      if (body.recusados?.includes(c.id)) r.recusados.push(c.id);
      else r.salvos.push(c.id);
    } catch (e) {
      console.error(`[sync] upsertRemote ${c.id}:`, (e as Error).message);
      r.falharam.push(c.id);
    }
  }
  return r;
}

/** Devolve se o servidor confirmou a exclusão. */
export async function deleteRemote(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/characters/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (e) {
    console.error("[sync] deleteRemote:", (e as Error).message);
    return false;
  }
}
