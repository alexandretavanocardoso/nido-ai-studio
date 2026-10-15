"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Loader2, Music, Pause, Play, Upload, X } from "lucide-react";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { pilula } from "@/components/live/Preparar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { DECLARACAO_MUSICA } from "@/lib/declaracoes";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import type { MusicaDeFundo } from "@/lib/musica";
import { CREDITOS_LINK } from "@/lib/planos";
import { fileUrl, uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";

/** A música escolhida, com a declaração de direito de uso já aceita. */
export type MusicaEscolhida = MusicaDeFundo & { declaracao: string };

/**
 * Música de fundo (opcional) do vídeo de produto e do motion: um áudio enviado
 * ou tirado de um link do YouTube (ou TikTok, Instagram, X). Antes, a pessoa
 * declara que tem direito de usar a música.
 */
export function EscolherMusica({
  valor,
  onChange,
  dica,
}: {
  valor: MusicaDeFundo | null;
  onChange: (m: MusicaEscolhida | null) => void;
  /** Linha de ajuda embaixo (ex.: "fica mais baixa quando alguém fala"). */
  dica?: string;
}) {
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [declarou, setDeclarou] = useState(false);
  const [link, setLink] = useState("");
  const [enviando, setEnviando] = useState<number | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const som = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => som.current?.pause(), []);
  useEffect(() => {
    som.current?.pause();
    som.current = null;
    setTocando(false);
  }, [valor?.key]);

  function ouvir() {
    if (!valor) return;
    if (!som.current) {
      som.current = new Audio(fileUrl(valor.key));
      som.current.onended = () => setTocando(false);
    }
    if (tocando) som.current.pause();
    else void som.current.play().catch(() => setTocando(false));
    setTocando(!tocando);
  }

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    const regras = STORAGE_KINDS.audios;
    if (!(regras.types as readonly string[]).includes(arquivo.type))
      return setErro(tx("Envie um áudio em MP3, M4A, WAV ou OGG."));
    if (arquivo.size > regras.maxBytes) return setErro(tx("O áudio passa de 10 MB."));
    setErro(null);
    setEnviando(0);
    try {
      const key = await uploadFile(arquivo, "audios", (p) => setEnviando(p));
      onChange({ key, nome: arquivo.name.replace(/\.[a-z0-9]+$/i, ""), origem: "upload", declaracao: DECLARACAO_MUSICA });
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
      const r = await fetch("/api/videos/musica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link.trim(), declaracao: DECLARACAO_MUSICA }),
      });
      const b = await r.json().catch(() => ({}));
      avisarCreditos();
      if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
      onChange({ ...b.musica, declaracao: DECLARACAO_MUSICA });
      setLink("");
    } catch {
      setErro(tx("Sem conexão. Tente de novo."));
    } finally {
      setBuscando(false);
    }
  }

  if (valor)
    return (
      <div className="grid gap-1.5">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-bg px-3 py-2.5">
          <button
            type="button"
            onClick={ouvir}
            aria-label={tocando ? tx("Pausar") : tx("Ouvir")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent hover:bg-accent/25 cursor-pointer"
          >
            {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{valor.nome}</span>
            <span className="block text-[11.5px] text-ink-dim">
              {valor.origem === "link" ? tx("Música do link") : tx("Áudio enviado")}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={tx("Tirar a música")}
            title={tx("Tirar a música")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mute hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {dica ? <span className="text-[12px] text-ink-dim">{tx(dica)}</span> : null}
      </div>
    );

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["arquivo", "Enviar áudio", Upload],
            ["link", "Link do YouTube", Link2],
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
        <span>{tx(DECLARACAO_MUSICA)}</span>
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
            {enviando !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">
              {enviando !== null ? `${tx("Enviando…")} ${Math.round(enviando * 100)}%` : tx("Escolher o arquivo de áudio")}
            </span>
            <span className="block text-[11.5px] text-ink-dim">{tx("MP3, M4A, WAV ou OGG, até 10 MB.")}</span>
          </span>
          <input
            type="file"
            accept="audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm"
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
              placeholder="https://www.youtube.com/watch?v=…"
              inputMode="url"
            />
            <Button variant="ghost" onClick={() => void buscar()} disabled={!declarou || !link.trim() || buscando}>
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {tx("Buscar")}
            </Button>
          </div>
          <span className="text-[11.5px] text-ink-dim">
            {buscando
              ? tx("Baixando a música… pode levar até 2 minutos.")
              : `${tx("Usa até 5 minutos do áudio.")} ${CREDITOS_LINK} ${tx("créditos")}.`}
          </span>
        </div>
      )}
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
      {dica ? <span className="text-[12px] text-ink-dim">{tx(dica)}</span> : null}
    </div>
  );
}
