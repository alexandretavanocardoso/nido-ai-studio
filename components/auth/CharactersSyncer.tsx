"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCharacters } from "@/lib/store";
import { deleteRemote, listRemote, upsertRemote } from "@/lib/sync/remoteSync";
import type { Character } from "@/lib/types";

function snapshot(characters: Character[]): Map<string, string> {
  return new Map(characters.map((c) => [c.id, JSON.stringify(c)]));
}

/**
 * Mantém o store Zustand em sync com o banco (Neon) enquanto o usuário
 * está logado.
 *
 *  - Ao logar: os personagens que já estavam no localStorage (modo
 *    anônimo) são anexados definitivamente à conta — nunca escondidos.
 *    São enviados ao banco junto com os que já existiam lá.
 *  - Ao sair: a conta e o navegador já estão sincronizados, então volta
 *    pro estado anônimo vazio (os dados continuam na conta).
 *  - Ao editar/criar/excluir enquanto logado: espelha no banco, enviando
 *    só os personagens que mudaram.
 */
export function CharactersSyncer() {
  const { user } = useAuth();
  const characters = useCharacters((s) => s.characters);
  const previousUser = useRef<string | null | undefined>(user?.id);
  const hydrating = useRef(false);
  const lastSynced = useRef<Map<string, string>>(new Map());

  // Fase 1: mescla ao logar, limpa ao deslogar.
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (currentId === previousUser.current) return;

    if (currentId && !previousUser.current) {
      hydrating.current = true;
      void listRemote().then((remote) => {
        const local = useCharacters.getState().characters;
        const remoteIds = new Set(remote.map((c) => c.id));
        const localOnly = local.filter((c) => !remoteIds.has(c.id));
        const merged = [...localOnly, ...remote];
        useCharacters.setState({ characters: merged });
        lastSynced.current = snapshot(merged);
        hydrating.current = false;
        if (localOnly.length > 0) {
          void upsertRemote(localOnly);
        }
      });
    } else if (!currentId && previousUser.current) {
      hydrating.current = true;
      useCharacters.setState({ characters: [] });
      lastSynced.current = new Map();
      hydrating.current = false;
    }

    previousUser.current = currentId;
  }, [user]);

  // Fase 2: escreve mudanças no banco quando logado.
  useEffect(() => {
    if (!user?.id) {
      lastSynced.current = snapshot(characters);
      return;
    }
    if (hydrating.current) return;

    const current = snapshot(characters);
    const prev = lastSynced.current;
    const changed = characters.filter(
      (c) => prev.get(c.id) !== current.get(c.id),
    );
    const removed = [...prev.keys()].filter((id) => !current.has(id));
    if (!changed.length && !removed.length) return;
    lastSynced.current = current;

    void (async () => {
      await upsertRemote(changed);
      for (const id of removed) await deleteRemote(id);
    })();
  }, [characters, user]);

  return null;
}
