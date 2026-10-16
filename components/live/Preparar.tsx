"use client";

import { useState } from "react";
import { Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import type { LiveResumo } from "@/lib/live/tipos";
import {
  CREDITOS_CENARIO,
  creditosLive,
  DURACOES_LIVE,
  duracaoLiveValida,
  LIVE_MAX_MINUTOS,
  LIVE_MIN_MINUTOS,
} from "@/lib/planos";

/** Duas colunas no desktop (imagem | quem é e voz); empilhado no celular. */
export function Colunas({ imagem, resto }: { imagem: React.ReactNode; resto: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-8">
      <div className="grid content-start gap-5">{imagem}</div>
      <div className="grid content-start gap-5">{resto}</div>
    </div>
  );
}

/** Pílula de escolha (duração, modo da voz…). */
export const pilula = (ativo: boolean) =>
  cn(
    "inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-semibold transition",
    ativo ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-mute hover:text-ink",
  );

/**
 * Duração (atalhos ou minutos digitados) e o rodapé com o total e o botão de
 * preparar, iguais em todos os modos. Cria a live no servidor.
 */
export function PrepararLive({
  falta,
  comCena = false,
  extra,
  creditos = creditosLive,
  nota = "Cobrados ao entrar no ar; os minutos que você não usar voltam quando a live encerra. Preparar o avatar não custa nada.",
  corpo,
  onCriada,
}: {
  /** O que ainda falta escolher (aparece no rodapé); null = pronto para preparar. */
  falta: string | null;
  /** Com cenário: a imagem no cenário é cobrada ao preparar. */
  comCena?: boolean;
  /** Outra cobrança ao preparar, já traduzida (ex.: "+ 40 do avatar 3D"). */
  extra?: string;
  /** Créditos pela duração (o avatar e a Shadow ao vivo têm preços diferentes). */
  creditos?: (minutos: number) => number;
  /** Como a cobrança funciona (texto em português, traduzido aqui). */
  nota?: string;
  /** O que vai para POST /api/live, menos a duração. */
  corpo: () => Record<string, unknown>;
  onCriada: (l: LiveResumo) => void;
}) {
  /** Minutos digitados (os atalhos preenchem o mesmo campo). */
  const [minutos, setMinutos] = useState("15");
  const duracao = Number(minutos);
  const duracaoOk = duracaoLiveValida(duracao);
  const atalho = (DURACOES_LIVE as readonly number[]).includes(duracao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function preparar() {
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo(), duracaoMin: duracao }),
      });
      const b = (await res.json().catch(() => ({}))) as { live?: LiveResumo; error?: string };
      if (!res.ok || !b.live) return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      onCriada(b.live);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="grid gap-2">
        <span className="label-cap">{tx("Duração máxima")}</span>
        <div className="flex flex-wrap items-center gap-2">
          {DURACOES_LIVE.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setMinutos(String(d))}
              className={cn(pilula(d === duracao), "cursor-pointer")}
            >
              {d} min
            </button>
          ))}
          <label className={cn(pilula(!atalho), "gap-2 cursor-text focus-within:border-accent")}>
            {tx("Outra")}
            <input
              type="number"
              inputMode="numeric"
              min={LIVE_MIN_MINUTOS}
              max={LIVE_MAX_MINUTOS}
              step={1}
              value={atalho ? "" : minutos}
              placeholder="—"
              onChange={(e) => setMinutos(e.target.value)}
              onFocus={(e) => atalho && e.currentTarget.select()}
              aria-label={tx("Duração em minutos")}
              className="w-9 bg-transparent text-center text-ink outline-none focus-visible:outline-none [appearance:textfield] placeholder:text-ink-dim [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            min
          </label>
        </div>
        {!duracaoOk && minutos ? (
          <span className="text-[12px] text-pink">{tx("Use de 1 a 120 minutos, sem fração.")}</span>
        ) : null}
      </div>

      <div className="-mx-4 -mb-4 mt-1 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-4 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
        <div className="mr-auto grid gap-0.5">
          <span className="text-[15px] font-bold text-ink">
            {duracaoOk ? `${duracao} min · ${creditos(duracao)} ${tx("créditos")}` : "—"}
            {comCena ? (
              <span className="font-semibold text-ink-mute">
                {" "}+ {CREDITOS_CENARIO} {tx("do cenário")}
              </span>
            ) : null}
            {extra ? <span className="font-semibold text-ink-mute"> {extra}</span> : null}
          </span>
          {falta ? <span className="text-[13px] font-semibold text-pink">{falta}</span> : null}
          <span className="max-w-xl text-[12px] text-ink-dim">{tx(nota)}</span>
        </div>
        <Button variant="accent" onClick={preparar} disabled={enviando || !!falta || !duracaoOk}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
          {tx("Preparar a live")}
        </Button>
        {erro ? <p className="basis-full text-[13px] text-pink">{erro}</p> : null}
      </div>
    </>
  );
}
