"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import type { Character } from "@/lib/types";
import { fileUrl } from "@/lib/storage/client";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

export interface OpcaoImagem {
  key: string;
  label: string;
}

/** Imagens do personagem no S3: retratos gerados primeiro, depois cards e referências. */
export function useImagensPersonagem(character: Character): OpcaoImagem[] {
  return useMemo(() => {
    const geradas = (character.geradas ?? [])
      .filter((g) => g.tipo !== "troca")
      .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "retrato" ? -1 : 1))
      .map((g) => ({
        key: g.key,
        label: g.tipo === "retrato" ? "Retrato gerado" : "Card gerado",
      }));
    const refs = character.visual.referencias
      .filter((r) => r.key)
      .map((r) => ({ key: r.key!, label: r.name }));
    const vistas = new Set<string>();
    return [...geradas, ...refs].filter(
      (o) => !vistas.has(o.key) && vistas.add(o.key),
    );
  }, [character]);
}

interface Props {
  opcoes: OpcaoImagem[];
  valor: string | null;
  onChange: (key: string) => void;
  dica?: string;
  /** Miniaturas menores numa linha só (rola na horizontal, sem barra). */
  compacto?: boolean;
}

export function EscolherImagemPersonagem({
  opcoes,
  valor,
  onChange,
  dica,
  compacto,
}: Props) {
  if (opcoes.length === 0) {
    return (
      <p className={cn("text-[13px] text-ink-mute", !compacto && "mb-4")}>
        {tx(
          "Nenhuma imagem do personagem no S3 ainda. Gere um retrato na etapa Visual (ou envie uma referência) e volte aqui.",
        )}
      </p>
    );
  }
  return (
    <>
      <div
        className={cn(
          "flex gap-2",
          compacto
            ? "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "flex-wrap mb-1.5",
        )}
      >
        {opcoes.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            title={o.label}
            aria-pressed={valor === o.key}
            className={cn(
              "relative rounded-lg overflow-hidden border-2 transition bg-bg shrink-0",
              compacto ? "h-16 w-12" : "h-24 w-[4.5rem]",
              valor === o.key
                ? "border-accent"
                : "border-line opacity-60 hover:opacity-100",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl(o.key)}
              alt={o.label}
              className="w-full h-full object-cover"
            />
            {valor === o.key && (
              <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-accent text-bg inline-flex items-center justify-center">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
      </div>
      {dica ? <p className="text-[11px] text-ink-dim mb-4">{dica}</p> : null}
    </>
  );
}
