"use client";

import { useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  avisarTermino,
  dispensarTermino,
  useTarefasRodando,
  useTerminadas,
} from "@/lib/duravel";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { useCharacters } from "@/lib/store";
import { useStorageReady } from "@/lib/storage/useStorage";
import { tx } from "@/lib/i18n/tx";

const POLL_MS = 10_000;
const AVISO_MS = 6_000;

/**
 * Tudo que roda em segundo plano, em qualquer tela do app:
 *  - o indicador no canto (o que está em andamento e o que acabou de terminar);
 *  - o aviso do navegador ao fechar/recarregar a aba com algo em andamento
 *    (aí o pedido se perde — trocar de tela dentro do app não perde nada);
 *  - o acompanhamento dos vídeos em processamento de todos os personagens.
 */
export function TarefasEmAndamento() {
  const rodando = useTarefasRodando();
  const terminadas = useTerminadas();
  useAcompanharVideos();

  useEffect(() => {
    if (!rodando.length) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [rodando.length]);

  const maisAntiga = terminadas[0]?.id;
  useEffect(() => {
    if (maisAntiga === undefined) return;
    const t = setTimeout(() => dispensarTermino(maisAntiga), AVISO_MS);
    return () => clearTimeout(t);
  }, [maisAntiga]);

  if (!rodando.length && !terminadas.length) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-40 grid gap-1.5 w-[min(300px,calc(100vw-2rem))] rounded-2xl border border-line-strong bg-panel/95 backdrop-blur px-3.5 py-3 shadow-xl"
      role="status"
      aria-live="polite"
    >
      {rodando.length > 0 && (
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-dim">
          {tx("Em andamento")} · {rodando.length}
        </div>
      )}
      {rodando.map((rotulo, i) => (
        <div
          key={`r${i}`}
          className="flex items-center gap-2 text-[13px] text-ink min-w-0"
        >
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-accent" />
          <span className="truncate">{tx(rotulo)}</span>
        </div>
      ))}
      {terminadas.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dispensarTermino(t.id)}
          className="flex items-center gap-2 text-[13px] text-ink-mute min-w-0 text-left"
        >
          <Check className="w-3.5 h-3.5 shrink-0 text-ok" />
          <span className="truncate">
            {tx("Terminou:")} {tx(t.rotulo)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Consulta os jobs de vídeo em andamento de todos os personagens enquanto houver algum. */
function useAcompanharVideos() {
  const pronto = useStorageReady();
  const update = useCharacters((s) => s.update);
  const pendentesKey = useCharacters((s) =>
    s.characters
      .flatMap((c) =>
        (c.videos ?? [])
          .filter((v) => v.status === "processando" && v.jobId)
          .map((v) => v.id),
      )
      .join(","),
  );

  useEffect(() => {
    if (!pronto || !pendentesKey) return;
    let ativo = true;
    async function consultar() {
      for (const c of useCharacters.getState().characters) {
        for (const v of (c.videos ?? []).filter(
          (x) => x.status === "processando" && x.jobId,
        )) {
          try {
            const res = await fetch(`/api/videos/jobs/${v.jobId}`, {
              cache: "no-store",
            });
            const job = (await res.json()) as {
              status?: string;
              key?: string;
              erro?: string;
              duracao?: number;
            };
            if (!ativo) return;
            if (job.status === "concluido" && job.key) {
              const key = job.key;
              update(c.id, (p) => {
                p.videos = (p.videos ?? []).map((x) =>
                  x.id === v.id
                    ? { ...x, key, status: undefined, duracao: job.duracao }
                    : x,
                );
              });
              avisarTermino(v.name);
            } else if (job.status === "erro" || res.status === 404) {
              update(c.id, (p) => {
                p.videos = (p.videos ?? []).map((x) =>
                  x.id === v.id
                    ? {
                        ...x,
                        status: "erro",
                        erro: job.erro ?? "O processamento falhou.",
                      }
                    : x,
                );
              });
              avisarCreditos(); // créditos devolvidos
            }
          } catch {
            // rede instável: tenta de novo na próxima volta
          }
        }
      }
    }
    void consultar();
    const t = setInterval(consultar, POLL_MS);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, [pronto, pendentesKey, update]);
}
