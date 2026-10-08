"use client";

import { ArrowRight, Check, Link2, Loader2, RotateCcw, X } from "lucide-react";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { CREDITOS_LINK } from "@/lib/planos";
import type { VideoLink } from "@/components/revisao/SubstituirPessoaModal";
import { tx } from "@/lib/i18n/tx";
import { useDuravel } from "@/lib/duravel";
import { txErro } from "@/lib/i18n/erros";

interface Props {
  onClose: () => void;
  /** Vídeo carregado e confirmado pelo usuário: segue pra tela de troca de pessoa. */
  onEncontrado: (link: VideoLink) => void;
}

/**
 * Vídeo por link (TikTok, Instagram, YouTube Shorts ou .mp4 direto), em dois passos:
 *  1. Carregar — o servidor busca o vídeo (Apify) e o usuário ASSISTE para conferir
 *     se é o certo. Nada é trocado aqui.
 *  2. Substituir — só depois de confirmar ele segue para a tela de troca.
 * O vídeo de origem não é salvo; só o resultado da troca vai pra conta.
 */
export function LinkVideoModal({ onClose, onEncontrado }: Props) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const [url, setUrl] = useDuravel<string>("link-video:url", "");
  const [buscando, setBuscando] = useDuravel<boolean>(
    "link-video:buscando",
    false,
    "Buscando o vídeo do link",
  );
  const [erro, setErro] = useDuravel<{ msg: string; code?: string } | null>(
    "link-video:erro",
    null,
  );
  /** Vídeo carregado, esperando o usuário conferir. */
  const [achado, setAchado] = useDuravel<VideoLink | null>(
    "link-video:achado",
    null,
  );

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
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
        });
      setAchado({
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

  const passo = achado ? 2 : 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-lg p-5 sm:p-6 relative rounded-t-3xl sm:rounded-3xl max-h-[94vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="display text-xl text-ink uppercase mb-3 pr-10">
          {tx("Vídeo por link")}
        </h2>

        {/* Passos: carregar → conferir → substituir */}
        <ol className="flex items-center gap-2 mb-4 text-[12px] font-semibold">
          {[tx("Carregar o vídeo"), tx("Conferir"), tx("Substituir")].map(
            (rotulo, i) => {
              const n = i + 1;
              const feito = n < passo;
              const atual = n === passo;
              return (
                <li key={rotulo} className="flex items-center gap-2 min-w-0">
                  {i > 0 ? (
                    <span className="h-px w-4 bg-line shrink-0" aria-hidden />
                  ) : null}
                  <span
                    className={cn(
                      "h-5 w-5 rounded-full grid place-items-center text-[11px] shrink-0",
                      feito
                        ? "bg-accent/20 text-accent"
                        : atual
                          ? "bg-accent text-bg"
                          : "border border-line text-ink-dim",
                    )}
                  >
                    {feito ? <Check className="w-3 h-3" strokeWidth={3} /> : n}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      atual ? "text-ink" : "text-ink-dim",
                    )}
                    aria-current={atual ? "step" : undefined}
                  >
                    {rotulo}
                  </span>
                </li>
              );
            },
          )}
        </ol>

        {!achado ? (
          <>
            <p className="text-[13px] text-ink-mute mb-4">
              {tx(
                "Cole o link de um vídeo público. Primeiro a gente carrega o vídeo para você conferir se é o certo — nada é trocado ainda.",
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
            <div>
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
                  ? tx("Carregando o vídeo… (até 2 min)")
                  : `${tx("Carregar vídeo")}${conta ? ` · ${CREDITOS_LINK} ${tx("créditos")}` : ""}`}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-h-0 grid place-items-center rounded-xl bg-black overflow-hidden">
              {achado.videoUrl ? (
                <video
                  src={achado.videoUrl}
                  poster={achado.thumb ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[52vh] w-full object-contain"
                />
              ) : achado.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={achado.thumb}
                  alt=""
                  className="max-h-[52vh] w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <p className="p-8 text-[13px] text-ink-dim text-center">
                  {tx("Vídeo carregado (sem prévia disponível).")}
                </p>
              )}
            </div>
            <div className="mt-3 min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">
                {achado.titulo || tx("Vídeo carregado")}
              </div>
              <div className="text-[12px] text-ink-mute truncate">
                {achado.plataforma}
                {achado.autor ? ` · @${achado.autor}` : ""}
                {achado.duracao ? ` · ${achado.duracao.toFixed(1)}s` : ""}
              </div>
            </div>
            <p className="text-[13px] text-ink mt-3">
              {tx(
                "É este o vídeo? Assista para conferir. Se for, siga para escolher quem trocar.",
              )}
            </p>
            <div className="flex justify-between items-center gap-2 flex-wrap mt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setAchado(null);
                  setErro(null);
                }}
              >
                <RotateCcw className="w-4 h-4" /> {tx("Usar outro link")}
              </Button>
              <Button variant="accent" onClick={() => {
                  // Já usado: o próximo "vídeo por link" começa do zero.
                  setAchado(null);
                  setUrl("");
                  onEncontrado(achado);
                }}>
                {tx("É este — substituir pessoa")}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
