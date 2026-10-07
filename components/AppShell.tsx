"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { CreateDialog } from "@/components/home/CreateDialog";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { useCharacters } from "@/lib/store";
import { PLANOS } from "@/lib/planos";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";

interface Criar {
  /** Abre o "criar personagem" (ou manda pro login / avisa do limite do plano). */
  criar: () => void;
  /** O plano não deixa criar mais personagens (mostra o aviso de upgrade). */
  noLimite: boolean;
}

const CriarCtx = createContext<Criar>({ criar: () => {}, noLimite: false });
export const useCriar = () => useContext(CriarCtx);

/**
 * Casca de todas as telas do app (/app/*): a barra do topo — marca, saldo,
 * conta e "+ Novo" — e o diálogo de criar personagem, que abre de qualquer tela.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const recursos = useRecursos();
  const router = useRouter();
  const { user } = useAuth();
  const { conta } = useCreditos();
  const total = useCharacters((s) => s.characters.length);
  const [aberto, setAberto] = useState(false);
  const [noLimite, setNoLimite] = useState(false);
  const limite = conta ? PLANOS[conta.plano].personagens : Infinity;

  const criar = useCallback(() => {
    if (recursos.login && user === null) return; // sessão ainda carregando
    if (recursos.login && user === undefined) return router.push("/auth/login");
    // Limite de personagens do plano: avisa em vez de criar um que não sincronizaria.
    if (total >= limite) {
      setNoLimite(true);
      return router.push("/app");
    }
    setNoLimite(false);
    setAberto(true);
  }, [recursos.login, user, router, total, limite]);

  return (
    <CriarCtx.Provider value={{ criar, noLimite: noLimite && total >= limite }}>
      <BarraDoApp onCriar={criar} />
      {children}
      <CreateDialog open={aberto} onClose={() => setAberto(false)} />
    </CriarCtx.Provider>
  );
}

/** Altura da barra: 56px (h-14). Elementos "sticky" das telas ficam abaixo dela (top-20). */
function BarraDoApp({ onCriar }: { onCriar: () => void }) {
  const t = useT();
  return (
    <nav
      aria-label={tx("Principal")}
      className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-lg"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link
          href="/app"
          className="flex items-center gap-2 min-w-0 rounded-lg hover:opacity-90 transition"
          aria-label={t("personagem.voltar")}
        >
          <span className="h-6 w-6 rounded bg-accent flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-bg" strokeWidth={3} />
          </span>
          <span className="font-bold text-sm uppercase tracking-wider truncate hidden min-[420px]:inline">
            {tx("Influenciador Sintético")}
          </span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <AccountMenu />
          <Button variant="accent" size="sm" onClick={onCriar}>
            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            <span className="hidden sm:inline">{tx("Novo")}</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
