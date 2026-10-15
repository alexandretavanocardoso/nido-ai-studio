"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { liberadoNaTela } from "@/lib/em-teste";
import { tx } from "@/lib/i18n/tx";
import { Checkin } from "./Checkin";
import { usePontos } from "./usePontos";

/**
 * Pontos na barra do topo: o saldo, com um sinal quando o check-in de hoje
 * ainda não foi feito. Clicar abre o check-in. Só aparece para quem tem
 * acesso ao recurso (lib/em-teste.ts).
 */
export function IndicadorPontos() {
  const { conta } = useCreditos();
  const pontos = usePontos(!!conta && liberadoNaTela("pontos", conta));
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  if (!pontos) return null;
  return (
    // No celular o painel se alinha à barra do topo (16px da borda), não ao botão: preso ao botão ele saía pela esquerda da tela.
    <div className="sm:relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-label={`${tx("XP")}: ${pontos.saldo}`}
        className="relative inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-[12px] font-bold text-ink transition hover:border-line-strong"
      >
        <Star className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
        {/* Abaixo de 380px a barra não comporta o saldo ao lado dos outros botões: fica só a estrela. */}
        <span className="hidden tabular-nums min-[380px]:inline">
          {pontos.saldo.toLocaleString("pt-BR")}
        </span>
        {!pontos.checkinHoje ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-accent"
            aria-hidden
          />
        ) : null}
      </button>
      {aberto ? (
        <div className="absolute right-4 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel p-3.5 shadow-card sm:right-0">
          <Checkin pontos={pontos} />
          <Link
            href="/app/pontos"
            onClick={() => setAberto(false)}
            className="mt-3 block border-t border-line pt-3 text-center text-[12.5px] font-semibold text-accent hover:underline"
          >
            {tx("Ver como ganhar XP")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
