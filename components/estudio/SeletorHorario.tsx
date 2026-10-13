"use client";

import { useRef, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

/**
 * Escolher quando publicar: atalhos, próximos 14 dias em botões, hora e
 * minuto, e a frase de confirmação. O valor é a data/hora LOCAL no formato
 * "AAAA-MM-DDTHH:mm" (quem envia converte para UTC).
 */
const p2 = (n: number) => String(n).padStart(2, "0");

export function paraValor(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function deValor(v: string): Date {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function mesmoDia(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function em(dias: number, hora: number, minuto = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, minuto, 0, 0);
  return d;
}

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const MINUTOS = [0, 15, 30, 45];

export function SeletorHorario({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}) {
  const data = deValor(valor);
  const agora = new Date();
  const outraData = useRef<HTMLInputElement>(null);
  const [horaAberta, setHoraAberta] = useState(false);

  const emUmaHora = new Date(agora.getTime() + 3600_000);
  emUmaHora.setMinutes(Math.ceil(emUmaHora.getMinutes() / 15) * 15, 0, 0);
  const atalhos: Array<[string, Date]> = [
    ["Em 1 hora", emUmaHora],
    ...(agora.getHours() < 17
      ? ([["Hoje 18h", em(0, 18)]] as Array<[string, Date]>)
      : []),
    ["Amanhã 9h", em(1, 9)],
    ["Amanhã 12h", em(1, 12)],
    ["Amanhã 18h", em(1, 18)],
  ];

  const dias = Array.from({ length: 14 }, (_, i) =>
    em(i, data.getHours(), data.getMinutes()),
  );
  const diaForaDaLista = !dias.some((d) => mesmoDia(d, data));

  function mudarDia(d: Date) {
    const n = new Date(d);
    n.setHours(data.getHours(), data.getMinutes(), 0, 0);
    onChange(paraValor(n));
  }
  function mudarHora(h: number, m: number) {
    const n = new Date(data);
    n.setHours(h, m, 0, 0);
    onChange(paraValor(n));
  }

  const passado = data.getTime() < Date.now();
  const fuso = Intl.DateTimeFormat()
    .resolvedOptions()
    .timeZone.split("/")
    .pop()
    ?.replace(/_/g, " ");
  const resumo = data.toLocaleString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-panel p-3.5 [&>*]:min-w-0">
      {/* Atalhos */}
      <div className="flex gap-1.5 flex-wrap">
        {atalhos.map(([rotulo, d]) => {
          const ativo = Math.abs(d.getTime() - data.getTime()) < 60_000;
          return (
            <button
              key={rotulo}
              type="button"
              onClick={() => onChange(paraValor(d))}
              className={cn(
                "h-8 px-3 rounded-full text-[12px] font-semibold border transition",
                ativo
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-ink-mute hover:text-ink",
              )}
            >
              {rotulo}
            </button>
          );
        })}
      </div>

      {/* Dia */}
      <div>
        <div className="text-[11px] text-ink-dim mb-1.5 flex items-center gap-1">
          <CalendarDays className="w-3.5 h-3.5" /> {tx("Dia")}
        </div>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {dias.map((d, i) => {
            const ativo = mesmoDia(d, data);
            return (
              <button
                key={i}
                type="button"
                onClick={() => mudarDia(d)}
                className={cn(
                  "shrink-0 w-14 rounded-xl border py-1.5 grid place-items-center transition",
                  ativo
                    ? "border-accent bg-accent text-bg"
                    : "border-line text-ink-mute hover:text-ink hover:border-line-strong",
                )}
              >
                <span className="text-[10px] font-semibold uppercase">
                  {i === 0
                    ? tx("Hoje")
                    : i === 1
                      ? tx("Amanhã")
                      : d
                          .toLocaleDateString("pt-BR", { weekday: "short" })
                          .replace(".", "")}
                </span>
                <span className="text-[16px] font-bold leading-tight">
                  {d.getDate()}
                </span>
                <span className="text-[10px] opacity-80">
                  {d
                    .toLocaleDateString("pt-BR", { month: "short" })
                    .replace(".", "")}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => outraData.current?.showPicker?.()}
            className={cn(
              "shrink-0 w-14 rounded-xl border py-1.5 grid place-items-center text-[11px] font-semibold transition relative",
              diaForaDaLista
                ? "border-accent bg-accent text-bg"
                : "border-dashed border-line-strong text-ink-mute hover:text-ink",
            )}
          >
            {diaForaDaLista ? (
              <>
                <span className="text-[16px] font-bold leading-tight">
                  {data.getDate()}
                </span>
                <span className="text-[10px]">
                  {data
                    .toLocaleDateString("pt-BR", { month: "short" })
                    .replace(".", "")}
                </span>
              </>
            ) : (
              tx("Outra data")
            )}
            <input
              ref={outraData}
              type="date"
              tabIndex={-1}
              aria-hidden
              className="absolute inset-0 opacity-0 pointer-events-none [color-scheme:dark]"
              min={paraValor(agora).slice(0, 10)}
              onChange={(e) => {
                if (!e.target.value) return;
                const [a, m, d] = e.target.value.split("-").map(Number);
                mudarDia(new Date(a, m - 1, d));
              }}
            />
          </button>
        </div>
      </div>

      {/* Hora */}
      <div>
        <div className="text-[11px] text-ink-dim mb-1.5 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {tx("Hora")}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <button
              type="button"
              onClick={() => setHoraAberta((v) => !v)}
              aria-expanded={horaAberta}
              className={cn(
                "h-10 px-4 rounded-xl border bg-bg text-[16px] font-bold text-ink tabular-nums transition",
                horaAberta
                  ? "border-accent"
                  : "border-line hover:border-line-strong",
              )}
            >
              {p2(data.getHours())}
              <span className="text-ink-dim mx-1">:</span>
              {p2(data.getMinutes())}
            </button>
            {horaAberta && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setHoraAberta(false)}
                  aria-hidden
                />
                {/* Num celular de 320px, 300px a partir do botão passavam da tela: a largura acompanha a tela. */}
                <div className="absolute left-0 top-full mt-2 z-20 w-[min(300px,calc(100vw-5.5rem))] rounded-2xl border border-line bg-card p-3 shadow-2xl grid gap-3">
                  <div>
                    <div className="text-[11px] text-ink-dim mb-1.5">
                      {tx("Hora")}
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      {HORAS.map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => mudarHora(h, data.getMinutes())}
                          className={cn(
                            "h-8 rounded-lg text-[13px] font-semibold tabular-nums transition",
                            data.getHours() === h
                              ? "bg-accent text-bg"
                              : "text-ink-mute hover:bg-panel hover:text-ink",
                          )}
                        >
                          {p2(h)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-dim mb-1.5">
                      {tx("Minutos")}
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {MINUTOS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            mudarHora(data.getHours(), m);
                            setHoraAberta(false);
                          }}
                          className={cn(
                            "h-8 rounded-lg text-[13px] font-semibold tabular-nums transition",
                            data.getMinutes() === m
                              ? "bg-accent text-bg"
                              : "text-ink-mute hover:bg-panel hover:text-ink",
                          )}
                        >
                          :{p2(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <span className="text-[12px] text-ink-dim">
            {tx("Horário de")} {fuso}
          </span>
        </div>
      </div>

      {/* Confirmação */}
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-[13px]",
          passado ? "bg-pink/10 text-pink" : "bg-accent/10 text-ink",
        )}
      >
        {passado ? (
          tx("Esse horário já passou — escolha um horário no futuro.")
        ) : (
          <>
            {tx("Vai ao ar")}{" "}
            <strong>{resumo.charAt(0).toUpperCase() + resumo.slice(1)}</strong>
            {tx(", às")}{" "}
            <strong>
              {p2(data.getHours())}:{p2(data.getMinutes())}
            </strong>
            .
          </>
        )}
      </div>
    </div>
  );
}
