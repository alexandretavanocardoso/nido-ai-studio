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

/** Idioma de quem ainda não escolheu nenhum (e o da primeira renderização, no servidor). */
export const IDIOMA_PADRAO: Idioma = "en";

export const useIdioma = create<{
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
}>()(
  persist(
    (set) => ({
      idioma: IDIOMA_PADRAO,
      setIdioma: (idioma) => set({ idioma }),
    }),
    { name: "nido-idioma" },
  ),
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
  // Assina o idioma para re-renderizar; o valor efetivo vem de <ComIdioma> (o padrão até montar).
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

let jaMontou = false;

/**
 * Aplica o idioma escolhido a tx()/useT() e remonta a árvore quando ele muda.
 * O servidor e a primeira renderização no navegador saem no idioma padrão
 * (sem diferença de hidratação); depois de montar, troca para o idioma salvo.
 */
export function ComIdioma({ children }: { children: ReactNode }) {
  const idioma = useIdioma((s) => s.idioma);
  // Remontado depois da hidratação (ex.: troca de moeda em volta dele): já
  // pode usar o idioma salvo, sem passar de novo pelo padrão.
  const [montado, setMontado] = useState(jaMontou);
  useEffect(() => {
    jaMontou = true;
    setMontado(true);
  }, []);
  const efetivo = montado ? idioma : IDIOMA_PADRAO;
  definirIdiomaAtivo(efetivo);
  return <Fragment key={efetivo}>{children}</Fragment>;
}
