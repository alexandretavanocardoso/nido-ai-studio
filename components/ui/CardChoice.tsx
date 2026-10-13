"use client";

import { cn } from "@/lib/cn";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

export function CardChoice({
  selected,
  onClick,
  disabled,
  title,
  description,
  icon,
  className,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!selected}
      className={cn(
        "text-left rounded-xl border p-3.5 transition relative",
        selected
          ? "border-accent bg-accent/5 shadow-glow"
          : "border-line bg-panel hover:border-line-strong hover:bg-card",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {icon ? (
          <div
            className={cn(
              "shrink-0 mt-0.5",
              selected ? "text-accent" : "text-ink-mute",
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">{title}</div>
          {description ? (
            <div className="text-[13px] text-ink-mute mt-0.5 leading-relaxed">
              {description}
            </div>
          ) : null}
        </div>
        {selected ? (
          <span className="inline-flex shrink-0 items-center justify-center h-5 w-5 rounded-full bg-accent text-bg">
            <Check className="w-3.5 h-3.5" strokeWidth={3} />
          </span>
        ) : null}
      </div>
    </button>
  );
}
