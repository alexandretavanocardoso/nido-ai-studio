"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { pilula } from "@/components/live/Preparar";
import { cn } from "@/lib/cn";
import { useIdioma } from "@/lib/i18n";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { caracteresDaCena, CENA_MAX_CARACTERES, type CenaProduto } from "@/lib/produto";

/** Rótulo pequeno em cima de cada campo da cena. */
const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-dim";

/**
 * O roteiro montado pela IA, para editar antes de gerar: uma cena por linha,
 * com o que acontece (em inglês — é o que vai para o modelo) e, com fala, o
 * que a pessoa diz. "Ver em português" mostra ao lado a tradução, só para ler.
 */
export function RoteiroProduto({
  cenas,
  onChange,
  segundos,
  falado,
  aviso,
  rodape,
}: {
  cenas: CenaProduto[];
  onChange: (cenas: CenaProduto[]) => void;
  /** Duração planejada de cada cena. */
  segundos: number[];
  falado: boolean;
  /** Linha abaixo do título (dica ou aviso de que é preciso montar de novo). */
  aviso: React.ReactNode;
  rodape: React.ReactNode;
}) {
  const idioma = useIdioma((s) => s.idioma);
  const [verPt, setVerPt] = useState(false);
  const mostrarPt = verPt && idioma === "pt";
  const traducao = useTraducoes(mostrarPt ? cenas.map((c) => c.cena) : []);
  const mudar = (i: number, parte: Partial<CenaProduto>) =>
    onChange(cenas.map((c, j) => (j === i ? { ...c, ...parte } : c)));

  return (
    <section className="card grid gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="label-cap">{tx("Roteiro")}</h2>
          <span className="text-[12px] text-ink-dim">{aviso}</span>
        </div>
        {idioma === "pt" ? (
          <button
            type="button"
            onClick={() => setVerPt((v) => !v)}
            aria-pressed={verPt}
            className={cn(pilula(verPt), "h-8 gap-1.5 px-3 cursor-pointer")}
          >
            <Languages className="h-3.5 w-3.5" />
            {tx("Ver em português")}
          </button>
        ) : null}
      </div>
      {mostrarPt && traducao.erro ? <p className="text-[12px] text-pink">{traducao.erro}</p> : null}

      <ol className="grid gap-3">
        {cenas.map((c, i) => {
          const pt = traducao.mapa[c.cena];
          return (
            <li key={i} className="overflow-hidden rounded-xl border border-line">
              <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-4 py-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-[11.5px] font-bold text-accent">
                  {i + 1}
                </span>
                <span className="text-[13px] font-semibold text-ink">
                  {tx("Cena")} {i + 1}
                </span>
                {segundos[i] ? <span className="text-[12px] text-ink-dim">· ~{segundos[i]}s</span> : null}
              </div>
              <div className={cn("grid gap-4 p-4", mostrarPt && "md:grid-cols-2")}>
                <label className="grid content-start gap-1.5">
                  <span className={ROTULO}>
                    {tx("O que acontece")}{" "}
                    <span className="font-normal normal-case tracking-normal">· {tx("em inglês, vai para o modelo")}</span>
                  </span>
                  <TextoQueCresce
                    value={c.cena}
                    onChange={(v) => mudar(i, { cena: v })}
                    maxLength={CENA_MAX_CARACTERES}
                  />
                </label>
                {mostrarPt ? (
                  <div className="grid content-start gap-1.5">
                    <span className={ROTULO}>
                      {tx("Em português")}{" "}
                      <span className="font-normal normal-case tracking-normal">· {tx("só para ler")}</span>
                    </span>
                    <div className="min-h-[46px] rounded-xl border border-dashed border-line px-[0.9rem] py-[0.65rem] text-[15px] leading-relaxed text-ink-mute">
                      {pt ?? (
                        <span className="inline-flex items-center gap-2 text-[13px] text-ink-dim">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {tx("Traduzindo…")}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}
                {falado ? (
                  <label className={cn("grid content-start gap-1.5", mostrarPt && "md:col-span-2")}>
                    <span className={ROTULO}>{tx("Fala")}</span>
                    <TextoQueCresce
                      value={c.fala ?? ""}
                      onChange={(v) => mudar(i, { fala: v })}
                      maxLength={1000}
                      linhas={1}
                      placeholder={tx("O que a pessoa fala nesta cena")}
                    />
                    {(c.fala ?? "").length > caracteresDaCena(15) ? (
                      <span className="text-[11.5px] text-pink">{tx("Fala longa: cada cena tem até 15s.")}</span>
                    ) : null}
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {rodape}
    </section>
  );
}

/** Caixa de texto que cresce com o conteúdo (sem rolagem dentro dela). */
function TextoQueCresce({
  value,
  onChange,
  maxLength,
  placeholder,
  linhas = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  placeholder?: string;
  /** Altura mínima, em linhas. */
  linhas?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ajustar = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(ajustar, [value]);
  // A largura muda (tradução ligada, tela girada): a altura acompanha.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(ajustar);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <textarea
      ref={ref}
      rows={linhas}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      placeholder={placeholder}
      className="input-base resize-none overflow-hidden leading-relaxed"
    />
  );
}

/**
 * Traduções (inglês → português) dos textos pedidos, guardadas por texto:
 * editar uma cena traduz só ela de novo, depois de uma pausa na digitação.
 */
function useTraducoes(textos: string[]) {
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const faltam = [...new Set(textos.filter((t) => t.trim().length >= 3 && !(t in mapa)))];
  const chave = faltam.join("\u0000");

  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    const espera = setTimeout(async () => {
      const lista = chave.split("\u0000");
      try {
        const r = await fetch("/api/produto/traduzir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textos: lista }),
        });
        const b = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
        setErro(null);
        setMapa((m) => ({ ...m, ...Object.fromEntries(lista.map((t, i) => [t, b.traducoes?.[i] ?? ""])) }));
      } catch {
        if (vivo) setErro(tx("Sem conexão. Tente de novo."));
      }
    }, 700);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [chave]);

  return { mapa, erro };
}
