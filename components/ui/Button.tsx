"use client";

import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "accent" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: "bg-white text-bg hover:bg-ink-mute",
  accent: "bg-accent text-bg hover:bg-accent-strong shadow-glow",
  ghost:
    "bg-transparent text-ink border border-line-strong hover:bg-panel hover:border-ink/50",
  danger:
    "bg-pink/15 text-pink border border-pink/40 hover:bg-pink hover:text-white",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-4 text-[13px]",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold rounded-full transition active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
