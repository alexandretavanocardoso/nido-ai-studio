"use client";
import { tx } from "@/lib/i18n/tx";

import { cn } from "@/lib/cn";
import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  className?: string;
  id?: string;
}

export function TagInput({
  value,
  onChange,
  placeholder,
  max,
  className,
  id,
}: Props) {
  const [buf, setBuf] = useState("");

  function commit(raw: string) {
    const parts = raw
      .split(/,|\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      if (max && next.length >= max) break;
      if (!next.map((x) => x.toLowerCase()).includes(p.toLowerCase()))
        next.push(p);
    }
    onChange(next);
    setBuf("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(buf);
    } else if (e.key === "Backspace" && !buf && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const atMax = max != null && value.length >= max;

  return (
    <div className={cn("input-base !py-2 flex flex-wrap gap-1.5", className)}>
      {value.map((tag) => (
        <span
          key={tag}
          // max-w-full + truncate: uma tag comprida sem espaço (um @, um link) não passa da caixa.
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-accent/15 border border-accent/40 text-accent px-2.5 py-0.5 text-[13px] font-medium"
          title={tag}
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            // O ::after aumenta a área de toque do X (14px) para ~30px sem mexer no desenho.
            className="relative shrink-0 opacity-70 hover:opacity-100 after:absolute after:-inset-2 after:content-['']"
            aria-label={`Remover ${tag}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}
      <input
        id={id}
        className="flex-1 min-w-[8ch] bg-transparent focus:outline-none text-sm py-1 text-ink placeholder:text-ink-dim"
        placeholder={
          atMax
            ? tx("Limite atingido")
            : (placeholder ?? tx("Digite e pressione Enter"))
        }
        value={buf}
        disabled={atMax}
        onChange={(e) => setBuf(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => commit(buf)}
      />
    </div>
  );
}
