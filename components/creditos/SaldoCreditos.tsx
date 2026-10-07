"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { PLANOS } from "@/lib/planos";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

/** Selo com o saldo de créditos; leva pra página de planos. Some sem créditos ativos. */
export function SaldoCreditos({ className }: { className?: string }) {
  const { conta } = useCreditos();
  if (!conta) return null;
  const baixo = conta.total < 30;
  return (
    <Link
      href="/app/planos"
      title={`Plano ${PLANOS[conta.plano].nome} · ${conta.creditosPlano} do plano + ${conta.creditosAvulsos} avulsos`}
      className={cn(
        "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-[12px] font-bold mono transition",
        baixo
          ? "border-pink/50 text-pink hover:bg-pink/10"
          : "border-line text-ink hover:border-line-strong bg-panel",
        className,
      )}
    >
      <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
      {conta.total.toLocaleString("pt-BR")}
      <span className="font-normal text-ink-dim hidden sm:inline">
        {tx("créditos")}
      </span>
    </Link>
  );
}
