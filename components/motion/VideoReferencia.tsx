"use client";

import { useState } from "react";
import { Film, Link2, Loader2, Upload, X } from "lucide-react";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { pilula } from "@/components/live/Preparar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { DECLARACAO_REFERENCIA_MOTION } from "@/lib/declaracoes";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { CREDITOS_LINK } from "@/lib/planos";
import { fileUrl, uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";
import { REFERENCIA_MAX_SEGUNDOS } from "@/worker/motion/tipos";

/** O vídeo de referência escolhido (a declaração de direito de uso já foi aceita). */
export interface ReferenciaEscolhida {
  key: string;
  origem: "upload" | "link";
  url?: string;
  titulo?: string;
  duracao: number;
  largura: number;
  altura: number;
  /** Para a prévia na tela. */
  src: string;
}

/** Duração e tamanho do vídeo escolhido, lidos pelo navegador antes de enviar. */
function lerVideo(arquivo: File): Promise<{ duracao: number; largura: number; altura: number; src: string }> {
  return new Promise((ok, falha) => {
    const src = URL.createObjectURL(arquivo);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => ok({ duracao: v.duration, largura: v.videoWidth, altura: v.videoHeight, src });
    v.onerror = () => falha(new Error(tx("Não consegui ler o vídeo. Envie um MP4, MOV ou WebM.")));
    v.src = src;
  });
}

/**
 * Vídeo de referência do Motion (estilo Katana): um vídeo enviado ou de um
 * link das redes, até 1 minuto. O motion recria a edição dele — cenas,
 * tempos, estilo e batidas — com o material e o pedido de quem gera. Antes, a
 * pessoa declara que pode usar o vídeo.
 */
export function VideoReferencia({
  valor,
  onChange,
  usarAudio,
  onUsarAudio,
}: {
  valor: ReferenciaEscolhida | null;
  onChange: (r: ReferenciaEscolhida | null) => void;
  usarAudio: boolean;
  onUsarAudio: (v: boolean) => void;
}) {
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [declarou, setDeclarou] = useState(false);
  const [link, setLink] = useState("");
  const [enviando, setEnviando] = useState<number | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    const regras = STORAGE_KINDS.videos;
    if (!(regras.types as readonly string[]).includes(arquivo.type))
      return setErro(tx("Envie um vídeo em MP4, MOV ou WebM."));
    if (arquivo.size > regras.maxBytes) return setErro(tx("O vídeo passa de 500 MB."));
    setErro(null);
    try {
      const v = await lerVideo(arquivo);
      if (v.duracao > REFERENCIA_MAX_SEGUNDOS + 1)
        return setErro(`${tx("O vídeo tem")} ${Math.round(v.duracao)}s — ${tx("o máximo é 1 minuto.")}`);
      setEnviando(0);
      const key = await uploadFile(arquivo, "videos", (p) => setEnviando(p));
      onChange({ key, origem: "upload", titulo: arquivo.name.replace(/\.[a-z0-9]+$/i, ""), ...v });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }

  async function buscar() {
    setErro(null);
    setBuscando(true);
    try {
      const r = await fetch("/api/motion/referencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link.trim() }),
      });
      const b = await r.json().catch(() => ({}));
      avisarCreditos();
      if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
      const ref = b.referencia as Omit<ReferenciaEscolhida, "src"> & { titulo: string | null };
      onChange({ ...ref, titulo: ref.titulo ?? undefined, src: fileUrl(ref.key) });
      setLink("");
    } catch {
      setErro(tx("Sem conexão. Tente de novo."));
    } finally {
      setBuscando(false);
    }
  }

  if (valor)
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-bg p-2">
          <video
            src={valor.src}
            controls
            playsInline
            preload="metadata"
            className="max-h-[240px] max-w-[min(100%,320px)] rounded-lg bg-black"
          />
          <div className="min-w-0 flex-1 py-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{valor.titulo || tx("Vídeo de referência")}</span>
            <span className="block text-[11.5px] text-ink-dim">
              {Math.round(valor.duracao)}s · {valor.largura}×{valor.altura} ·{" "}
              {valor.origem === "link" ? tx("do link") : tx("enviado")}
            </span>
            <span className="mt-1 block text-[11.5px] text-ink-dim">
              {tx("O motion dura o mesmo que o vídeo e segue as cenas, os tempos e o estilo dele.")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={tx("Trocar o vídeo")}
            title={tx("Trocar o vídeo")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mute hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
          <input type="checkbox" checked={usarAudio} onChange={(e) => onUsarAudio(e.target.checked)} />
          {tx("Usar o áudio do vídeo como música de fundo do MP4")}
        </label>
      </div>
    );

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["arquivo", "Enviar vídeo", Upload],
            ["link", "Link das redes", Link2],
          ] as const
        ).map(([m, rotulo, Icone]) => (
          <button key={m} type="button" onClick={() => setModo(m)} className={cn(pilula(modo === m), "h-8 gap-1.5 px-3 cursor-pointer")}>
            <Icone className="h-3.5 w-3.5" />
            {tx(rotulo)}
          </button>
        ))}
      </div>

      <label className="flex items-start gap-2 text-[12.5px] text-ink-mute cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={declarou} onChange={(e) => setDeclarou(e.target.checked)} />
        <span>{tx(DECLARACAO_REFERENCIA_MOTION)}</span>
      </label>

      {modo === "arquivo" ? (
        <label
          className={cn(
            "flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 transition",
            declarou && enviando === null
              ? "cursor-pointer border-line-strong hover:border-accent"
              : "cursor-not-allowed border-line opacity-60",
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-ink-mute">
            {enviando !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">
              {enviando !== null ? `${tx("Enviando…")} ${Math.round(enviando * 100)}%` : tx("Escolher o vídeo de referência")}
            </span>
            <span className="block text-[11.5px] text-ink-dim">{tx("MP4, MOV ou WebM, até 1 minuto.")}</span>
          </span>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            disabled={!declarou || enviando !== null}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = "";
              void enviar(arquivo);
            }}
          />
        </label>
      ) : (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && declarou && link.trim() && !buscando && void buscar()}
              placeholder="https://www.instagram.com/reel/…"
              inputMode="url"
            />
            <Button variant="ghost" onClick={() => void buscar()} disabled={!declarou || !link.trim() || buscando}>
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {tx("Buscar")}
            </Button>
          </div>
          <span className="text-[11.5px] text-ink-dim">
            {buscando
              ? tx("Baixando o vídeo… pode levar até 2 minutos.")
              : `${tx("YouTube, TikTok, Instagram ou X, até 1 minuto.")} ${CREDITOS_LINK} ${tx("créditos")}.`}
          </span>
        </div>
      )}
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
      <span className="text-[12px] text-ink-dim">
        {tx(
          "Funciona melhor com vídeos de motion (textos, formas e produtos animados). Num vídeo filmado, o motion recria a história e o ritmo em animação — para pôr o seu personagem na cena filmada, use “Trocar pessoa pelo personagem” nos vídeos do personagem.",
        )}
      </span>
    </div>
  );
}
