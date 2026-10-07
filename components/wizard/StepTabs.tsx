"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { STEPS } from "@/data/steps";
import type { StepId } from "@/lib/types";
import type { Character } from "@/lib/types";
import { stepCompletion } from "@/lib/completion";
import { useT, type Chave } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";

interface Props {
  current: StepId;
  character: Character;
  onPick: (id: StepId) => void;
  /** "horizontal" (mobile/tablet, scroll horizontal) ou "vertical" (sidebar). */
  orientation?: "horizontal" | "vertical";
}

export function StepTabs({
  current,
  character,
  onPick,
  orientation = "horizontal",
}: Props) {
  const t = useT();
  const completion = stepCompletion(character);
  const vertical = orientation === "vertical";
  return (
    <nav
      aria-label={tx("Etapas da ficha")}
      className={cn(
        vertical
          ? "grid gap-0.5"
          : "flex overflow-x-auto gap-2 pb-2 -mx-1 px-1 scroll-smooth",
      )}
    >
      {STEPS.map((step, i) => {
        const active = step.id === current;
        const pct = completion[step.id];
        const feito = pct >= 100;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onPick(step.id)}
            aria-current={active ? "step" : undefined}
            title={`${t(`passo.${step.id}.titulo` as Chave)} — ${t(`passo.${step.id}.subtitulo` as Chave)} (${pct}%)`}
            className={cn(
              "group flex items-center gap-3 rounded-xl text-left transition",
              vertical ? "w-full px-2.5 py-2" : "shrink-0 px-3 py-2 border",
              active
                ? vertical
                  ? "bg-card"
                  : "border-accent bg-accent/10"
                : vertical
                  ? "hover:bg-panel"
                  : "border-line hover:border-line-strong",
            )}
          >
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold shrink-0 tabular-nums transition",
                active
                  ? "bg-accent text-bg"
                  : feito
                    ? "bg-accent/15 text-accent"
                    : "border border-line-strong text-ink-mute",
              )}
            >
              {feito && !active ? (
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[14px] font-semibold",
                  vertical ? "truncate" : "whitespace-nowrap",
                  active ? "text-ink" : "text-ink-mute group-hover:text-ink",
                )}
              >
                {t(`passo.${step.id}.titulo` as Chave)}
              </span>
              {vertical && (
                <span className="mt-1 block h-1 rounded-full bg-line overflow-hidden">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      feito ? "bg-accent" : "bg-ink-dim",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
