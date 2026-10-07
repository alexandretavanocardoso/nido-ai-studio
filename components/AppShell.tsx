"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Flame, Plus, Sparkles } from "lucide-react";
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
          <AvisosRadar />
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

interface AvisoRadar {
  characterId: string;
  dia: string;
  destaques: number;
  titulo: string;
}

/**
 * Sino da barra: radares novos (de hoje ou ontem) com assunto quente, ainda
 * não abertos. Some quando não há aviso. Abrir o Radar do personagem limpa o dele.
 */
function AvisosRadar() {
  const { user } = useAuth();
  const recursos = useRecursos();
  const personagens = useCharacters((s) => s.characters);
  const [avisos, setAvisos] = useState<AvisoRadar[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    if (!recursos.login || !user) return setAvisos([]);
    fetch("/api/radar/avisos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { avisos?: AvisoRadar[] } | null) => setAvisos(b?.avisos ?? []))
      .catch(() => {});
  }, [recursos.login, user]);

  useEffect(() => {
    carregar();
    // O Radar avisa quando foi aberto; ao voltar para a aba, confere de novo.
    const visto = () => carregar();
    const foco = () => document.visibilityState === "visible" && carregar();
    window.addEventListener("nido:radar-visto", visto);
    document.addEventListener("visibilitychange", foco);
    return () => {
      window.removeEventListener("nido:radar-visto", visto);
      document.removeEventListener("visibilitychange", foco);
    };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  if (!avisos.length) return null;
  const total = avisos.reduce((t, a) => t + a.destaques, 0);
  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={`${tx("Avisos do radar")}: ${total}`}
        aria-expanded={aberto}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-full border border-line bg-panel text-ink hover:border-line-strong transition"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-bg text-[11px] font-bold grid place-items-center">
          {total}
        </span>
      </button>
      {aberto ? (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel shadow-card overflow-hidden z-40">
          <div className="px-3.5 py-2.5 border-b border-line text-[11px] mono uppercase tracking-wider text-ink-dim">
            {tx("Em alta nos seus personagens")}
          </div>
          {avisos.map((a) => {
            const nome =
              personagens.find((c) => c.id === a.characterId)?.identidade
                .nome || tx("Sem nome");
            return (
              <Link
                key={a.characterId}
                href={`/app/personagem/${a.characterId}?aba=radar`}
                onClick={() => setAberto(false)}
                className="flex gap-2.5 px-3.5 py-3 hover:bg-bg transition border-b border-line last:border-b-0"
              >
                <Flame className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink truncate">
                    {nome} · {a.destaques}{" "}
                    {a.destaques === 1
                      ? tx("assunto quente")
                      : tx("assuntos quentes")}
                  </span>
                  <span className="block text-[12px] text-ink-mute line-clamp-2">
                    {a.titulo}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
