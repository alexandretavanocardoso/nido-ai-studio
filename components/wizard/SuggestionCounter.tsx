"use client";
import { tx } from "@/lib/i18n/tx";

import { CheckCheck, History, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCharacters } from "@/lib/store";
import type { Character } from "@/lib/types";

export function SuggestionCounter({ character }: { character: Character }) {
  const confirmAll = useCharacters((s) => s.confirmAllSuggestions);
  const undoLast = useCharacters((s) => s.undoLast);
  const pendentes = Object.keys(character._suggestions).length;
  const temHistorico = character._history.length > 0;

  if (pendentes === 0 && !temHistorico) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
      {pendentes > 0 ? (
        <>
          <Sparkles className="w-4 h-4 shrink-0 text-accent" />
          {/* basis de 220px: no celular os botões descem para a linha de baixo, em vez de espremer o texto numa coluna estreita. */}
          <div className="flex-1 basis-[220px] min-w-0">
            <div className="font-semibold text-ink text-[15px]">
              {pendentes} {pendentes === 1 ? "sugestão" : "sugestões"}{" "}
              {tx("para revisar")}
            </div>
            <div className="text-[13px] text-ink-mute">
              {tx(
                'Editar um campo com sugestão já conta como aceito; para aceitar sem editar, use "Confirmar".',
              )}
            </div>
          </div>
          <Button
            variant="accent"
            size="sm"
            onClick={() => confirmAll(character.id)}
          >
            <CheckCheck className="w-4 h-4" />
            {tx("Confirmar todas")}
          </Button>
        </>
      ) : null}
      {pendentes === 0 && temHistorico ? (
        <>
          <History className="w-4 h-4 text-ink-mute" />
          <div className="flex-1 text-[14px] text-ink-mute">
            {tx("Última geração:")}{" "}
            <strong className="text-ink">{character._history[0].label}</strong>
          </div>
        </>
      ) : null}
      {temHistorico ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => undoLast(character.id)}
          title={tx("Desfazer a última geração")}
        >
          <History className="w-4 h-4" />
          {tx("Desfazer")}
        </Button>
      ) : null}
    </div>
  );
}
