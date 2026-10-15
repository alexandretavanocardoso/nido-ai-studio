"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  Radar,
  Wand2,
} from "lucide-react";
import { FERRAMENTAS } from "@/components/AppShell";
import type { SecaoEstudio } from "@/components/estudio/Estudio";
import { IconeNft } from "@/components/nft/IconeNft";
import type { Character } from "@/lib/types";
import { status, stepCompletion } from "@/lib/completion";
import { capaSrc } from "@/lib/storage/client";
import { cn } from "@/lib/cn";
import { NomeComTroca } from "./NomeComTroca";
import { StatusBadge } from "./StatusBadge";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";

export type AbaPersonagem = "ficha" | "estudio" | "radar" | "nft";

/** Progresso geral da ficha (média das etapas, sem a revisão). */
export function progressoFicha(c: Character): number {
  const { revisao: _r, ...etapas } = stepCompletion(c);
  const valores = Object.values(etapas);
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

export function CharacterHeader({
  character: c,
  aba,
  onAba,
  secao,
  onSecao,
  comNft,
}: {
  character: Character;
  aba: AbaPersonagem;
  onAba: (a: AbaPersonagem) => void;
  /** Tela do Estúdio aberta (vale com a aba Estúdio). */
  secao: SecaoEstudio;
  /** Abre uma tela do Estúdio (pelo menu da aba). */
  onSecao: (s: SecaoEstudio) => void;
  /** Mostra a aba NFT (recurso configurado e liberado para a conta). */
  comNft?: boolean;
}) {
  const t = useT();
  const nome = c.identidade.nome || t("personagem.semNome");
  const avatar = capaSrc(c);
  const progresso = progressoFicha(c);
  const abas = [
    ["ficha", t("personagem.abaFicha"), FileText, t("personagem.dicaFicha")],
    ["estudio", t("personagem.abaEstudio"), Wand2, t("personagem.dicaEstudio")],
    ["radar", tx("Radar"), Radar, t("estudio.radar.descricao")],
    ...(comNft
      ? ([
          [
            "nft",
            "NFT",
            IconeNft,
            tx(
              "Registre o influencer na Solana como NFT e acompanhe os badges que ele conquista.",
            ),
          ],
        ] as const)
      : []),
  ] as const;
  // Com a quarta aba, as abas ficam mais estreitas no celular para caber sem rolar.
  const estreitas = abas.length > 3;

  return (
    <header className="mb-6 grid gap-5">
      <div className="flex items-center gap-4 min-w-0">
        <Link
          href="/app/personagens"
          className="h-10 w-10 inline-flex items-center justify-center rounded-full border border-line bg-panel hover:bg-card text-ink-mute hover:text-ink shrink-0 transition"
          aria-label={t("personagem.voltar")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="h-14 w-14 rounded-2xl overflow-hidden border border-line bg-panel shrink-0">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <div className="h-full w-full grid place-items-center text-ink-dim text-xl font-bold">
              {nome.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <NomeComTroca character={c} nome={nome} />
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <StatusBadge status={status(c)} />
            <div
              className="flex items-center gap-2"
              title={t("personagem.daFicha", { n: progresso })}
            >
              <div className="h-1.5 w-24 rounded-full bg-line overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <span className="text-[12px] text-ink-mute tabular-nums">
                {t("personagem.daFicha", { n: progresso })}
              </span>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-[12px] text-ink-dim">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t("personagem.salvo")}
            </span>
          </div>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={tx("Seções do personagem")}
        className="flex gap-1 border-b border-line"
      >
        {abas.map(([id, titulo, Icone, dica]) =>
          id === "estudio" ? (
            <MenuEstudio
              key={id}
              titulo={titulo}
              dica={dica}
              ativa={aba === "estudio"}
              secao={secao}
              onSecao={onSecao}
              estreitas={estreitas}
            />
          ) : (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => onAba(id)}
            title={dica}
            className={cn(
              "relative inline-flex items-center gap-2 h-11 text-[14px] font-semibold transition",
              // Com 3 abas, em 320px o respiro cheio passava 15px da tela.
              estreitas ? "px-2.5 sm:px-4" : "px-2.5 min-[360px]:px-4",
              aba === id ? "text-ink" : "text-ink-mute hover:text-ink",
            )}
          >
            <Icone
              className={cn(
                "w-4 h-4",
                estreitas && "hidden min-[400px]:block",
              )}
            />
            {titulo}
            {aba === id && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
          ),
        )}
      </div>
    </header>
  );
}

/**
 * A aba Estúdio: abre o menu com as telas do Estúdio do personagem (as mesmas
 * do menu lateral), com a aberta marcada.
 */
function MenuEstudio({
  titulo,
  dica,
  ativa,
  secao,
  onSecao,
  estreitas,
}: {
  titulo: string;
  dica: string;
  ativa: boolean;
  secao: SecaoEstudio;
  onSecao: (s: SecaoEstudio) => void;
  estreitas: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const aberta = ativa ? FERRAMENTAS.find((f) => f.secao === secao) : undefined;
  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        role="tab"
        aria-selected={ativa}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        title={dica}
        className={cn(
          "relative inline-flex items-center gap-2 h-11 text-[14px] font-semibold transition cursor-pointer",
          estreitas ? "px-2.5 sm:px-4" : "px-2.5 min-[360px]:px-4",
          ativa ? "text-ink" : "text-ink-mute hover:text-ink",
        )}
      >
        <Wand2 className={cn("w-4 h-4", estreitas && "hidden min-[400px]:block")} />
        {titulo}
        {/* A tela aberta vai junto do nome da aba (a partir do tablet). */}
        {aberta ? <span className="hidden font-medium text-ink-mute sm:inline">· {tx(aberta.rotulo)}</span> : null}
        <ChevronDown className={cn("h-3.5 w-3.5 text-ink-mute transition", aberto && "rotate-180")} />
        {ativa && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
      </button>
      {aberto ? (
        <div
          role="menu"
          aria-label={titulo}
          className="absolute left-0 top-full z-40 mt-1.5 w-56 rounded-xl border border-white/[0.08] bg-nido-panel p-1.5 shadow-card"
        >
          {FERRAMENTAS.map((f) => {
            const atual = ativa && f.secao === secao;
            return (
              <button
                key={f.secao}
                type="button"
                role="menuitem"
                aria-current={atual ? "page" : undefined}
                onClick={() => {
                  setAberto(false);
                  onSecao(f.secao);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-medium transition hover:bg-white/[0.05] cursor-pointer",
                  atual ? "text-nido-yellow" : "text-nido-soft",
                )}
              >
                <f.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{tx(f.rotulo)}</span>
                {atual ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-nido-yellow shadow-[0_0_8px_#fdf327]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
