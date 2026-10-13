"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

/**
 * Confirmação no visual do app (no lugar do confirm() do navegador).
 *   if (await confirmar({ titulo: "Cancelar agendamento?", ... })) { ... }
 * O <ConfirmacaoHost /> fica uma vez no layout.
 */
export interface OpcoesConfirmacao {
  titulo: string;
  mensagem?: string;
  /** Texto do botão de confirmar (padrão "Confirmar"). */
  confirmar?: string;
  /** Texto do botão de voltar (padrão "Voltar"). */
  cancelar?: string;
  /** "perigo" = ação destrutiva (botão rosa). */
  tom?: "normal" | "perigo";
}

type Pedido = OpcoesConfirmacao & { responder: (ok: boolean) => void };
let mostrar: ((p: Pedido) => void) | null = null;

export function confirmar(opcoes: OpcoesConfirmacao): Promise<boolean> {
  return new Promise((resolve) => {
    if (!mostrar) return resolve(window.confirm(opcoes.titulo)); // sem o host montado
    mostrar({ ...opcoes, responder: resolve });
  });
}

export function ConfirmacaoHost() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mostrar = setPedido;
    return () => {
      mostrar = null;
    };
  }, []);

  useEffect(() => {
    if (!pedido) return;
    botaoRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && responder(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  function responder(ok: boolean) {
    pedido?.responder(ok);
    setPedido(null);
  }

  if (!pedido) return null;
  const perigo = pedido.tom === "perigo";
  const Icone = perigo ? AlertTriangle : HelpCircle;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmacao-titulo"
      onClick={(e) => e.target === e.currentTarget && responder(false)}
    >
      <div className="card w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 rounded-3xl grid gap-4">
        <div className="flex gap-3.5">
          <span
            className={cn(
              "h-10 w-10 shrink-0 rounded-full grid place-items-center",
              perigo ? "bg-pink/15 text-pink" : "bg-accent/15 text-accent",
            )}
          >
            <Icone className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2
              id="confirmacao-titulo"
              className="text-[17px] font-bold text-ink"
            >
              {pedido.titulo}
            </h2>
            {pedido.mensagem ? (
              <p className="text-[14px] text-ink-mute mt-1 leading-relaxed">
                {pedido.mensagem}
              </p>
            ) : null}
          </div>
        </div>
        {/* flex-wrap: dois botões compridos ("Manter agendado" / "Cancelar agendamento") não cabem lado a lado em 320px. */}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => responder(false)}
            className="h-10 px-5 rounded-full border border-line text-[14px] font-semibold text-ink-mute hover:text-ink"
          >
            {pedido.cancelar ?? tx("Voltar")}
          </button>
          <button
            ref={botaoRef}
            type="button"
            onClick={() => responder(true)}
            className={cn(
              "h-10 px-5 rounded-full text-[14px] font-bold transition",
              perigo
                ? "bg-pink text-white hover:bg-pink/90"
                : "bg-accent text-bg hover:bg-accent-strong",
            )}
          >
            {pedido.confirmar ?? tx("Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
