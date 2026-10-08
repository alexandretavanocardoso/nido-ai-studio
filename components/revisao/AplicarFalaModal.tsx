"use client";

import { useState } from "react";
import { Loader2, Mic, X } from "lucide-react";
import type { AudioArquivo, VideoArquivo } from "@/lib/types";
import { fileUrl } from "@/lib/storage/client";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { CREDITOS_APLICAR_AUDIO } from "@/lib/planos";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

interface Props {
  video: VideoArquivo;
  audios: AudioArquivo[];
  onClose: () => void;
  onPronto: (novo: { key: string; size: number; duracao: number }) => void;
}

/** Coloca uma fala (voz do personagem) num vídeo: substitui ou mistura com o áudio original. */
export function AplicarFalaModal({ video, audios, onClose, onPronto }: Props) {
  const { conta } = useCreditos();
  const [audio, setAudio] = useState<string | null>(audios[0]?.id ?? null);
  const [modo, setModo] = useState<"misturar" | "substituir">("misturar");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<{ msg: string; code?: string } | null>(null);

  async function aplicar() {
    const a = audios.find((x) => x.id === audio);
    if (!a) return;
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/videos/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoKey: video.key, audioKey: a.key, modo }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        key?: string;
        size?: number;
        duracao?: number;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !b.key)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
        });
      onPronto({ key: b.key, size: b.size ?? 0, duracao: b.duracao ?? 0 });
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-lg p-5 sm:p-6 relative max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          disabled={enviando}
          className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="display text-xl text-ink uppercase mb-1">
          {tx("Adicionar fala")}
        </h2>
        <p className="text-[13px] text-ink-mute mb-4">
          {tx(
            "Coloca uma fala gerada com a voz do personagem neste vídeo. Gera um vídeo novo; o original fica. Os lábios não são sincronizados.",
          )}
        </p>

        <div className="grid gap-2 mb-4">
          {audios.map((a) => (
            <label
              key={a.id}
              className={cn(
                "rounded-xl border px-3 py-2 cursor-pointer grid gap-1.5",
                audio === a.id
                  ? "border-accent bg-accent/10"
                  : "border-line hover:border-line-strong",
              )}
            >
              <span className="flex items-start gap-2 text-[13px] text-ink">
                <input
                  type="radio"
                  name="fala"
                  checked={audio === a.id}
                  onChange={() => setAudio(a.id)}
                  className="accent-accent mt-1"
                />
                <span className="line-clamp-2">{a.texto}</span>
              </span>
              <audio
                src={fileUrl(a.key)}
                controls
                preload="none"
                className="w-full h-8"
              />
            </label>
          ))}
        </div>

        <div className="flex gap-1 border border-line rounded-full p-1 bg-panel w-fit mb-4">
          {(
            [
              ["misturar", tx("Por cima do áudio original")],
              ["substituir", tx("Só a fala")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setModo(id)}
              className={cn(
                "px-3 h-7 rounded-full text-[11px] font-bold mono transition",
                modo === id
                  ? "bg-accent text-bg"
                  : "text-ink-mute hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {erro ? (
          <div className="mb-4">
            <ErroGeracao mensagem={erro.msg} code={erro.code} />
          </div>
        ) : null}

        <Button
          variant="accent"
          onClick={aplicar}
          disabled={enviando || !audio}
        >
          {enviando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
          {enviando
            ? tx("Processando…")
            : `Adicionar fala${conta ? ` · ${CREDITOS_APLICAR_AUDIO} créditos` : ""}`}
        </Button>
      </div>
    </div>
  );
}
