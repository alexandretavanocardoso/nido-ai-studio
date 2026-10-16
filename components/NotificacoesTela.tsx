"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import {
  fecharDaTela,
  useNaTela,
  type NotificacaoTela,
} from "@/lib/notificar";

/** Quanto tempo cada notificação fica (o erro fica mais, para dar tempo de ler). */
const TEMPO_MS = { ok: 6_000, info: 6_000, erro: 10_000 } as const;

/**
 * As notificações do sistema (lib/notificar.ts, `avisarNaTela`), no canto de
 * cima à direita, logo abaixo da barra do topo. Ficam por cima de tudo,
 * inclusive dos modais (z-[60]).
 */
export function NotificacoesTela() {
  const lista = useNaTela();
  if (!lista.length) return null;
  return (
    <div
      className="pointer-events-none fixed right-4 top-[72px] z-[60] grid w-[min(360px,calc(100vw-2rem))] gap-2"
      role="status"
      aria-live="polite"
    >
      {lista.map((n) => (
        <Cartao key={n.id} n={n} />
      ))}
    </div>
  );
}

function Cartao({ n }: { n: NotificacaoTela }) {
  useEffect(() => {
    const t = setTimeout(() => fecharDaTela(n.id), TEMPO_MS[n.tom]);
    return () => clearTimeout(t);
  }, [n.id, n.tom]);
  const Icone = n.tom === "erro" ? AlertTriangle : n.tom === "info" ? Info : Check;
  return (
    <div className="pointer-events-auto flex items-start gap-2.5 rounded-2xl border border-line-strong bg-panel/95 px-3.5 py-3 shadow-xl backdrop-blur">
      <Icone
        className={cn(
          "mt-px h-4 w-4 shrink-0",
          n.tom === "erro" ? "text-pink" : n.tom === "info" ? "text-accent" : "text-ok",
        )}
      />
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
        {n.texto}
        {n.href ? (
          <>
            {" "}
            <Link
              href={n.href}
              onClick={() => fecharDaTela(n.id)}
              className="font-semibold text-accent hover:underline"
            >
              {tx("Ver")}
            </Link>
          </>
        ) : null}
      </p>
      <button
        type="button"
        onClick={() => fecharDaTela(n.id)}
        aria-label={tx("Fechar")}
        title={tx("Fechar")}
        className="-m-1 shrink-0 p-1 text-ink-dim hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
