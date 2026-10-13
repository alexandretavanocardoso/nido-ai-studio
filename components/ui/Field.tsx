"use client";

import { cn } from "@/lib/cn";
import { Check, Lock, LockOpen, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useCharacters } from "@/lib/store";
import { useWizardCharacterId } from "@/components/wizard/WizardContext";
import { SuggestFieldButton } from "@/components/wizard/SuggestFieldButton";
import { useRecursos } from "@/components/RecursosProvider";
import { tx } from "@/lib/i18n/tx";
import { ehCampoManual } from "@/lib/campos-manuais";

interface FieldProps {
  label: string;
  hint?: string;
  optional?: boolean;
  htmlFor?: string;
  counter?: { value: number; max: number };
  fieldId?: string;
  aiDescricao?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  hint,
  optional,
  htmlFor,
  counter,
  fieldId,
  aiDescricao,
  children,
  className,
}: FieldProps) {
  const recursos = useRecursos();
  const characterId = useWizardCharacterId();
  const suggestion = useCharacters((s) =>
    characterId && fieldId
      ? s.characters.find((c) => c.id === characterId)?._suggestions[fieldId]
      : undefined,
  );
  const locked = useCharacters((s) =>
    characterId && fieldId
      ? (s.characters
          .find((c) => c.id === characterId)
          ?._locks.includes(fieldId) ?? false)
      : false,
  );
  const confirmSuggestion = useCharacters((s) => s.confirmSuggestion);
  const toggleLock = useCharacters((s) => s.toggleLock);

  const showBadge = !!suggestion && !!characterId && !!fieldId;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="label-cap inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0"
        >
          {label}
          {optional ? (
            <span className="text-ink-dim normal-case font-normal tracking-normal">
              {tx("(opcional)")}
            </span>
          ) : null}
          {showBadge ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] mono font-bold normal-case tracking-normal",
                suggestion === "contexto"
                  ? "bg-ok/15 text-ok border border-ok/30"
                  : "bg-accent/15 text-accent border border-accent/30",
              )}
              title={
                suggestion === "contexto"
                  ? tx("Veio do seu contexto")
                  : tx("Sugestão — revise")
              }
            >
              <Sparkles className="w-2.5 h-2.5" />
              {suggestion === "contexto" ? tx("do contexto") : "sugestão"}
            </span>
          ) : null}
        </label>
        <div className="flex items-center gap-2">
          {recursos.ia && characterId && fieldId ? (
            <button
              type="button"
              onClick={() => toggleLock(characterId, fieldId)}
              className={cn(
                // O ::after aumenta a área de toque para ~36px sem mexer no desenho (o cadeado tem 20px).
                "relative h-5 w-5 inline-flex items-center justify-center rounded-md transition after:absolute after:-inset-2 after:content-['']",
                locked ? "text-accent" : "text-ink-dim hover:text-ink",
              )}
              aria-pressed={locked}
              title={
                locked
                  ? tx("Travado — regeneração não altera")
                  : tx("Travar campo")
              }
            >
              {locked ? (
                <Lock className="w-3 h-3" />
              ) : (
                <LockOpen className="w-3 h-3" />
              )}
            </button>
          ) : null}
          {counter ? (
            <span
              className={cn(
                "text-[11px] tabular-nums mono",
                counter.value > counter.max ? "text-pink" : "text-ink-dim",
              )}
            >
              {counter.value}/{counter.max}
            </span>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          showBadge &&
            "rounded-xl ring-1 ring-dashed ring-accent/60 p-0.5 -m-0.5",
        )}
      >
        {children}
      </div>
      <div className="flex items-center justify-between gap-3 min-h-[16px]">
        {hint ? (
          <p className="text-[13px] text-ink-mute leading-relaxed">{hint}</p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {recursos.ia &&
          !showBadge &&
          characterId &&
          fieldId &&
          !ehCampoManual(fieldId) &&
          aiDescricao ? (
            <SuggestFieldButton
              characterId={characterId}
              fieldId={fieldId}
              descricao={aiDescricao}
            />
          ) : null}
          {showBadge && characterId && fieldId ? (
            <button
              type="button"
              onClick={() => confirmSuggestion(characterId, fieldId)}
              className="text-[11px] mono text-accent hover:text-white inline-flex items-center gap-1 font-bold uppercase tracking-wider"
            >
              <Check className="w-3 h-3" />
              {tx("Confirmar")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
