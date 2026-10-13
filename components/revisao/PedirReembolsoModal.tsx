"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { VideoArquivo } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";
import {
  MOTIVOS_REEMBOLSO,
  NOME_MOTIVO_REEMBOLSO,
  REEMBOLSO_TEXTO_MAX,
  type MotivoReembolso,
  type ReembolsoDoVideo,
} from "@/lib/video/reembolso";

interface Props {
  video: VideoArquivo;
  onClose: () => void;
  onPedido: (pedido: ReembolsoDoVideo) => void;
}

/**
 * Pedido de reembolso dos créditos de um vídeo gerado: a pessoa escolhe o
 * motivo e envia; um admin aprova (os créditos voltam) ou recusa, explicando.
 */
export function PedirReembolsoModal({ video, onClose, onPedido }: Props) {
  // "Trocou a pessoa errada" só faz sentido na troca de pessoa.
  const motivos = MOTIVOS_REEMBOLSO.filter(
    (m) => m !== "pessoa_errada" || video.origem === "substituicao",
  );
  const [motivo, setMotivo] = useState<MotivoReembolso>(motivos[0]);
  const [detalhe, setDetalhe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const faltaTexto = motivo === "outro" && !detalhe.trim();

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/videos/reembolso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: video.jobId,
          // Edição antiga (sem registro): o servidor acha a cobrança pelo tipo.
          key: video.jobId ? undefined : video.key,
          edicao: video.jobId ? undefined : video.origem,
          motivo,
          detalhe: detalhe.trim() || undefined,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as ReembolsoDoVideo & {
        error?: string;
      };
      if (!res.ok || !b.jobId)
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      onPedido(b);
    } catch (e) {
      setErro((e as Error).message);
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
      <div className="card w-full max-w-lg p-5 sm:p-6 relative max-h-[94dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="display text-xl text-ink uppercase mb-1">
          {tx("Pedir reembolso")}
        </h2>
        <p className="text-[13px] text-ink-mute mb-4">
          {tx(
            "Conte o que aconteceu com este vídeo. Nossa equipe analisa o pedido: se for aprovado, os créditos dele voltam para a sua conta; se não for, você recebe o motivo.",
          )}
        </p>

        <div className="grid gap-2 mb-4">
          {motivos.map((m) => (
            <label
              key={m}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] text-ink cursor-pointer",
                motivo === m
                  ? "border-accent bg-accent/10"
                  : "border-line hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name="motivo-reembolso"
                checked={motivo === m}
                onChange={() => setMotivo(m)}
                className="accent-accent"
              />
              {tx(NOME_MOTIVO_REEMBOLSO[m])}
            </label>
          ))}
        </div>

        <Textarea
          rows={3}
          maxLength={REEMBOLSO_TEXTO_MAX}
          placeholder={
            motivo === "outro"
              ? tx("Escreva o motivo")
              : tx("Detalhes (opcional): o que saiu errado e em que momento do vídeo")
          }
          value={detalhe}
          onChange={(e) => setDetalhe(e.target.value)}
        />

        {erro ? <p className="mt-3 text-[12px] text-pink">{erro}</p> : null}

        <Button
          variant="accent"
          className="mt-4"
          onClick={enviar}
          disabled={enviando || faltaTexto}
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {enviando ? tx("Enviando…") : tx("Enviar pedido")}
        </Button>
      </div>
    </div>
  );
}
