"use client";
import { tx } from "@/lib/i18n/tx";

import { cn } from "@/lib/cn";
import type { Status } from "@/lib/completion";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mono",
        status === "completo" ? "bg-ok text-bg" : "bg-pink text-white",
      )}
    >
      {status === "completo" ? tx("Completo") : tx("Rascunho")}
    </span>
  );
}
