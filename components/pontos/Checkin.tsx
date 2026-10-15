"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { CHECKIN_CICLO, type ResumoPontos } from "@/lib/pontos";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { fazerCheckin, recarregarPontos } from "./usePontos";

/**
 * Check-in diário: os 7 dias do ciclo (com quanto cada um rende) e o botão do
 * dia. Usado no indicador da barra e na página de pontos.
 */
export function Checkin({ pontos }: { pontos: ResumoPontos }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Pontos do check-in que acabou de ser feito (toca a animação uma vez). */
  const [ganhou, setGanhou] = useState<number | null>(null);

  async function checkin() {
    setErro(null);
    setEnviando(true);
    try {
      setGanhou(await fazerCheckin());
      setTimeout(() => setGanhou(null), 1400);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">
          {tx("Check-in diário")}
        </span>
        <span className="text-[11.5px] text-ink-dim">
          {pontos.sequencia > 0
            ? `${pontos.sequencia} ${tx(pontos.sequencia === 1 ? "dia seguido" : "dias seguidos")}`
            : tx("Comece hoje")}
        </span>
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {CHECKIN_CICLO.map((valor, i) => {
          // Feitos: os dias do ciclo até o de hoje (se já fez) ou até ontem.
          const feito = pontos.checkinHoje ? i <= pontos.dia : i < pontos.dia;
          const hoje = i === pontos.dia;
          const festa = hoje && ganhou !== null;
          return (
            <li
              key={i}
              aria-current={hoje ? "step" : undefined}
              className={cn(
                "relative grid place-items-center gap-0.5 rounded-lg border py-1.5",
                festa && "animate-ponto-pop motion-reduce:animate-none",
                feito
                  ? "border-accent/40 bg-accent/10"
                  : hoje
                    ? "border-accent"
                    : "border-line",
              )}
            >
              <span className="text-[10px] text-ink-dim">
                {tx("Dia")} {i + 1}
              </span>
              {festa ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 motion-reduce:hidden"
                >
                  {/* Os pontos sobem a partir do dia de hoje, com faíscas em volta. */}
                  <span className="absolute left-1/2 top-0 z-10 whitespace-nowrap text-[15px] font-bold text-accent animate-ponto-sobe [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
                    +{ganhou}
                  </span>
                  {[0, 60, 120, 180, 240, 300].map((giro) => (
                    <span
                      key={giro}
                      className="absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-accent animate-ponto-faisca"
                      style={{ "--giro": `${giro}deg` } as React.CSSProperties}
                    />
                  ))}
                </span>
              ) : null}
              {feito ? (
                <Check className="h-3.5 w-3.5 text-accent" strokeWidth={3} />
              ) : (
                <span
                  className={cn(
                    "text-[12px] font-bold tabular-nums",
                    hoje ? "text-ink" : "text-ink-mute",
                  )}
                >
                  +{valor}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
      <Button
        variant="accent"
        size="sm"
        className="w-full"
        onClick={checkin}
        disabled={enviando || pontos.checkinHoje}
      >
        {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {pontos.checkinHoje ? (
          <ProximoCheckin ate={pontos.proximoEm} />
        ) : (
          `${tx("Fazer check-in")} · +${CHECKIN_CICLO[pontos.dia]} ${tx("XP")}`
        )}
      </Button>
    </div>
  );
}

/** Contagem regressiva até o próximo check-in (24 horas depois do último); quando zera, lê os pontos de novo e o botão volta. */
function ProximoCheckin({ ate }: { ate: string | null }) {
  const fim = ate ? new Date(ate).getTime() : 0;
  const [falta, setFalta] = useState(() => Math.max(0, fim - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const resto = fim - Date.now();
      setFalta(Math.max(0, resto));
      if (resto <= 0) {
        clearInterval(t);
        recarregarPontos();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [fim]);
  const total = Math.ceil(falta / 1000);
  const dois = (n: number) => String(n).padStart(2, "0");
  return (
    <span>
      {tx("Próximo check-in em")}{" "}
      <span className="tabular-nums">
        {dois(Math.floor(total / 3600))}:{dois(Math.floor((total % 3600) / 60))}
        :{dois(total % 60)}
      </span>
    </span>
  );
}
