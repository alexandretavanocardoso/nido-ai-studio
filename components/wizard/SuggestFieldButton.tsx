"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useCharacters } from "@/lib/store";
import { writePath } from "@/lib/paths";
import { cn } from "@/lib/cn";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

interface Props {
  characterId: string;
  fieldId: string;
  descricao: string;
  className?: string;
}

export function SuggestFieldButton({
  characterId,
  fieldId,
  descricao,
  className,
}: Props) {
  const update = useCharacters((s) => s.update);
  const character = useCharacters((s) =>
    s.characters.find((c) => c.id === characterId),
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (!character) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/sugerir-campo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character, fieldId, fieldDescricao: descricao }),
      });
      const data = await res.json();
      avisarCreditos(); // gastou (ou foi estornado): atualiza o saldo
      if (!res.ok) {
        setErr(txErro(data?.error ?? "Falha ao sugerir."));
        return;
      }
      update(characterId, (c) => {
        writePath(c as unknown as Record<string, unknown>, fieldId, data.valor);
        c._suggestions[fieldId] = "suposicao";
      });
    } catch (e) {
      setErr((e as Error).message ?? "Falha de rede.");
    } finally {
      setLoading(false);
      if (err) setTimeout(() => setErr(null), 3000);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={err ?? tx("Deixar a IA sugerir este campo")}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] mono uppercase tracking-wider font-bold text-accent hover:text-white transition disabled:opacity-50",
        className,
      )}
    >
      <Sparkles className={cn("w-3 h-3", loading && "animate-pulse")} />
      {loading ? "gerando…" : tx("Sugerir com IA")}
    </button>
  );
}
