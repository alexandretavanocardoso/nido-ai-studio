"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Scissors, X } from "lucide-react";
import type { VideoArquivo } from "@/lib/types";
import { fileUrl } from "@/lib/storage/client";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import {
  CORTE_MAX_SEGUNDOS,
  CORTE_MIN_SEGUNDOS,
  CREDITOS_CORTAR_VIDEO,
} from "@/lib/planos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { tx } from "@/lib/i18n/tx";
import { useDuravel } from "@/lib/duravel";
import { txErro } from "@/lib/i18n/erros";

interface Props {
  video: VideoArquivo;
  onClose: () => void;
  /** Chamado com o vídeo novo (o corte gera outro arquivo; o original fica). */
  onPronto: (novo: {
    key: string;
    size: number;
    duracao: number;
    /** Registro da edição (vira o jobId do vídeo: é por ele que se pede reembolso). */
    jobId?: string;
  }) => void;
}

type Alca = "inicio" | "fim";

const limitar = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/** Segundos com até duas casas, sem zeros sobrando: 9.5, 15.03, 0. */
const seg = (n: number) => String(Number(n.toFixed(2)));

/**
 * Corta o vídeo: a pessoa arrasta as alças do começo e do fim na linha do
 * tempo (ou digita os tempos) e fica só com esse trecho. O processamento é no
 * servidor (ffmpeg), em /api/videos/cortar.
 */
