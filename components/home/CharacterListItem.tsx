"use client";

import { useCharacters } from "@/lib/store";
import { status } from "@/lib/completion";
import type { Character } from "@/lib/types";
import { Copy, Trash2 } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/wizard/StatusBadge";
import { capaSrc } from "@/lib/storage/client";
import { confirmar } from "@/components/ui/Confirmacao";
import { CapaImagem } from "@/components/ui/CapaImagem";
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

export function CharacterListItem({ character: c }: Props) {
  const duplicate = useCharacters((s) => s.duplicate);
  const del = useCharacters((s) => s.deleteCharacter);
  const nome = c.identidade.nome || "Sem nome";
  const avatar = capaSrc(c);
  const emoji = c.identidade.forma ? formasEmoji[c.identidade.forma] : "✨";

  return (
    <div className="group relative rounded-2xl overflow-hidden border border-line bg-panel hover:border-line-strong transition">
      <Link href={`/app/personagem/${c.id}`} className="block">
        <div className="relative aspect-[4/5] bg-bg border-b border-line flex items-center justify-center overflow-hidden">
          {avatar ? (
            <CapaImagem src={avatar} alt={nome} zoomNoHover />
          ) : (
            <span className="text-6xl opacity-40">{emoji}</span>
          )}
          <div className="absolute top-3 left-3 z-10">
            <StatusBadge status={status(c)} />
          </div>
        </div>
        <div className="p-4">
          <h3 className="display text-base uppercase truncate text-ink">
            {nome}
          </h3>
          <p className="text-[13px] text-ink-mute line-clamp-2 mt-1 leading-relaxed">
            {c.identidade.bio || c.nicho.promessa || tx("Sem bio ainda.")}
          </p>
          <div className="eyebrow mt-3">
            {tx("Atualizado")} {relativo(c.updatedAt)}
          </div>
        </div>
      </Link>
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
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
    </div>
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
