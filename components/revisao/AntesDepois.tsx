"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsLeftRight, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

const tempo = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Antes e depois de uma troca: o vídeo original e o novo sobrepostos, no
 * mesmo instante, com uma divisória que a pessoa arrasta. À esquerda da
 * divisória aparece o original; à direita, o resultado. O som é o do resultado.
 */
export function AntesDepois({
  antes,
  depois,
  titulo,
  onClose,
}: {
  /** src do vídeo original. */
  antes: string;
  /** src do vídeo novo. */
  depois: string;
  titulo?: string;
  onClose: () => void;
}) {
  const depoisRef = useRef<HTMLVideoElement>(null);
  const antesRef = useRef<HTMLVideoElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  /** Posição da divisória (0 = só o depois, 1 = só o antes). */
  const [corte, setCorte] = useState(0.5);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [agora, setAgora] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [proporcao, setProporcao] = useState(9 / 16);
  const [semAntes, setSemAntes] = useState(false);

  // O vídeo novo manda; o original segue o mesmo instante.
  const alinhar = useCallback(() => {
    const d = depoisRef.current;
    const a = antesRef.current;
    if (!d || !a) return;
    if (Math.abs(a.currentTime - d.currentTime) > 0.12)
      a.currentTime = Math.min(d.currentTime, a.duration || d.currentTime);
  }, []);

  function alternar() {
    const d = depoisRef.current;
    const a = antesRef.current;
    if (!d) return;
    if (d.paused) {
      alinhar();
      void d.play().catch(() => {});
      void a?.play().catch(() => {});
    } else {
      d.pause();
      a?.pause();
    }
  }

  function irPara(t: number) {
    const d = depoisRef.current;
    if (!d) return;
    d.currentTime = t;
    if (antesRef.current) antesRef.current.currentTime = t;
    setAgora(t);
  }

  // Arrastar a divisória (mouse e toque).
  const arrastando = useRef(false);
  const mover = useCallback((clientX: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (r?.width) setCorte(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }, []);
  useEffect(() => {
    const move = (e: PointerEvent) => arrastando.current && mover(e.clientX);
    const solta = () => (arrastando.current = false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", solta);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCorte((c) => Math.max(0, c - 0.05));
      if (e.key === "ArrowRight") setCorte((c) => Math.min(1, c + 0.05));
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", solta);
      window.removeEventListener("keydown", tecla);
    };
  }, [mover, onClose]);

  const selo =
    "absolute top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white mono pointer-events-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card flex max-h-[94dvh] w-full max-w-md flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="display text-lg uppercase text-ink">
              {tx("Antes e depois")}
            </h2>
            {titulo ? (
              <p className="truncate text-[12px] text-ink-mute">{titulo}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx("Fechar")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink-mute hover:border-ink hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center">
          <div
            ref={areaRef}
            className="relative max-h-[66dvh] w-full touch-none select-none overflow-hidden rounded-2xl bg-black"
            style={{ aspectRatio: String(proporcao), maxWidth: `calc(66dvh * ${proporcao})` }}
            onPointerDown={(e) => {
              arrastando.current = true;
              mover(e.clientX);
            }}
          >
            <video
              ref={depoisRef}
              src={depois}
              playsInline
              loop
              muted={mudo}
              preload="auto"
              className="absolute inset-0 h-full w-full object-cover"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDuracao(v.duration || 0);
                if (v.videoWidth && v.videoHeight)
                  setProporcao(v.videoWidth / v.videoHeight);
              }}
              onTimeUpdate={(e) => {
                setAgora(e.currentTarget.currentTime);
                alinhar();
              }}
              onPlay={() => setTocando(true)}
              onPause={() => setTocando(false)}
              onSeeked={alinhar}
            />
            {/* O original por cima, recortado até a divisória. */}
            {semAntes ? null : (
              <video
                ref={antesRef}
                src={antes}
                playsInline
                muted
                preload="auto"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ clipPath: `inset(0 ${(1 - corte) * 100}% 0 0)` }}
                onError={() => setSemAntes(true)}
              />
            )}
            <span className={cn(selo, "left-3")}>{tx("Antes")}</span>
            <span className={cn(selo, "right-3")}>{tx("Depois")}</span>
            <div
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white"
              style={{ left: `${corte * 100}%` }}
            >
              <div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-white text-black shadow-lg">
                <ChevronsLeftRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        {semAntes ? (
          <p className="text-[12px] text-pink">
            {tx("O vídeo original não está mais disponível para comparar.")}
          </p>
        ) : null}

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={alternar}
            aria-label={tocando ? tx("Pausar") : tx("Tocar")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink hover:border-accent"
          >
            {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={duracao || 0}
            step={0.05}
            value={Math.min(agora, duracao || 0)}
            onChange={(e) => irPara(Number(e.target.value))}
            aria-label={tx("Posição do vídeo")}
            className="min-w-0 flex-1 accent-accent"
          />
          <span className="mono shrink-0 text-[11px] text-ink-mute">
            {tempo(agora)} / {tempo(duracao)}
          </span>
          <button
            type="button"
            onClick={() => setMudo((m) => !m)}
            aria-label={mudo ? tx("Ligar o som") : tx("Desligar o som")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink-mute hover:text-ink"
          >
            {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[11px] text-ink-dim">
          {tx("Arraste a divisória para comparar o original com o vídeo novo.")}
        </p>
      </div>
    </div>
  );
}

/**
 * Antes e depois de uma troca em imagem: a foto original e a nova
 * sobrepostas, com a mesma divisória arrastável do vídeo. À esquerda da
 * divisória, o original; à direita, o resultado.
 */
export function AntesDepoisImagem({
  antes,
  depois,
  titulo,
  onClose,
}: {
  /** src da foto original. */
  antes: string;
  /** src da foto nova. */
  depois: string;
  titulo?: string;
  onClose: () => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  /** Posição da divisória (0 = só o depois, 1 = só o antes). */
  const [corte, setCorte] = useState(0.5);
  const [proporcao, setProporcao] = useState(1);
  const [semAntes, setSemAntes] = useState(false);

  const arrastando = useRef(false);
  const mover = useCallback((clientX: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (r?.width) setCorte(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }, []);
  useEffect(() => {
    const move = (e: PointerEvent) => arrastando.current && mover(e.clientX);
    const solta = () => (arrastando.current = false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", solta);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCorte((c) => Math.max(0, c - 0.05));
      if (e.key === "ArrowRight") setCorte((c) => Math.min(1, c + 0.05));
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", solta);
      window.removeEventListener("keydown", tecla);
    };
  }, [mover, onClose]);

  const selo =
    "absolute top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white mono pointer-events-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card flex max-h-[94dvh] w-full max-w-3xl flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="display text-lg uppercase text-ink">
              {tx("Antes e depois")}
            </h2>
            {titulo ? (
              <p className="truncate text-[12px] text-ink-mute">{titulo}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx("Fechar")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink-mute hover:border-ink hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 place-items-center">
          <div
            ref={areaRef}
            className="relative max-h-[74dvh] w-full touch-none select-none overflow-hidden rounded-2xl bg-black"
            style={{ aspectRatio: String(proporcao), maxWidth: `calc(74dvh * ${proporcao})` }}
            onPointerDown={(e) => {
              arrastando.current = true;
              mover(e.clientX);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={depois}
              alt={tx("Depois")}
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              onLoad={(e) => {
                const i = e.currentTarget;
                if (i.naturalWidth && i.naturalHeight)
                  setProporcao(i.naturalWidth / i.naturalHeight);
              }}
            />
            {/* O original por cima, recortado até a divisória (esticado ao quadro do resultado). */}
            {semAntes ? null : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={antes}
                alt={tx("Antes")}
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ clipPath: `inset(0 ${(1 - corte) * 100}% 0 0)` }}
                onError={() => setSemAntes(true)}
              />
            )}
            <span className={cn(selo, "left-3")}>{tx("Antes")}</span>
            <span className={cn(selo, "right-3")}>{tx("Depois")}</span>
            <div
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white"
              style={{ left: `${corte * 100}%` }}
            >
              <div className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-white text-black shadow-lg">
                <ChevronsLeftRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        {semAntes ? (
          <p className="text-[12px] text-pink">
            {tx("A foto original não está mais disponível para comparar.")}
          </p>
        ) : null}
        <p className="text-[11px] text-ink-dim">
          {tx("Arraste a divisória para comparar a foto original com a nova.")}
        </p>
      </div>
    </div>
  );
}