export function CortarVideoModal({ video, onClose, onPronto }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** O que o ponteiro está arrastando na linha do tempo. */
  const arrastando = useRef<Alca | "agulha" | null>(null);
  const [aspecto, setAspecto] = useState(9 / 16);
  const [duracao, setDuracao] = useState(0);
  const [inicio, setInicio] = useState(0);
  const [fim, setFim] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [enviando, setEnviando] = useDuravel<boolean>(
    `corte:${video.id}:enviando`,
    false,
    "Cortando o vídeo",
  );
  const [erro, setErro] = useDuravel<{ msg: string; code?: string } | null>(
    `corte:${video.id}:erro`,
    null,
  );
  const { conta } = useCreditos();

  const trecho = fim - inicio;
  /** Nada foi cortado ainda: o trecho é o vídeo inteiro. */
  const inteiro = inicio < 0.05 && fim > duracao - 0.05;
  const longoDemais = trecho > CORTE_MAX_SEGUNDOS;
  const pct = (t: number) => `${duracao ? (t / duracao) * 100 : 0}%`;

  // Tocando, a agulha acompanha o vídeo e ele para no fim do trecho.
  useEffect(() => {
    if (!tocando) return;
    let quadro = 0;
    const passo = () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.currentTime >= fim) {
        v.pause();
        v.currentTime = inicio;
        return;
      }
      setTempo(v.currentTime);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, inicio, fim]);

  function irPara(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
    setTempo(t);
  }

  // Mexer numa ponta mostra o quadro dela, pra pessoa ver onde está cortando.
  function mudarInicio(t: number) {
    const n = limitar(t, 0, Math.max(0, fim - CORTE_MIN_SEGUNDOS));
    setInicio(n);
    irPara(n);
  }

  function mudarFim(t: number) {
    const n = limitar(
      t,
      Math.min(duracao, inicio + CORTE_MIN_SEGUNDOS),
      duracao,
    );
    setFim(n);
    irPara(n);
  }

  function mover(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastando.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = limitar((e.clientX - r.left) / r.width, 0, 1) * duracao;
    // As alças andam de 0,1 em 0,1s; a ponta do vídeo fica no valor exato.
    const passo = Math.min(duracao, Math.round(t * 10) / 10);
    if (arrastando.current === "inicio") mudarInicio(passo);
    else if (arrastando.current === "fim") mudarFim(passo);
    else irPara(t);
  }

  function alternar() {
    const v = videoRef.current;
    if (!v) return;
    if (tocando) return v.pause();
    // Toca só o trecho escolhido: fora dele, volta para o começo.
    if (v.currentTime < inicio || v.currentTime >= fim - 0.05)
      v.currentTime = inicio;
    void v.play().catch(() => {});
  }

  async function cortar() {
    setErro(null);
    videoRef.current?.pause();
    setEnviando(true);
    try {
      const res = await fetch("/api/videos/cortar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: video.key,
          inicio: Number(inicio.toFixed(3)),
          fim: Number(fim.toFixed(3)),
        }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        key?: string;
        size?: number;
        duracao?: number;
        edicaoId?: string | null;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !b.key)
        return setErro({
          msg: txErro(b.error ?? `Falha ao editar (HTTP ${res.status}).`),
          code: b.code,
        });
      onPronto({
        key: b.key,
        size: b.size ?? 0,
        duracao: b.duracao ?? trecho,
        jobId: b.edicaoId ?? undefined,
      });
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
      <div className="card w-full max-w-xl p-5 sm:p-6 relative max-h-[94dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="display text-xl text-ink uppercase mb-1">
          {tx("Cortar vídeo")}
        </h2>
        <p className="text-[13px] text-ink-mute mb-4">
          {tx(
            "Arraste as alças para escolher o começo e o fim, ou digite os tempos. O original não é alterado: sai um vídeo novo.",
          )}
        </p>

        <div
          className="relative w-full max-h-[50dvh] mx-auto bg-black rounded-lg overflow-hidden"
          style={{ aspectRatio: aspecto, maxWidth: `calc(50dvh * ${aspecto})` }}
        >
          <video
            ref={videoRef}
            src={fileUrl(video.key)}
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full"
            onClick={alternar}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight)
                setAspecto(v.videoWidth / v.videoHeight);
              const d = Number.isFinite(v.duration) ? v.duration : 0;
              setDuracao(d);
              setFim(d);
            }}
            onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
            onPlay={() => setTocando(true)}
            onPause={() => setTocando(false)}
            onEnded={() => setTocando(false)}
          />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={alternar}
            disabled={!duracao}
            className="h-8 w-8 rounded-full border border-line grid place-items-center text-ink-mute hover:text-ink shrink-0"
            aria-label={tocando ? tx("Pausar") : tx("Tocar")}
          >
            {tocando ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
          {/* Linha do tempo: arrastar uma alça muda o trecho; arrastar fora delas move a agulha. */}
          <div
            className="relative h-10 flex-1 touch-none select-none cursor-pointer"
            onPointerDown={(e) => {
              if (!duracao) return;
              const alca = (e.target as HTMLElement).dataset.alca as
                | Alca
                | undefined;
              arrastando.current = alca ?? "agulha";
              e.currentTarget.setPointerCapture(e.pointerId);
              // Pegar a alça não a tira do lugar; só o arrasto.
              if (!alca) mover(e);
            }}
            onPointerMove={mover}
            onPointerUp={() => (arrastando.current = null)}
            onPointerCancel={() => (arrastando.current = null)}
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-line" />
            <div
              className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 bg-accent/60"
              style={{ left: pct(inicio), width: pct(trecho) }}
            />
            <div
              className="pointer-events-none absolute top-1.5 bottom-1.5 w-0.5 -translate-x-1/2 bg-white"
              style={{ left: pct(tempo) }}
            />
            {(
              [
                ["inicio", inicio, mudarInicio, tx("Começo do trecho")],
                ["fim", fim, mudarFim, tx("Fim do trecho")],
              ] as const
            ).map(([id, valor, mudar, rotulo]) => (
              <button
                key={id}
                type="button"
                role="slider"
                data-alca={id}
                aria-label={rotulo}
                aria-valuemin={0}
                aria-valuemax={Number(duracao.toFixed(2))}
                aria-valuenow={Number(valor.toFixed(2))}
                aria-valuetext={`${seg(valor)}s`}
                onKeyDown={(e) => {
                  const passo =
                    e.key === "ArrowLeft"
                      ? -0.1
                      : e.key === "ArrowRight"
                        ? 0.1
                        : 0;
                  if (!passo) return;
                  e.preventDefault();
                  mudar(Number((valor + passo).toFixed(2)));
                }}
                className="absolute top-0 grid h-full w-6 -translate-x-1/2 cursor-ew-resize place-items-center"
                style={{ left: pct(valor) }}
              >
                <span className="pointer-events-none h-7 w-1.5 rounded-full bg-accent shadow-[0_0_0_2px_rgba(0,0,0,0.6)]" />
              </button>
            ))}
          </div>
          <span className="text-[11px] text-ink-dim tabular-nums shrink-0 w-14 text-right">
            {tempo.toFixed(1)}/{duracao.toFixed(1)}s
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <CampoTempo
            rotulo={tx("Começo (s)")}
            valor={inicio}
            onChange={mudarInicio}
            disabled={!duracao}
          />
          <CampoTempo
            rotulo={tx("Fim (s)")}
            valor={fim}
            onChange={mudarFim}
            disabled={!duracao}
          />
          <CampoTempo
            rotulo={tx("Duração (s)")}
            valor={trecho}
            onChange={(d) => mudarFim(inicio + d)}
            disabled={!duracao}
          />
        </div>

        {longoDemais ? (
          <p className="text-[12px] text-pink mt-3">
            {tx("O trecho pode ter até")} {CORTE_MAX_SEGUNDOS / 60}{" "}
            {tx("minutos.")}
          </p>
        ) : null}
        {erro ? (
          <div className="mt-3">
            <ErroGeracao mensagem={erro.msg} code={erro.code} />
          </div>
        ) : null}

        <Button
          variant="accent"
          className="mt-4"
          onClick={cortar}
          disabled={enviando || !duracao || inteiro || longoDemais}
        >
          {enviando ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Scissors className="w-4 h-4" />
          )}
          {enviando
            ? tx("Cortando… (até ~1 min)")
            : `${tx("Cortar")} · ${seg(trecho)}s${conta ? ` · ${CREDITOS_CORTAR_VIDEO} ${tx("créditos")}` : ""}`}
        </Button>
      </div>
    </div>
  );
}

/** Campo de tempo em segundos: aceita vírgula ou ponto e só aplica ao sair do campo (ou Enter). */
function CampoTempo({
  rotulo,
  valor,
  onChange,
  disabled,
}: {
  rotulo: string;
  valor: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  /** O que a pessoa está digitando; null = mostra o valor atual. */
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <label className="grid gap-1 text-[11px] text-ink-dim">
      {rotulo}
      <Input
        inputMode="decimal"
        disabled={disabled}
        value={texto ?? seg(valor)}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          if (texto === null) return;
          const n = Number(texto.trim().replace(",", "."));
          if (texto.trim() && Number.isFinite(n))
            onChange(Number(n.toFixed(2)));
          setTexto(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="text-[13px] tabular-nums text-ink"
      />
    </label>
  );
}
