"use client";

import { cn } from "@/lib/cn";

interface Props {
  value: number;
  onChange: (v: number) => void;
  leftLabel: string;
  rightLabel: string;
  className?: string;
}

export function Slider({
  value,
  onChange,
  leftLabel,
  rightLabel,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-ink-dim mono uppercase tracking-wider">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
