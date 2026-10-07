"use client";

import { ArrowLeft, ArrowRight, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { STEPS, stepIndex } from "@/data/steps";
import type { StepId } from "@/lib/types";
import { useT } from "@/lib/i18n";

interface Props {
  current: StepId;
  onChange: (id: StepId) => void;
  onFinish?: () => void;
}

export function StepFooter({ current, onChange, onFinish }: Props) {
  const t = useT();
  const i = stepIndex(current);
  const prev = i > 0 ? STEPS[i - 1] : null;
  const next = i < STEPS.length - 1 ? STEPS[i + 1] : null;
  const isLast = !next;

  return (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-line">
      <Button
        variant="ghost"
        onClick={() => prev && onChange(prev.id)}
        disabled={!prev}
      >
        <ArrowLeft className="w-4 h-4" />
        {t("etapa.voltar")}
      </Button>

      <div className="text-[12px] text-ink-dim tabular-nums hidden sm:block">
        {t("etapa.xDeY", { x: i + 1, y: STEPS.length })}
      </div>
      <Button
        variant="accent"
        onClick={() => (isLast ? onFinish?.() : onChange(next.id))}
      >
        {isLast ? (
          <>
            {t("etapa.irEstudio")}
            <Wand2 className="w-4 h-4" />
          </>
        ) : (
          <>
            {t("etapa.avancar")}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </Button>
    </div>
  );
}
