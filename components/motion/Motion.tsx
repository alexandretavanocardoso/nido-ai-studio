"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Film, Loader2 } from "lucide-react";
import { avisarCreditos, useCreditos } from "@/components/creditos/CreditosProvider";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import type { ItemMotion } from "@/lib/motion";
import { useCharacters } from "@/lib/store";
import { creditosMotion } from "@/worker/motion/modelos";
import { FormMotion } from "./FormMotion";
import { nomeDoEsforco, nomeDoModelo, PainelMotion } from "./PainelMotion";

type Aba = "novo" | "historico";

const emAndamento = (m: ItemMotion) =>
  m.status === "na_fila" || m.status === "gerando" || m.render === "na_fila" || m.render === "renderizando";

/**
 * /app/motion (em teste: lib/em-teste.ts) — um modelo de IA escreve uma
 * animação (motion graphics) do site, do produto ou do influencer. O pedido vai
 * para a fila do worker/motion; a tela mostra o andamento, a prévia, o custo e
 * grava o MP4. Cobra créditos (lib/motion-creditos.ts).
 */
export function Motion() {
  const personagens = useCharacters((s) => s.characters);
  const { conta } = useCreditos();
  const [aba, setAba] = useState<Aba>("novo");
  const [motions, setMotions] = useState<ItemMotion[]>([]);
  const [worker, setWorker] = useState<boolean | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/motion", { cache: "no-store" }).catch(() => null);
    const b = await r?.json().catch(() => null);
    if (!r?.ok || !b) return;
    setMotions(b.motions ?? []);
    setWorker(!!b.worker);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Enquanto algo anda, a lista é consultada a cada 4s.
  const andando = motions.some(emAndamento);
  useEffect(() => {
    if (!andando) return;
    const t = setInterval(() => void carregar(), 4000);
    return () => clearInterval(t);
  }, [andando, carregar]);
  // Terminou: o servidor acertou os créditos pelo custo real; atualiza o saldo da barra.
  const andava = useRef(false);
  useEffect(() => {
    if (andava.current && !andando) avisarCreditos();
    andava.current = andando;
  }, [andando]);

  const novo = (m: ItemMotion) => {
    setMotions((l) => [m, ...l.filter((x) => x.id !== m.id)]);
    setEscolhido(m.id);
  };
  const atual = motions.find((m) => m.id === escolhido) ?? null;

  return (
    <main className="mx-auto grid w-full max-w-[1240px] gap-6 px-4 pb-16 pt-2 sm:px-6 lg:px-10">
      <header className="grid gap-1">
        <h1 className="display text-2xl uppercase text-ink">{tx("Motion")}</h1>
        <p className="max-w-2xl text-[14px] text-ink-mute">
          {tx("A IA escreve uma animação do seu site, produto ou influencer. Veja na tela, peça ajustes e exporte em MP4.")}
        </p>
      </header>

      {worker === false ? (
        <p className="flex items-start gap-2 rounded-xl border border-pink/40 bg-pink/5 px-4 py-3 text-[13px] text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pink" />
          {conta?.admin
            ? tx("O worker do Motion (worker/motion) não está ligado: os pedidos ficam na fila até ele ligar no Railway.")
            : tx("O Motion está fora do ar no momento. Os pedidos ficam na fila e começam assim que ele voltar.")}
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <section className="card grid content-start gap-5 p-4 sm:p-6">
          <div role="tablist" className="flex w-fit gap-1 rounded-full border border-line bg-bg p-1">
            {(
              [
                ["novo", tx("Novo")],
                ["historico", `${tx("Histórico")}${motions.length ? ` · ${motions.length}` : ""}`],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                onClick={() => {
                  setAba(id);
                  // Voltar para "Novo" tira do painel o motion que estava aberto.
                  if (id === "novo") setEscolhido(null);
                }}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition cursor-pointer",
                  aba === id ? "bg-accent text-bg" : "text-ink-mute hover:text-ink",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {/* As duas ficam montadas: trocar de aba não perde o que foi preenchido. */}
          <div className={aba === "novo" ? undefined : "hidden"}>
            <FormMotion personagens={personagens} onCriado={novo} />
          </div>
          <div className={aba === "historico" ? undefined : "hidden"}>
            {motions.length ? (
              <ul className="grid gap-2">
                {motions.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setEscolhido((e) => (e === m.id ? null : m.id))}
                      aria-pressed={m.id === escolhido}
                      className={cn(
                        "grid w-full gap-0.5 rounded-xl border px-3 py-2.5 text-left transition cursor-pointer",
                        m.id === escolhido ? "border-accent bg-accent/10" : "border-line hover:border-line-strong",
                      )}
                    >
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                        {emAndamento(m) ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-mute" />
                        ) : m.status === "erro" ? (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-pink" />
                        ) : m.render === "pronto" ? (
                          <Film className="h-3.5 w-3.5 shrink-0 text-accent" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
                        )}
                        <span className="truncate">
                          {m.ajuste ? `${tx("Ajuste")}: ${m.ajuste}` : m.brief || m.assunto || tx("Motion")}
                        </span>
                      </span>
                      <span className="text-[11.5px] text-ink-dim">
                        {nomeDoModelo(m.modelo)} · {nomeDoEsforco(m.esforco)} · {m.formato} · {m.duracao}s
                        {m.uso ? ` · ${creditosMotion(m.uso.custo)} ${tx("créditos")}` : ""} ·{" "}
                        {new Date(m.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-dim">{tx("Nenhum motion ainda.")}</p>
            )}
          </div>
        </section>

        <aside className="grid content-start gap-4 lg:sticky lg:top-4">
          {atual ? (
            <PainelMotion
              key={atual.id}
              motion={atual}
              worker={worker}
              onNovo={novo}
              onMudou={(m) => setMotions((l) => l.map((x) => (x.id === m.id ? m : x)))}
              onFechar={() => setEscolhido(null)}
            />
          ) : (
            <div className="card p-6 text-center text-[13px] text-ink-dim">
              {tx("Gere um motion ou escolha um no histórico para ver aqui.")}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
