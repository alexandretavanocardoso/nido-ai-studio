"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCharacters } from "@/lib/store";
import {
  deleteRemote,
  gravarMarcas,
  lerMarcas,
  listRemote,
  upsertRemote,
  usePendentesDeSync,
} from "@/lib/sync/remoteSync";
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
 *
 * Um personagem só conta como sincronizado depois que o servidor confirma.
 * O que foi recusado (limite do plano) ou falhou fica em `usePendentesDeSync`
 * e é reenviado quando mudar ou na próxima vez que o app abrir.
 */
export function CharactersSyncer() {
  const { user } = useAuth();
  const characters = useCharacters((s) => s.characters);
  const previousUser = useRef<string | null | undefined>(user?.id);
  const hydrating = useRef(false);
  /** O que o servidor confirmou ter gravado. */
  const lastSynced = useRef<Map<string, string>>(new Map());
  /** Última versão enviada sem sucesso: não reenvia igual. */
  const tentado = useRef<Map<string, string>>(new Map());
  const pendentes = useRef({
    recusados: new Set<string>(),
    falharam: new Set<string>(),
  });
  /** Exclusões que o servidor ainda não confirmou. */
  const aExcluir = useRef<Set<string>>(new Set());
  const fila = useRef<Promise<void>>(Promise.resolve());
  const logado = useRef(false);
  logado.current = !!user?.id;

  // Fase 1: mescla ao logar, limpa ao deslogar.
  useEffect(() => {
    const currentId = user?.id ?? null;
    if (currentId === previousUser.current) return;

    if (currentId && !previousUser.current) {
      hydrating.current = true;
      void listRemote().then((lido) => {
        const remote = lido ?? [];
        const local = useCharacters.getState().characters;
        const marcas = lerMarcas(currentId);
        const jaNaConta = new Set(marcas.sincronizados);
        aExcluir.current = new Set(marcas.excluir);
        const remoteIds = new Set(remote.map((c) => c.id));
        // Local que já esteve na conta e sumiu de lá foi excluído em outro
        // aparelho: não volta. Sem ler a conta (lido = null), não descarta nada.
        const localOnly = local.filter(
          (c) => !remoteIds.has(c.id) && !(lido && jaNaConta.has(c.id)),
        );
        // Só o que veio do banco está sincronizado; a fase 2 envia o resto.
        lastSynced.current = snapshot(remote);
        if (lido)
          gravarMarcas(currentId, {
            sincronizados: [...remoteIds],
            excluir: marcas.excluir,
          });
        hydrating.current = false;
        // Exclusão que não chegou ao servidor: fica fora e a fase 2 reenvia.
        useCharacters.setState({
          characters: [
            ...localOnly,
            ...remote.filter((c) => !aExcluir.current.has(c.id)),
          ],
        });
      });
    } else if (!currentId && previousUser.current) {
      hydrating.current = true;
      useCharacters.setState({ characters: [] });
      gravarMarcas(previousUser.current, null);
      aExcluir.current = new Set();
      lastSynced.current = new Map();
      tentado.current = new Map();
      pendentes.current = { recusados: new Set(), falharam: new Set() };
      usePendentesDeSync.setState({ recusados: [], falharam: [] });
      hydrating.current = false;
    }

    previousUser.current = currentId;
  }, [user]);

  // Fase 2: escreve mudanças no banco quando logado.
  useEffect(() => {
    if (!user?.id || hydrating.current) return;
    const userId = user.id;

    // Em fila: uma rodada por vez, cada uma olhando o estado mais recente.
    fila.current = fila.current.then(async () => {
      if (!logado.current || hydrating.current) return;
      const atuais = useCharacters.getState().characters;
      const current = snapshot(atuais);
      const changed = atuais.filter((c) => {
        const json = current.get(c.id);
        return (
          lastSynced.current.get(c.id) !== json &&
          tentado.current.get(c.id) !== json
        );
      });
      for (const id of aExcluir.current)
        if (current.has(id)) aExcluir.current.delete(id);
      const removed = [
        ...new Set([...lastSynced.current.keys(), ...aExcluir.current]),
      ].filter((id) => !current.has(id));
      if (!changed.length && !removed.length) return;

      // Anota a exclusão antes de tentar: se a aba fechar ou a rede cair, o
      // personagem não volta da conta na próxima visita.
      for (const id of removed) aExcluir.current.add(id);
      const marcar = () =>
        gravarMarcas(userId, {
          sincronizados: [...lastSynced.current.keys()],
          excluir: [...aExcluir.current],
        });
      marcar();

      const r = await upsertRemote(changed);
      if (!logado.current) return;
      const p = pendentes.current;
      for (const id of r.salvos) {
        lastSynced.current.set(id, current.get(id)!);
        tentado.current.delete(id);
        p.recusados.delete(id);
        p.falharam.delete(id);
      }
      for (const id of r.recusados) {
        tentado.current.set(id, current.get(id)!);
        p.recusados.add(id);
        p.falharam.delete(id);
      }
      for (const id of r.falharam) {
        tentado.current.set(id, current.get(id)!);
        p.falharam.add(id);
        p.recusados.delete(id);
      }
      for (const id of removed) {
        // Só sai da lista quando o servidor confirma; senão tenta de novo.
        if (!(await deleteRemote(id))) continue;
        lastSynced.current.delete(id);
        aExcluir.current.delete(id);
      }
      if (!logado.current) return;
      marcar();

      const existe = new Set(
        useCharacters.getState().characters.map((c) => c.id),
      );
      usePendentesDeSync.setState({
        recusados: [...p.recusados].filter((id) => existe.has(id)),
        falharam: [...p.falharam].filter((id) => existe.has(id)),
      });
    });
  }, [characters, user]);

  return null;
}
