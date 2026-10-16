"use client";

import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useCharacters } from "@/lib/store";
import { useDuravel } from "@/lib/duravel";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { StepId } from "@/lib/types";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";
import { camposDaEtapaParaIA } from "@/lib/campos-ficha";
import { txErro } from "@/lib/i18n/erros";

interface Props {
  characterId: string;
  stepId: StepId;
  stepTitulo: string;
}

export function RegenerateSection({ characterId, stepId, stepTitulo }: Props) {
  const [open, setOpen] = useDuravel<boolean>(`regenerar:${characterId}:${stepId}:open`, false);
  const t = useT();
  const [instrucao, setInstrucao] = useState("");
  const [loading, setLoading] = useDuravel<boolean>(
    `regenerar:${characterId}:${stepId}:loading`,
    false,
    "Preenchendo a etapa com IA",
  );
  const [err, setErr] = useDuravel<string | null>(`regenerar:${characterId}:${stepId}:err`, null);

  const character = useCharacters((s) =>
    s.characters.find((c) => c.id === characterId),
  );
  const applySuggestions = useCharacters((s) => s.applySuggestions);

  if (!character || stepId === "revisao") return null;

  const campos = camposDaEtapaParaIA(stepId as Exclude<StepId, "revisao">);

  async function onRegerar() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/regenerar-secao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character,
          stepId,
          stepTitulo,
          campos,
          instrucao: instrucao.trim() || undefined,
          travados: character!._locks,
        }),
      });
      const data = await res.json();
      avisarCreditos(); // gastou (ou foi estornado): atualiza o saldo
      if (!res.ok) {
        setErr(txErro(data?.error ?? "Falha ao regenerar."));
        return;
      }
      applySuggestions(
        characterId,
        data.suggestions ?? [],
        `Regenerar: ${stepTitulo}`,
      );
      setOpen(false);
      setInstrucao("");
    } catch (e) {
      setErr((e as Error).message ?? "Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 h-9 text-[13px] font-semibold text-accent hover:bg-accent/20 transition"
      >
        <RefreshCw className="w-4 h-4" />
        {t("etapa.preencherIA")}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-accent/30 bg-accent/5 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="label-cap !text-accent">
          {tx("Regenerar:")} {stepTitulo}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-6 w-6 inline-flex items-center justify-center rounded-full text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[13px] text-ink-mute mb-2 leading-relaxed">
        {tx("Campos travados (")}
        {character._locks.length}
        {tx(") não serão alterados. Instrução é opcional.")}
      </p>
      <Input
        placeholder={tx(
          "O que mudar? Ex.: 'mais sério', 'menos clichê', 'tom mais técnico'",
        )}
        value={instrucao}
        onChange={(e) => setInstrucao(e.target.value)}
        disabled={loading}
      />
      {err ? <div className="mt-2 text-[13px] text-pink">{err}</div> : null}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={loading}
          className="text-[13px] text-ink-mute hover:text-ink font-semibold px-3 py-1.5"
        >
          {tx("Cancelar")}
        </button>
        <button
          type="button"
          onClick={onRegerar}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-1.5 bg-accent hover:bg-accent-strong text-bg font-bold text-[13px] px-4 py-1.5 rounded-full transition disabled:opacity-50",
          )}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          {loading ? tx("Regenerando…") : tx("Regenerar")}
        </button>
      </div>
    </div>
  );
}
