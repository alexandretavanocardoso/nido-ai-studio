"use client";

import { ChevronDown, Lightbulb } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

export function DicaBox({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const t = useT();
  return (
    <div className="rounded-xl border border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <Lightbulb className="w-4 h-4 text-accent" />
        <span className="text-[13px] font-semibold text-ink">
          {t("etapa.dica")}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 ml-auto text-ink-dim transition",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="px-3.5 pb-3.5 pt-0 text-[14px] text-ink-mute leading-relaxed">
          {children}
        </div>
      ) : null}
    </div>
  );
}
