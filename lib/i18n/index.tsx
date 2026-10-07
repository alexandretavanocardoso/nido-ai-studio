"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { en } from "./en";
import { pt, type Chave } from "./pt";
import { definirIdiomaAtivo, idiomaAtual } from "./tx";

/**
 * Idioma da interface (PT-BR / EN). Fica salvo no navegador.
 *   const t = useT();  t("conta.sair")  t("etapa.xDeY", { x: 2, y: 7 })
 * Textos que ainda não estão no dicionário continuam em português.
 */
export type Idioma = "pt" | "en";
export type { Chave };

export const IDIOMAS: Array<{ id: Idioma; rotulo: string; bandeira: string }> =
  [
    { id: "pt", rotulo: "Português (BR)", bandeira: "🇧🇷" },
    { id: "en", rotulo: "English", bandeira: "🇺🇸" },
  ];

export const useIdioma = create<{
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
}>()(
  persist((set) => ({ idioma: "pt", setIdioma: (idioma) => set({ idioma }) }), {
    name: "nido-idioma",
  }),
);

const DICIONARIOS: Record<Idioma, Record<Chave, string>> = { pt, en };

export function traduzir(
  idioma: Idioma,
  chave: Chave,
  vars?: Record<string, string | number>,
): string {
  const texto = DICIONARIOS[idioma][chave] ?? pt[chave] ?? chave;
  return vars
    ? texto.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
    : texto;
}

export function useT() {
  // Assina o idioma para re-renderizar; o valor efetivo vem de <ComIdioma> (pt até montar).
  useIdioma((s) => s.idioma);
  const idioma = idiomaAtual();
  return (chave: Chave, vars?: Record<string, string | number>) =>
    traduzir(idioma, chave, vars);
}

/** Mantém o <html lang> igual ao idioma escolhido (leitores de tela, tradutor do navegador). */
export function IdiomaDoDocumento() {
  const idioma = useIdioma((s) => s.idioma);
  useEffect(() => {
    document.documentElement.lang = idioma === "en" ? "en" : "pt-BR";
    // O servidor lê este cookie para a IA escrever no mesmo idioma (lib/ai/idioma.ts).
    document.cookie = `nido-idioma=${idioma}; path=/; max-age=31536000; samesite=lax`;
  }, [idioma]);
  return null;
}

/**
 * Aplica o idioma escolhido a tx()/useT() e remonta a árvore quando ele muda.
 * O servidor e a primeira renderização no navegador saem em português (sem
 * diferença de hidratação); depois de montar, troca para o idioma salvo.
 */
export function ComIdioma({ children }: { children: ReactNode }) {
  const idioma = useIdioma((s) => s.idioma);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const efetivo = montado ? idioma : "pt";
  definirIdiomaAtivo(efetivo);
  return <Fragment key={efetivo}>{children}</Fragment>;
}
