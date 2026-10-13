"use client";

import { useState } from "react";
import { Check, Loader2, Star } from "lucide-react";
import { EmTeste } from "@/components/EmTeste";
import { Checkin } from "@/components/pontos/Checkin";
import { usePontos } from "@/components/pontos/usePontos";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import {
  MISSOES,
  NOME_MOTIVO_PONTOS,
  PONTOS_INDICACAO,
  PONTOS_POR_CREDITO,
  PONTOS_POST,
  POSTS_POR_DIA,
  type MissaoId,
  type ResumoPontos,
} from "@/lib/pontos";

export default function PontosPage() {
  return (
    <EmTeste recurso="pontos">
      <Pontos />
    </EmTeste>
  );
}

const ABAS = [
  ["ganhar", "Ganhar"],
  ["historico", "Histórico"],
] as const;
type Aba = (typeof ABAS)[number][0];

/** Página de pontos: saldo, check-in e as abas "Ganhar" e "Histórico". */
function Pontos() {
  const pontos = usePontos(true);
  const [aba, setAba] = useState<Aba>("ganhar");

  if (!pontos)
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
      </div>
    );

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 pt-2 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl uppercase text-ink">{tx("Pontos")}</h1>
          <p className="mt-1 text-[13px] text-ink-mute">
            {tx(
              "Você ganha pontos usando o app: check-in diário, créditos gastos, primeiros passos, posts e indicações.",
            )}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2">
          <Star className="h-4 w-4 text-accent" strokeWidth={2.5} />
          <span className="text-lg font-bold tabular-nums text-ink">
            {pontos.saldo.toLocaleString("pt-BR")}
          </span>
          <span className="text-[12px] text-ink-dim">{tx("pontos")}</span>
        </div>
      </header>

      <section className="card p-4 sm:p-5">
        <Checkin pontos={pontos} />
      </section>

      <div
        role="tablist"
        className="flex w-fit gap-1 rounded-full border border-line bg-panel p-1"
      >
        {ABAS.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={cn(
              "h-8 rounded-full px-4 text-[12.5px] font-bold transition",
              aba === id ? "bg-accent text-bg" : "text-ink-mute hover:text-ink",
            )}
          >
            {tx(rotulo)}
          </button>
        ))}
      </div>

      {aba === "ganhar" ? (
        <Ganhar pontos={pontos} />
      ) : (
        <Historico pontos={pontos} />
      )}
    </main>
  );
}

function Linha({
  titulo,
  detalhe,
  valor,
  feito,
}: {
  titulo: string;
  detalhe?: string;
  valor: string;
  feito?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-0">
        <div
          className={cn(
            "text-[13.5px] font-semibold",
            feito ? "text-ink-mute" : "text-ink",
          )}
        >
          {titulo}
        </div>
        {detalhe ? (
          <div className="text-[12px] text-ink-dim">{detalhe}</div>
        ) : null}
      </div>
      {feito ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-ok">
          <Check className="h-3.5 w-3.5" strokeWidth={3} /> {tx("Feito")}
        </span>
      ) : (
        <span className="shrink-0 text-[13px] font-bold tabular-nums text-accent">
          {valor}
        </span>
      )}
    </li>
  );
}

function Ganhar({ pontos }: { pontos: ResumoPontos }) {
  const feitas = new Set(pontos.missoesFeitas);
  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="label-cap">{tx("Sempre")}</h2>
        <ul className="card overflow-hidden">
          <Linha
            titulo={tx("Créditos gastos em qualquer geração")}
            detalhe={tx("Se a geração falhar e o crédito voltar, os pontos saem.")}
            valor={`+${PONTOS_POR_CREDITO} ${tx("por crédito")}`}
          />
          <Linha
            titulo={tx("Post publicado nas redes")}
            detalhe={`${tx("Até")} ${POSTS_POR_DIA} ${tx("por dia")}`}
            valor={`+${PONTOS_POST}`}
          />
          <Linha
            titulo={tx("Quem você indicou assinou um plano")}
            detalhe={tx("Uma vez por pessoa indicada")}
            valor={`+${PONTOS_INDICACAO.toLocaleString("pt-BR")}`}
          />
        </ul>
      </section>
      <section className="grid gap-2">
        <h2 className="label-cap">
          {tx("Primeiros passos")} · {feitas.size}/{Object.keys(MISSOES).length}
        </h2>
        <ul className="card overflow-hidden">
          {(Object.keys(MISSOES) as MissaoId[]).map((id) => (
            <Linha
              key={id}
              titulo={tx(MISSOES[id].titulo)}
              valor={`+${MISSOES[id].pontos}`}
              feito={feitas.has(id)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Historico({ pontos }: { pontos: ResumoPontos }) {
  if (!pontos.historico.length)
    return (
      <p className="card px-4 py-8 text-center text-[13px] text-ink-mute">
        {tx("Nenhum ponto ainda. Faça o check-in de hoje para começar.")}
      </p>
    );
  return (
    <ul className="card overflow-hidden">
      {pontos.historico.map((m) => (
        <li
          key={m.id}
          className="flex items-center justify-between gap-4 border-b border-line px-4 py-2.5 last:border-0"
        >
          <div className="min-w-0">
            <div className="truncate text-[13px] text-ink">
              {tx(
                m.motivo === "missao" && m.ref && m.ref in MISSOES
                  ? MISSOES[m.ref as MissaoId].titulo
                  : (NOME_MOTIVO_PONTOS[m.motivo] ?? m.motivo),
              )}
            </div>
            <div className="text-[11.5px] text-ink-dim">
              {new Date(m.quando).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 text-[13px] font-bold tabular-nums",
              m.delta < 0 ? "text-pink" : "text-ok",
            )}
          >
            {m.delta > 0 ? "+" : ""}
            {m.delta.toLocaleString("pt-BR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
