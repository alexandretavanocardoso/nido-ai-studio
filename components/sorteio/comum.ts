"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tx } from "@/lib/i18n/tx";
import { PLANOS } from "@/lib/planos";
import { reais, type Premio, type SorteioPublico } from "@/lib/sorteio/tipos";

/** O prêmio, no idioma da tela: "Plano Creator · 1 mês", "500 créditos", "R$ 100,00 no Pix". */
export function textoPremio(p: Premio): string {
  if (p.tipo === "plano") return `${tx("Plano")} ${PLANOS[p.plano].nome} · ${p.meses} ${tx(p.meses === 1 ? "mês" : "meses")}`;
  if (p.tipo === "creditos") return `${p.quantidade.toLocaleString()} ${tx("créditos")}`;
  if (p.tipo === "pontos") return `${p.quantidade.toLocaleString()} ${tx("pontos")}`;
  return `${reais(p.centavos)} ${tx("no Pix")}`;
}

/**
 * Lê o sorteio de `url` a cada `ms` e mede o relógio do servidor (`desvio`,
 * servidor menos aqui), pelo meio do caminho da resposta mais rápida: é o que
 * faz todas as telas largarem a corrida no mesmo instante.
 */
export function useSorteio<T extends { sorteio: SorteioPublico | null }>(url: string | null, ms = 3000) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [desvio, setDesvio] = useState(0);
  const melhorIda = useRef(Infinity);

  const carregar = useCallback(async () => {
    if (!url) return;
    const ida = performance.now();
    const antes = Date.now();
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    const viagem = performance.now() - ida;
    const b = (await r?.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!r?.ok || !b) {
      setErro(b?.error ?? (r ? `Falha (HTTP ${r.status}).` : tx("Sem conexão.")));
      return;
    }
    setErro(null);
    setDados(b);
    if (b.sorteio && viagem < melhorIda.current) {
      melhorIda.current = viagem;
      setDesvio(b.sorteio.agora - (antes + viagem / 2));
    }
  }, [url]);

  useEffect(() => {
    void carregar();
    const t = setInterval(carregar, ms);
    return () => clearInterval(t);
  }, [carregar, ms]);

  return { dados, erro, desvio, recarregar: carregar };
}
