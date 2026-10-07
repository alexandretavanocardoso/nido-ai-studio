"use client";

import type { Character } from "@/lib/types";
import { Sparkles } from "lucide-react";
import { capaSrc } from "@/lib/storage/client";
import { CapaImagem } from "@/components/ui/CapaImagem";
import { tx } from "@/lib/i18n/tx";

const formasEmoji: Record<string, string> = {
  humano: "🧑",
  humanoide: "🤖",
  animal: "🐾",
  criatura: "🐉",
  objeto: "📦",
  abstrato: "◆",
};

/**
 * Prévia do personagem (coluna da direita). A imagem aparece inteira — cards
 * de referência são largos — sobre um fundo desfocado dela mesma.
 */
export function CharacterCard({ character: c }: { character: Character }) {
  const nome = c.identidade.nome || "Sem nome";
  const avatar = capaSrc(c);
  const emoji = c.identidade.forma ? formasEmoji[c.identidade.forma] : "✨";
  const tags = [
    c.identidade.genero ? labelGenero(c.identidade.genero) : null,
    c.identidade.forma ? labelForma(c.identidade.forma) : null,
    c.identidade.idadeAparente || null,
    c.identidade.cidade || null,
  ].filter(Boolean) as string[];

  return (
    <div className="card overflow-hidden sticky top-6">
      <div className="relative aspect-[4/5] bg-bg overflow-hidden">
        {avatar ? (
          <CapaImagem src={avatar} alt={`Capa de ${nome}`} />
        ) : (
          <div className="h-full w-full grid place-items-center text-6xl opacity-40">
            {emoji}
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="text-[11px] text-ink-dim uppercase tracking-wider font-semibold mb-1">
          {tx("Prévia")}
        </div>
        <h2 className="text-lg font-bold tracking-tight text-ink truncate">
          {nome}
        </h2>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center px-2 py-0.5 rounded-full border border-line bg-panel text-[11px] text-ink-mute font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {c.identidade.bio ? (
          <p className="mt-3 text-[14px] text-ink/80 leading-relaxed line-clamp-3">
            {c.identidade.bio}
          </p>
        ) : null}

        {c.soul.adjetivos.length ? (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {c.soul.adjetivos.slice(0, 6).map((a) => (
              <span
                key={a}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent"
              >
                {a}
              </span>
            ))}
          </div>
        ) : null}

        {c.nicho.principal ? (
          <div className="mt-4 flex items-start gap-2 pt-4 border-t border-line">
            <Sparkles className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div className="text-sm min-w-0">
              <div className="font-semibold text-ink">{c.nicho.principal}</div>
              {c.nicho.promessa ? (
                <div className="text-[13px] text-ink-mute mt-0.5">
                  {c.nicho.promessa}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function labelGenero(g: string) {
  if (g === "feminino") return "Feminino";
  if (g === "masculino") return "Masculino";
  return "Não-binário";
}
function labelForma(f: string) {
  return f.charAt(0).toUpperCase() + f.slice(1);
}
