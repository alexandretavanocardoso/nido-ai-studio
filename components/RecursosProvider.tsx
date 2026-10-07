"use client";

import { createContext, useContext } from "react";
import type { Recursos } from "@/lib/recursos";

const NENHUM: Recursos = {
  login: false,
  armazenamento: false,
  ia: false,
  gemini: false,
  fal: false,
  runway: false,
  apify: false,
  social: false,
  voz: false,
  stripe: false,
  usdc: false,
  usdcRedes: [],
};

const Ctx = createContext<Recursos>(NENHUM);

/** Recebe do layout (servidor) quais recursos este deploy tem. */
export function RecursosProvider({
  recursos,
  children,
}: {
  recursos: Recursos;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={recursos}>{children}</Ctx.Provider>;
}

/** Recursos disponíveis neste deploy (ver lib/recursos.ts). */
export function useRecursos(): Recursos {
  return useContext(Ctx);
}
