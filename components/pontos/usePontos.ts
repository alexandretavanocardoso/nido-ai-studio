"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ResumoPontos } from "@/lib/pontos";
import { txErro } from "@/lib/i18n/erros";

/**
 * Pontos da conta, lidos uma vez e compartilhados entre o indicador da barra
 * e a página de pontos (o check-in feito num lugar atualiza o outro).
 */
let dados: ResumoPontos | null = null;
let carregando = false;
const ouvintes = new Set<() => void>();

function guardar(novo: ResumoPontos | null) {
  dados = novo;
  for (const o of ouvintes) o();
}

async function carregar() {
  if (carregando) return;
  carregando = true;
  try {
    const r = await fetch("/api/pontos", { cache: "no-store" });
    if (r.ok) guardar((await r.json()) as ResumoPontos);
  } catch {
    // Sem rede: o indicador só não aparece.
  } finally {
    carregando = false;
  }
}

/** Lê os pontos de novo (o dia virou e o check-in voltou a valer). */
export function recarregarPontos() {
  void carregar();
}

/** Faz o check-in de hoje. Devolve quantos pontos rendeu; lança com a mensagem do servidor. */
export async function fazerCheckin(): Promise<number> {
  const r = await fetch("/api/pontos/checkin", { method: "POST" });
  const b = (await r.json().catch(() => ({}))) as ResumoPontos & {
    ganhou?: number;
    error?: string;
  };
  if (!r.ok) {
    void carregar();
    throw new Error(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
  }
  guardar(b);
  return b.ganhou ?? 0;
}

/** `ativo` = a conta tem acesso aos pontos (recurso em teste). */
export function usePontos(ativo: boolean): ResumoPontos | null {
  const atual = useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => dados,
    () => null,
  );
  useEffect(() => {
    if (ativo) void carregar();
  }, [ativo]);
  return ativo ? atual : null;
}
