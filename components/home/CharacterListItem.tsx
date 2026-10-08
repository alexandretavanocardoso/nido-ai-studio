"use client";

import { useCharacters } from "@/lib/store";
import { status } from "@/lib/completion";
import type { Character } from "@/lib/types";
import { Copy, Trash2 } from "lucide-react";
import Link from "next/link";
import { capaSrc } from "@/lib/storage/client";
import { confirmar } from "@/components/ui/Confirmacao";
import { CapaImagem } from "@/components/ui/CapaImagem";
import { IconeRede } from "@/components/ui/IconeRede";
import type { Rede } from "@/lib/social/redes";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

interface Props {
  character: Character;
}

const formasEmoji: Record<string, string> = {
  humano: "🧑",
  humanoide: "🤖",
  animal: "🐾",
  criatura: "🐉",
  objeto: "📦",
  abstrato: "◆",
};

/** Selos das redes do card: acesos quando a rede está nas plataformas da ficha. */
const REDES_DO_CARD: Array<{ rede: Rede; tem: (p: string) => boolean }> = [
  { rede: "INSTAGRAM", tem: (p) => p === "instagram" },
  { rede: "TIKTOK", tem: (p) => p === "tiktok" },
  { rede: "YOUTUBE", tem: (p) => p.startsWith("youtube") },
  { rede: "TWITTER", tem: (p) => p === "x" },
  { rede: "LINKEDIN", tem: (p) => p === "linkedin" },
];

/** Tem vídeo sendo gerado agora (troca de pessoa, legenda, criar vídeo…). */
export function emProducao(c: Character): boolean {
  return (c.videos ?? []).some((v) => v.status === "processando");
}

export function CharacterListItem({ character: c }: Props) {
  const duplicate = useCharacters((s) => s.duplicate);
  const del = useCharacters((s) => s.deleteCharacter);
  const nome = c.identidade.nome || "Sem nome";
  const avatar = capaSrc(c);
  const emoji = c.identidade.forma ? formasEmoji[c.identidade.forma] : "✨";
  const gerando = emProducao(c);
  const completo = status(c) === "completo";
  const plataformas = c.nicho.plataformas.map((p) => p.toLowerCase());

  return (
    <article className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/[0.07] bg-[linear-gradient(160deg,#2a2224_0%,#141112_75%)] font-geist transition duration-300 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-[3px] hover:border-nido-yellow/55 animate-nido-rise">
      <Link
        href={`/app/personagem/${c.id}`}
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        {avatar ? (
          <CapaImagem src={avatar} alt={nome} zoomNoHover />
        ) : (
          <span className="text-6xl opacity-40">{emoji}</span>
        )}
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(11,10,10,0)_40%,rgba(11,10,10,0.92)_100%)]" />
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3.5 text-nido-ink">
          <span className="truncate font-archivo text-base font-extrabold uppercase tracking-[-0.005em] [font-stretch:112%]">
            {nome}
          </span>
          <span className="line-clamp-2 text-xs leading-[1.4] text-[#b9b1a5]">
            {c.identidade.bio || c.nicho.promessa || tx("Sem bio ainda.")}
          </span>
          <span className="mt-1 flex items-center justify-between gap-2">
            <span className="flex gap-[3px]">
              {REDES_DO_CARD.map((r) => {
                const on = plataformas.some(r.tem);
                return (
                  <span
                    key={r.rede}
                    className={cn(
                      "grid h-[18px] w-[22px] place-items-center rounded-[5px]",
                      on
                        ? "bg-nido-yellow/[0.16] text-nido-yellow"
                        : "bg-white/[0.06] text-nido-dim",
                    )}
                  >
                    <IconeRede rede={r.rede} className="h-[11px] w-[11px]" />
                  </span>
                );
              })}
            </span>
            <span className="whitespace-nowrap font-geist-mono text-[10px] text-[#8a8278]">
              {relativo(c.updatedAt)}
            </span>
          </span>
        </span>
      </Link>

      <span
        className={cn(
          "pointer-events-none absolute left-2.5 top-2.5 z-10 flex h-[22px] items-center gap-1.5 rounded-full px-[9px] font-geist-mono text-[10px] font-semibold uppercase tracking-[0.08em] backdrop-blur",
          gerando
            ? "bg-nido-ocre/90 text-nido-bg"
            : completo
              ? "bg-nido-yellow text-nido-bg"
              : "bg-nido-bg/70 text-nido-ink",
        )}
      >
        <span
          className={cn(
            "h-[5px] w-[5px] rounded-full bg-current",
            gerando && "animate-nido-pulse",
          )}
        />
        {gerando
          ? tx("Em produção")
          : completo
            ? tx("Completo")
            : tx("Rascunho")}
      </span>

      <div className="absolute top-2.5 right-2.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <button
          type="button"
          onClick={() => duplicate(c.id)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-bg/80 backdrop-blur border border-line text-ink-mute hover:text-ink hover:border-ink transition"
          aria-label={tx("Duplicar")}
          title={tx("Duplicar")}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            confirmar({
              titulo: `Excluir “${nome}”?`,
              mensagem:
                "A ficha, as imagens e os vídeos deste personagem saem da sua lista. Não dá para desfazer.",
              confirmar: "Excluir",
              tom: "perigo",
            }).then((ok) => ok && del(c.id));
          }}
          className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-bg/80 backdrop-blur border border-line text-ink-mute hover:text-pink hover:border-pink transition"
          aria-label={tx("Excluir")}
          title={tx("Excluir")}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}

function relativo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}
