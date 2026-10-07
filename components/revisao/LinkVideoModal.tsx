"use client";

import { useState } from "react";
import { Link2, Loader2, X } from "lucide-react";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CREDITOS_LINK } from "@/lib/planos";
import type { VideoLink } from "@/components/revisao/SubstituirPessoaModal";
import { tx } from "@/lib/i18n/tx";

interface Props {
  onClose: () => void;
  /** Vídeo encontrado: segue pra tela de troca de pessoa. */
  onEncontrado: (link: VideoLink) => void;
}

/**
 * Colar link de vídeo (TikTok, Instagram, YouTube Shorts ou .mp4 direto).
 * O servidor busca o vídeo (Apify) e deixa uma cópia temporária só pra IA —
 * o vídeo de origem não é salvo; só o resultado da troca vai pra conta.
 */
export function LinkVideoModal({ onClose, onEncontrado }: Props) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const [url, setUrl] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<{ msg: string; code?: string } | null>(null);

  async function buscar() {
    setErro(null);
    setBuscando(true);
    try {
      const res = await fetch("/api/videos/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const b = (await res.json().catch(() => ({}))) as Partial<VideoLink> & {
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !b.linkId)
        return setErro({
          msg: b.error ?? `Falha (HTTP ${res.status}).`,
          code: b.code,
        });
      onEncontrado({
        linkId: b.linkId,
        url: url.trim(),
        plataforma: b.plataforma ?? "link",
        titulo: b.titulo ?? null,
        autor: b.autor ?? null,
        thumb: b.thumb ?? null,
        videoUrl: b.videoUrl ?? null,
        duracao: b.duracao ?? 0,
      });
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-lg p-5 sm:p-6 relative rounded-t-3xl sm:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          disabled={buscando}
          className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="display text-xl text-ink uppercase mb-1">
          {tx("Trocar pessoa por link")}
        </h2>
        <p className="text-[13px] text-ink-mute mb-4">
          {tx(
            "Cole o link de um vídeo público. O vídeo vai direto pra IA trocar a pessoa pelo personagem — só o resultado fica salvo na sua conta.",
          )}
        </p>
        <Input
          type="url"
          placeholder="https://www.tiktok.com/@perfil/video/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && url.trim() && !buscando && buscar()
          }
          disabled={buscando}
        />
        <p className="text-[11px] text-ink-dim mt-1.5 mb-4">
          {recursos.apify
            ? tx("TikTok, Instagram (reel/post), YouTube Shorts ou ")
            : ""}
          {tx("link direto de .mp4. Até 3 minutos.")}
        </p>
        {erro ? (
          <div className="mb-4">
            <ErroGeracao mensagem={erro.msg} code={erro.code} />
          </div>
        ) : null}
        <Button
          variant="accent"
          onClick={buscar}
          disabled={buscando || !url.trim()}
        >
          {buscando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Link2 className="w-4 h-4" />
          )}
          {buscando
            ? tx("Buscando o vídeo… (até 2 min)")
            : `Buscar vídeo${conta ? ` · ${CREDITOS_LINK} créditos` : ""}`}
        </Button>
      </div>
    </div>
  );
}
