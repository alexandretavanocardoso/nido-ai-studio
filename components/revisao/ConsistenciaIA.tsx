"use client";

import { useState } from "react";
import { AlertTriangle, Info, Loader2, Wand2 } from "lucide-react";
import { useCharacters } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import type { AlertaIA } from "@/lib/ai/schema";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { tx } from "@/lib/i18n/tx";

export function ConsistenciaIA({ characterId }: { characterId: string }) {
  const character = useCharacters((s) =>
    s.characters.find((c) => c.id === characterId),
  );
  const [alertas, setAlertas] = useState<AlertaIA[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!character) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/checar-consistencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character }),
      });
      const data = await res.json();
      avisarCreditos(); // gastou (ou foi estornado): atualiza o saldo
      if (!res.ok) {
        setErr(data?.error ?? "Falha ao checar.");
        return;
      }
      setAlertas(data.alertas ?? []);
    } catch (e) {
      setErr((e as Error).message ?? "Falha de rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="label-cap">{tx("Checagem profunda com IA")}</h3>
        <Button variant="ghost" size="sm" onClick={run} disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4" />
          )}
          {loading
            ? tx("Checando…")
            : alertas
              ? tx("Checar de novo")
              : tx("Checar com IA")}
        </Button>
      </div>

      {err ? (
        <div className="rounded-xl border border-pink/40 bg-pink/10 px-3.5 py-2.5 text-sm text-pink">
          {err}
        </div>
      ) : null}

      {alertas && alertas.length === 0 ? (
        <div className="rounded-xl border border-ok/30 bg-ok/10 p-4 text-sm text-ok">
          {tx("A IA não encontrou contradições, clichês ou campos genéricos.")}
        </div>
      ) : null}

      {alertas && alertas.length > 0 ? (
        <ul className="grid gap-2">
          {alertas.map((a, i) => (
            <li
              key={i}
              className={cn(
                "rounded-xl border p-3 text-sm flex gap-3",
                a.tipo === "contradicao"
                  ? "border-pink/40 bg-pink/5"
                  : a.tipo === "cliche"
                    ? "border-accent/30 bg-accent/5"
                    : "border-line bg-panel",
              )}
            >
              {a.tipo === "contradicao" ? (
                <AlertTriangle className="w-4 h-4 text-pink mt-0.5 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-ink-mute mt-0.5 shrink-0" />
              )}
              <div>
                <div className="font-semibold text-ink">{a.mensagem}</div>
                <div className="text-[11px] mono text-ink-dim mt-0.5">
                  {a.tipo.toUpperCase()} {tx("· campo:")} {a.campo}
                </div>
                {a.correcaoSugerida ? (
                  <div className="mt-1.5 text-[13px] text-ink-mute border-l-2 border-accent/40 pl-2">
                    {tx("Sugestão:")} {a.correcaoSugerida}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
