"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRecursos } from "@/components/RecursosProvider";
import type { EstadoEmTeste } from "@/lib/em-teste";
import type { Intervalo, PlanoId } from "@/lib/planos";

export interface ContaCreditos {
  plano: PlanoId;
  intervalo: Intervalo | null;
  planoExpiraEm: string | null;
  proximaRecargaEm: string | null;
  creditosPlano: number;
  creditosAvulsos: number;
  avulsosExpiraEm: string | null;
  total: number;
  assinaturaAtiva: boolean;
  personagens: number;
  armazenamento: { usadoBytes: number; cotaBytes: number };
  /** Mostra o link da área admin (o acesso em si é checado no servidor). */
  admin?: boolean;
  /** Recursos em teste (lib/em-teste.ts): true = só admin vê. */
  emTeste?: Partial<EstadoEmTeste>;
}

interface Estado {
  /** null = carregando ou sem login; undefined = créditos desligados (modo dev). */
  conta: ContaCreditos | null | undefined;
  recarregar: () => void;
}

const Ctx = createContext<Estado>({ conta: undefined, recarregar: () => {} });

const EVENTO = "creditos:atualizar";

/** Avise depois de qualquer chamada que gasta ou devolve créditos. */
export function avisarCreditos() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Saldo e plano da conta logada, atualizado ao gastar créditos (evento) e ao voltar pra aba. */
export function CreditosProvider({ children }: { children: React.ReactNode }) {
  const { login } = useRecursos();
  const { user } = useAuth();
  const [conta, setConta] = useState<ContaCreditos | null | undefined>(
    login ? null : undefined,
  );

  const recarregar = useCallback(() => {
    if (!login || !user) return;
    fetch("/api/conta/creditos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: (ContaCreditos & { ativo: boolean }) | null) => {
        if (!b) return;
        setConta(b.ativo ? b : undefined);
      })
      .catch(() => {});
  }, [login, user]);

  useEffect(() => {
    if (!login) return;
    if (!user) {
      setConta(null);
      return;
    }
    recarregar();
    const onFoco = () => document.visibilityState === "visible" && recarregar();
    window.addEventListener(EVENTO, recarregar);
    document.addEventListener("visibilitychange", onFoco);
    return () => {
      window.removeEventListener(EVENTO, recarregar);
      document.removeEventListener("visibilitychange", onFoco);
    };
  }, [login, user, recarregar]);

  return <Ctx.Provider value={{ conta, recarregar }}>{children}</Ctx.Provider>;
}

export function useCreditos(): Estado {
  return useContext(Ctx);
}
