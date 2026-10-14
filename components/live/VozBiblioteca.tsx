"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import type { VozDaBiblioteca } from "@/lib/voz/elevenlabs";

export interface VozEscolhida {
  voiceId: string;
  nome: string;
  previewUrl?: string;
}

/**
 * Vozes prontas da ElevenLabs em português (as mesmas do vídeo falado): ouve
 * a prévia e escolhe. A escolhida entra na conta da NIDO (/api/voz/biblioteca)
 * e volta pronta para usar.
 */
export function VozBiblioteca({ onEscolher }: { onEscolher: (v: VozEscolhida) => void }) {
  const [genero, setGenero] = useState<"female" | "male">("female");
  const [pagina, setPagina] = useState(0);
  const [lista, setLista] = useState<{ vozes: VozDaBiblioteca[]; temMais: boolean } | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);
  const [adotando, setAdotando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const som = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => som.current?.pause(), []);
  useEffect(() => {
    let vivo = true;
    setLista(null);
    fetch(`/api/voz/biblioteca?genero=${genero}&pagina=${pagina}`, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
        setLista(r.ok ? b : { vozes: [], temMais: false });
      })
      .catch(() => vivo && setLista({ vozes: [], temMais: false }));
    return () => {
      vivo = false;
    };
  }, [genero, pagina]);

  function ouvir(v: VozDaBiblioteca) {
    som.current?.pause();
    if (tocando === v.voiceId || !v.previewUrl) return setTocando(null);
    const a = new Audio(v.previewUrl);
    a.onended = () => setTocando(null);
    void a.play();
    som.current = a;
    setTocando(v.voiceId);
  }

  async function escolher(v: VozDaBiblioteca) {
    setErro(null);
    setAdotando(v.voiceId);
    try {
      const res = await fetch("/api/voz/biblioteca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: v.voiceId, publicOwnerId: v.publicOwnerId, nome: v.nome }),
      });
      const b = (await res.json().catch(() => ({}))) as { voiceId?: string; error?: string };
      if (!res.ok || !b.voiceId) return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      som.current?.pause();
      onEscolher({ voiceId: b.voiceId, nome: v.nome, previewUrl: v.previewUrl ?? undefined });
    } finally {
      setAdotando(null);
    }
  }

  return (
    <div className="grid gap-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["female", "male"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              setGenero(g);
              setPagina(0);
            }}
            className={cn(
              "rounded-full border px-3 h-8 text-[12px] font-semibold cursor-pointer",
              g === genero ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-mute hover:text-ink",
            )}
          >
            {g === "female" ? tx("Femininas") : tx("Masculinas")}
          </button>
        ))}
      </div>
      {lista === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-ink-mute" />
      ) : (
        <ul className="grid gap-1.5">
          {lista.vozes.map((v) => (
            <li key={v.voiceId} className="flex items-center gap-2 text-[13px]">
              <button
                type="button"
                aria-label={tx("Ouvir")}
                onClick={() => ouvir(v)}
                disabled={!v.previewUrl}
                className="h-8 w-8 shrink-0 rounded-full border border-line grid place-items-center text-ink-mute hover:text-ink cursor-pointer disabled:opacity-40"
              >
                {tocando === v.voiceId ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <span className="min-w-0 flex-1 truncate">
                <b className="text-ink">{v.nome}</b>
                {v.descricao ? <span className="text-ink-mute"> · {v.descricao}</span> : null}
              </span>
              <Button size="sm" variant="ghost" onClick={() => escolher(v)} disabled={!!adotando}>
                {adotando === v.voiceId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {tx("Usar")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setPagina((p) => p - 1)} disabled={pagina === 0}>
          {tx("Anteriores")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPagina((p) => p + 1)} disabled={!lista?.temMais}>
          {tx("Mais vozes")}
        </Button>
      </div>
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
    </div>
  );
}
