"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRecursos } from "@/components/RecursosProvider";

export interface StatusAlvo {
  status: "treinando" | "pronto" | "erro";
  /** rapido = FLUX.1 LoRA Fast · pro = FLUX.2 */
  treinador: "rapido" | "pro";
  jobId: string;
  gatilho: string;
  imagens: number;
  erro: string | null;
  em: string;
  temPronto: boolean;
}

interface Resposta {
  persona: StatusAlvo | null;
  /** Treinos "Rápido" inclusos no plano que ainda dá pra usar neste mês. */
  gratisRestantes: number;
}

/**
 * Situação da persona treinada do personagem (GET /api/persona/[id]).
 * `pronta.imagem`: há modelo utilizável (mesmo durante um re-treino).
 * Enquanto houver treino rodando, atualiza a cada 20s.
 */
export function usePersona(characterId: string) {
  const { login, armazenamento, fal } = useRecursos();
  const { user } = useAuth();
  const [dados, setDados] = useState<Resposta | null>(null);
  const ativo = login && armazenamento && fal && !!user;

  const recarregar = useCallback(() => {
    if (!ativo) return;
    fetch(`/api/persona/${encodeURIComponent(characterId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: Resposta | null) => b && setDados({ persona: b.persona ?? null, gratisRestantes: b.gratisRestantes ?? 0 }))
      .catch(() => {});
  }, [ativo, characterId]);

  useEffect(() => recarregar(), [recarregar]);

  const status = dados?.persona ?? null;
  const treinando = status?.status === "treinando";
  useEffect(() => {
    if (!treinando) return;
    const t = setInterval(recarregar, 20_000);
    return () => clearInterval(t);
  }, [treinando, recarregar]);

  const pronta = { imagem: !!status && (status.status === "pronto" || status.temPronto) };
  return { ativo, status, pronta, treinando, gratisRestantes: dados?.gratisRestantes ?? 0, recarregar };
}
