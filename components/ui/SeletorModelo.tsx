"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface OpcaoModelo<T extends string> {
  id: T;
  label: string;
  /** Linha de baixo: para que serve o modelo. */
  nota?: string;
  /** Preço já formatado (ex.: "12 créditos/s"). */
  preco?: string;
}

/**
 * Escolha do modelo de IA numa lista que abre para cima (fica no rodapé dos
 * modais). Cresce com novos modelos sem ocupar a tela: fechada, é só o nome.
 */
export function SeletorModelo<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
}: {
  opcoes: OpcaoModelo<T>[];
  valor: T;
  onChange: (id: T) => void;
  /** Nome acessível do botão (ex.: "Modelo"). */
  rotulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const atual = opcoes.find((o) => o.id === valor) ?? opcoes[0];

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative inline-block max-w-full">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={`${rotulo}: ${atual?.label ?? ""}`}
        className={cn(
          "flex h-11 w-[168px] max-w-full items-center gap-2 rounded-xl border bg-panel pl-3 pr-2.5 text-left transition",
          aberto ? "border-accent" : "border-line hover:border-line-strong",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase leading-none tracking-wider text-ink-dim">
            {rotulo}
          </span>
          <span className="mt-1 block truncate text-[13px] font-bold leading-none text-ink">
            {atual?.label}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-ink-mute transition",
            aberto && "rotate-180",
          )}
        />
      </button>
      {aberto ? (
        <ul
          role="listbox"
          aria-label={rotulo}
          className="absolute bottom-full left-0 z-10 mb-2 max-h-[50dvh] w-[min(300px,calc(100vw-48px))] overflow-y-auto rounded-2xl border border-line bg-panel p-1 shadow-xl"
        >
          {opcoes.map((o) => {
            const escolhido = o.id === valor;
            return (
              <li key={o.id} role="option" aria-selected={escolhido}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setAberto(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition",
                    escolhido ? "bg-accent/10" : "hover:bg-line/40",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-bold text-ink">
                        {o.label}
                      </span>
                      {o.preco ? (
                        <span className="mono shrink-0 text-[11px] text-ink-mute">
                          {o.preco}
                        </span>
                      ) : null}
                    </span>
                    {o.nota ? (
                      <span className="block truncate text-[11px] text-ink-dim">
                        {o.nota}
                      </span>
                    ) : null}
                  </span>
                  <Check
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0 text-accent",
                      !escolhido && "invisible",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
