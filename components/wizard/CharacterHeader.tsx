"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Radar,
  Wand2,
} from "lucide-react";
import { IconeNft } from "@/components/nft/IconeNft";
import type { Character } from "@/lib/types";
import { status, stepCompletion } from "@/lib/completion";
import { capaSrc } from "@/lib/storage/client";
import { cn } from "@/lib/cn";
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
  comNft,
}: {
  character: Character;
  aba: AbaPersonagem;
  onAba: (a: AbaPersonagem) => void;
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink truncate">
            {nome}
          </h1>
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
        {abas.map(([id, titulo, Icone, dica]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => onAba(id)}
            title={dica}
            className={cn(
              "relative inline-flex items-center gap-2 h-11 text-[14px] font-semibold transition",
              estreitas ? "px-2.5 sm:px-4" : "px-4",
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
        ))}
      </div>
    </header>
  );
}
