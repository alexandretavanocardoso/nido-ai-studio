"use client";

import { createContext, useContext } from "react";
import type { Recursos } from "@/lib/recursos";

const NENHUM: Recursos = {
  login: false,
  discord: false,
  linkedin: false,
  twitter: false,
  armazenamento: false,
  ia: false,
  gemini: false,
  fal: false,
  openai: false,
  runway: false,
  sapiens: false,
  apify: false,
  social: false,
  voz: false,
  stripe: false,
  radarX: false,
  usdc: false,
  usdcRedes: [],
  nft: false,
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
