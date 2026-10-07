"use client";

import { createContext, useContext } from "react";

interface Ctx {
  characterId: string;
}

const WizardContext = createContext<Ctx | null>(null);

export function WizardProvider({
  characterId,
  children,
}: {
  characterId: string;
  children: React.ReactNode;
}) {
  return (
    <WizardContext.Provider value={{ characterId }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizardCharacterId(): string | null {
  return useContext(WizardContext)?.characterId ?? null;
}
