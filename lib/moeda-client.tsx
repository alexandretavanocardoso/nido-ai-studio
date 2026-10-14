"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { definirMoedaAtiva, MOEDA_PADRAO, type Moeda } from "./moeda";

/** Moeda escolhida (ver lib/moeda.ts). Fica salva no navegador, como o idioma. */
export const useMoeda = create<{
  moeda: Moeda;
  setMoeda: (m: Moeda) => void;
}>()(
  persist(
    (set) => ({
      moeda: MOEDA_PADRAO,
      setMoeda: (moeda) => set({ moeda }),
    }),
    { name: "nido-moeda" },
  ),
);

let jaMontou = false;

/**
 * Aplica a moeda escolhida a dinheiro()/moedaAtual() e remonta a árvore
 * quando ela muda. Como <ComIdioma>: o servidor e a primeira renderização
 * saem na moeda padrão; depois de montar, troca para a salva.
 */
export function ComMoeda({
  cambio,
  children,
}: {
  /** Reais por dólar, do servidor (CAMBIO_USD_BRL). */
  cambio: number;
  children: ReactNode;
}) {
  const moeda = useMoeda((s) => s.moeda);
  // Remontado depois da hidratação: já pode usar a moeda salva.
  const [montado, setMontado] = useState(jaMontou);
  useEffect(() => {
    jaMontou = true;
    setMontado(true);
  }, []);
  const efetiva = montado ? moeda : MOEDA_PADRAO;
  definirMoedaAtiva(efetiva, cambio);
  useEffect(() => {
    // O servidor lê este cookie (ex.: a moeda padrão do pagamento).
    document.cookie = `nido-moeda=${moeda}; path=/; max-age=31536000; samesite=lax`;
  }, [moeda]);
  return <Fragment key={efetiva}>{children}</Fragment>;
}
