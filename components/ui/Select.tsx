"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Combo com a cara dos campos de texto (input-base): sem a seta do sistema,
 * com a nossa a uma distância confortável da borda, e o texto longo cortado
 * com reticências em vez de passar por baixo da seta.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <select
        ref={ref}
        className="input-base cursor-pointer appearance-none truncate pr-10 disabled:cursor-not-allowed disabled:opacity-50"
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute"
      />
    </div>
  );
});
