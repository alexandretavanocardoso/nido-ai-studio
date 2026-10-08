"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Film } from "lucide-react";
import { cn } from "@/lib/cn";
import { copyToClipboard } from "@/lib/export";
import { tx } from "@/lib/i18n/tx";
import { promptSubstituirVideo } from "@/lib/prompts/substituir-video";
import type { Character } from "@/lib/types";

const IAS: Array<[string, string]> = [
  ["Runway", "https://app.runwayml.com/"],
  ["Kling", "https://klingai.com/"],
  ["Veo", "https://labs.google/fx/tools/flow"],
  ["Pika", "https://pika.art/"],
];

/**
 * Prompt pronto do personagem para trocar a pessoa de um vídeo numa IA de
 * vídeo-para-vídeo de fora (Runway, Kling, Veo, Pika): é só anexar o vídeo
 * original e a imagem do personagem e colar. Sai da ficha, então muda sozinho
 * quando a ficha muda.
 */
export function PromptSubstituirVideo({ character }: { character: Character }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const prompt = useMemo(() => promptSubstituirVideo(character), [character]);

  async function copiar() {
    if (!(await copyToClipboard(prompt))) return;
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <section className="rounded-xl border border-accent/25 bg-accent/5">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Film className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="label-cap block !text-accent">
            {tx("Substituir pessoa em vídeo (Sombra)")}
          </span>
          <span className="mt-1 block text-[13px] text-ink-mute">
            {tx("Mantém movimento, gestual, ritmo e enquadramento")}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-2 h-4 w-4 shrink-0 text-ink-mute transition",
            aberto && "rotate-180",
          )}
        />
      </button>

      {aberto ? (
        <div className="grid gap-3 px-4 pb-4">
          <p className="text-[13px] leading-relaxed text-ink-mute">
            {tx(
              "Prompt pronto para trocar uma pessoa de um vídeo existente pelo seu personagem, mantendo exatamente o mesmo movimento. Anexe o vídeo original + a imagem de referência do personagem numa IA de vídeo-para-vídeo (Runway, Kling, Veo, Pika) e cole este prompt.",
            )}
          </p>
          <div className="overflow-hidden rounded-xl border border-line bg-bg">
            <div className="grid gap-2.5 border-b border-line p-3.5">
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Runway · Kling · Veo · Pika
                </div>
                <div className="text-[12px] text-ink-dim">
                  {tx("Precisa anexar vídeo de origem + imagem do personagem.")}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {IAS.map(([nome, href]) => (
                  <a
                    key={nome}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3.5 text-[12px] font-semibold text-ink-mute transition hover:border-line-strong hover:text-ink"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {nome}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={copiar}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-4 text-[12px] font-bold uppercase tracking-wide text-bg transition hover:bg-accent-strong"
                >
                  {copiado ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiado ? tx("Copiado!") : tx("Copiar")}
                </button>
              </div>
            </div>
            <pre className="mono max-h-[420px] overflow-auto whitespace-pre-wrap p-3.5 text-[12.5px] leading-relaxed text-ink/85">
              {prompt}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
