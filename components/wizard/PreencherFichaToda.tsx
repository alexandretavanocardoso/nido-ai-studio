"use client";

import { Loader2, Sparkles } from "lucide-react";
import { avisarCreditos, useCreditos } from "@/components/creditos/CreditosProvider";
import { confirmar } from "@/components/ui/Confirmacao";
import { STEPS } from "@/data/steps";
import { camposDaEtapaParaIA } from "@/lib/campos-ficha";
import { useDuravel } from "@/lib/duravel";
import { useT, type Chave } from "@/lib/i18n";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { CREDITOS_TEXTO } from "@/lib/planos";
import { useCharacters } from "@/lib/store";
import type { StepId } from "@/lib/types";

/** As etapas que a IA preenche (a revisão só mostra o resultado). */
const ETAPAS = STEPS.filter((s) => s.id !== "revisao").map((s) => s.id as Exclude<StepId, "revisao">);

/**
 * Preenche a ficha toda com IA: as etapas uma depois da outra (cada uma já vê
 * o que as anteriores preencheram, para a ficha sair coerente) e, no fim,
 * confirma tudo — sem a pessoa revisar sugestão por sugestão. Campos com
 * cadeado ficam como estão. Um "Desfazer" só volta a ficha inteira. Se uma
 * etapa falhar (sem créditos, por exemplo), para ali e fica o que já foi feito.
 */
export function PreencherFichaToda({ characterId }: { characterId: string }) {
  const t = useT();
  const { conta } = useCreditos();
  const [andamento, setAndamento] = useDuravel<string | null>(
    `preencher-ficha:${characterId}:andamento`,
    null,
    "Preenchendo a ficha com IA",
  );
  const [erro, setErro] = useDuravel<string | null>(`preencher-ficha:${characterId}:erro`, null);
  const custo = ETAPAS.length * CREDITOS_TEXTO.regenerarSecao;

  async function preencher() {
    const ok = await confirmar({
      titulo: tx("Preencher a ficha toda com IA?"),
      mensagem: tx(
        "A IA preenche todas as etapas, uma depois da outra, e já confirma tudo. Campos com cadeado ficam como estão; o resto é substituído. Dá para desfazer tudo de uma vez.",
      ),
      confirmar: conta ? `${tx("Preencher")} · ${custo} ${tx("créditos")}` : tx("Preencher"),
    });
    if (!ok) return;
    setErro(null);
    const loja = useCharacters.getState;
    // Um ponto de volta só, antes de tudo: o "Desfazer" volta a ficha inteira.
    loja().snapshotHistory(characterId, "Preencher a ficha com IA");
    try {
      for (const [i, etapa] of ETAPAS.entries()) {
        const titulo = t(`passo.${etapa}.titulo` as Chave);
        setAndamento(`${i + 1} ${tx("de")} ${ETAPAS.length} · ${titulo}`);
        const character = loja().characters.find((c) => c.id === characterId);
        if (!character) return;
        let res: Response;
        try {
          res = await fetch("/api/regenerar-secao", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              character,
              stepId: etapa,
              stepTitulo: titulo,
              campos: camposDaEtapaParaIA(etapa),
              travados: character._locks,
            }),
          });
        } catch {
          setErro(`${tx("Parou na etapa")} ${titulo}: ${tx("Sem conexão.")} ${tx("As etapas anteriores ficaram preenchidas.")}`);
          return;
        }
        const data = await res.json().catch(() => ({}));
        avisarCreditos();
        if (!res.ok) {
          setErro(
            `${tx("Parou na etapa")} ${titulo}: ${txErro(data?.error ?? "Falha ao regenerar.")} ${tx("As etapas anteriores ficaram preenchidas.")}`,
          );
          return;
        }
        loja().applySuggestions(characterId, data.suggestions ?? [], `Preencher: ${titulo}`, { semHistorico: true });
      }
    } finally {
      // O que foi preenchido já vale: sem sugestões para revisar.
      loja().confirmAllSuggestions(characterId);
      setAndamento(null);
    }
  }

  if (andamento)
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 text-[13px] font-semibold text-accent">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tx("Preenchendo a ficha")} · {andamento}…
      </span>
    );

  return (
    <>
      <button
        type="button"
        onClick={() => void preencher()}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-bold text-bg transition hover:bg-accent-strong cursor-pointer"
      >
        <Sparkles className="h-4 w-4" />
        {tx("Preencher a ficha toda com IA")}
        {conta ? <span className="font-semibold opacity-75">· {custo} {tx("créditos")}</span> : null}
      </button>
      {erro ? <p className="basis-full text-[13px] text-pink">{erro}</p> : null}
    </>
  );
}
