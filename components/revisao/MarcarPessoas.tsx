"use client";

import { useEffect, useRef, useState } from "react";
import { MousePointerClick, Pause, Play } from "lucide-react";
import { nanoid } from "nanoid";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/cn";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import { tx } from "@/lib/i18n/tx";

export interface Marca {
  id: string;
  /** Clique em frações do quadro (0–1). */
  x: number;
  y: number;
  /** Instante do vídeo (s) em que a pessoa foi marcada. */
  t: number;
  characterId: string;
  imageKey: string | null;
}

export const MAX_MARCAS = 3;
export const CORES_MARCA = ["#dfff2a", "#38bdf8", "#f472b6"];

/** Primeira imagem do personagem (retrato gerado primeiro), pra já vir escolhida. */
export function primeiraImagem(c: Character | undefined): string | null {
  if (!c) return null;
  const doPersonagem = (c.geradas ?? []).filter((g) => g.tipo !== "troca");
  const retrato =
    doPersonagem.find((g) => g.tipo === "retrato") ?? doPersonagem[0];
  return retrato?.key ?? c.visual.referencias.find((r) => r.key)?.key ?? null;
}

export function novaMarca(
  x: number,
  y: number,
  t: number,
  personagem: Character,
): Marca {
  return {
    id: nanoid(6),
    x,
    y,
    t,
    characterId: personagem.id,
    imageKey: primeiraImagem(personagem),
  };
}

/** Tamanho do elemento (atualiza ao redimensionar). */
function useTamanho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setTam({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, tam] as const;
}

/**
 * O vídeo ocupando todo o espaço disponível (sem cortar e sem rolagem), com
 * controle de tempo. Clique numa pessoa marca quem trocar (até 3).
 */
export function VideoMarcador({
  src,
  marcas,
  onMarcar,
  onRemover,
}: {
  src: string;
  marcas: Marca[];
  onMarcar: (x: number, y: number, t: number) => void;
  onRemover: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [areaRef, area] = useTamanho<HTMLDivElement>();
  const [proporcao, setProporcao] = useState(9 / 16);
  const [duracao, setDuracao] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);

  // Maior caixa com a proporção do vídeo que cabe na área.
  const largura = area.w && area.h ? Math.min(area.w, area.h * proporcao) : 0;
  const altura = largura / proporcao;

  function clicar(e: React.MouseEvent<HTMLDivElement>) {
    if (marcas.length >= MAX_MARCAS) return;
    const r = e.currentTarget.getBoundingClientRect();
    const v = videoRef.current;
    v?.pause();
    onMarcar(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      v?.currentTime ?? 0,
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div ref={areaRef} className="flex-1 min-h-0 grid place-items-center">
        <div
          className="relative rounded-xl overflow-hidden bg-black"
          style={{ width: largura, height: altura }}
        >
          <video
            ref={videoRef}
            src={src}
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-fill"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight)
                setProporcao(v.videoWidth / v.videoHeight);
              setDuracao(v.duration || 0);
              v.currentTime = Math.min(1, (v.duration || 0) / 3);
            }}
            onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
            onPlay={() => setTocando(true)}
            onPause={() => setTocando(false)}
          />
          <div
            className={cn(
              "absolute inset-0",
              marcas.length < MAX_MARCAS && "cursor-crosshair",
            )}
            onClick={clicar}
            role="button"
            aria-label={tx("Clique na pessoa que deve ser trocada")}
          />
          {/* A marca só aparece no quadro em que foi feita: ela identifica QUEM é a
              pessoa (a IA acompanha essa pessoa pelo vídeo todo, mesmo se mexendo). */}
          {marcas.map((m, i) =>
            Math.abs(tempo - m.t) < 0.35 ? (
              <button
                key={m.id}
                type="button"
                onClick={() => onRemover(m.id)}
                title={tx("Desmarcar")}
                className="absolute -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full grid place-items-center text-[13px] font-bold text-bg shadow-lg ring-2 ring-black/40"
                style={{
                  left: `${m.x * 100}%`,
                  top: `${m.y * 100}%`,
                  background: CORES_MARCA[i],
                }}
              >
                {i + 1}
              </button>
            ) : null,
          )}

          {/* Convite pra marcar (até a primeira marca). */}
          {marcas.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg animate-pulse">
                <MousePointerClick className="w-4 h-4 text-accent" />
                {tx("Clique em quem você quer trocar")}
              </span>
            </div>
          )}

          {/* Marcas feitas em outro momento: atalho pra voltar até elas. */}
          {marcas.some((m) => Math.abs(tempo - m.t) >= 0.35) && (
            <div className="absolute left-2 bottom-2 flex flex-wrap gap-1.5">
              {marcas.map((m, i) =>
                Math.abs(tempo - m.t) >= 0.35 ? (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (v) {
                        v.pause();
                        v.currentTime = m.t;
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-black/75 pl-1 pr-2 py-0.5 text-[11px] text-white hover:bg-black"
                    title={tx("Ver onde esta pessoa foi marcada")}
                  >
                    <span
                      className="h-4 w-4 rounded-full grid place-items-center text-[10px] font-bold text-bg"
                      style={{ background: CORES_MARCA[i] }}
                    >
                      {i + 1}
                    </span>
                    {tx("marcada em")} {m.t.toFixed(1)}s
                  </button>
                ) : null,
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() =>
            tocando ? videoRef.current?.pause() : videoRef.current?.play()
          }
          className="h-8 w-8 rounded-full border border-line grid place-items-center text-ink-mute hover:text-ink shrink-0"
          aria-label={tocando ? tx("Pausar") : tx("Tocar")}
        >
          {tocando ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={duracao || 0}
          step={0.05}
          value={tempo}
          onChange={(e) => {
            const v = videoRef.current;
            if (v) v.currentTime = Number(e.target.value);
          }}
          aria-label={tx("Momento do vídeo")}
        />
        <span className="text-[11px] text-ink-dim tabular-nums shrink-0 w-12 text-right">
          {tempo.toFixed(1)}/{duracao.toFixed(0)}s
        </span>
      </div>
      <p className="text-[12px] text-ink-dim text-center shrink-0">
        {marcas.length === 0
          ? tx(
              "Pause num momento em que a pessoa aparece bem e clique nela. Sem marcar ninguém, a IA troca a pessoa principal.",
            )
          : marcas.length < MAX_MARCAS
            ? tx(
                "A IA acompanha cada pessoa marcada pelo vídeo inteiro, mesmo se ela se mexer. Clique em outra pessoa para trocar mais de uma · clique no número para desmarcar.",
              )
            : `Máximo de ${MAX_MARCAS} pessoas por vídeo.`}
      </p>
    </div>
  );
}

/** Uma pessoa marcada: qual influencer entra no lugar dela e com qual imagem. */
export function LinhaMarca({
  numero,
  marca,
  personagens,
  onChange,
}: {
  numero: number;
  marca: Marca;
  personagens: Character[];
  onChange: (m: Partial<Marca>) => void;
}) {
  const escolhido =
    personagens.find((p) => p.id === marca.characterId) ?? personagens[0];
  const opcoes = useImagensPersonagem(escolhido);
  return (
    <div className="rounded-xl border border-line bg-panel p-2.5 grid gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-6 w-6 rounded-full grid place-items-center text-[12px] font-bold text-bg shrink-0"
          style={{ background: CORES_MARCA[numero - 1] }}
        >
          {numero}
        </span>
        <span className="text-[13px] text-ink-mute shrink-0">vira</span>
        {personagens.length > 1 ? (
          <select
            value={escolhido.id}
            onChange={(e) => {
              const novo = personagens.find((p) => p.id === e.target.value);
              onChange({
                characterId: e.target.value,
                imageKey: primeiraImagem(novo),
              });
            }}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-[13px] font-semibold text-ink"
          >
            {personagens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.identidade.nome || tx("Sem nome")}
              </option>
            ))}
          </select>
        ) : (
          <strong className="text-[13px] text-ink truncate">
            {escolhido.identidade.nome || tx("o personagem")}
          </strong>
        )}
      </div>
      <EscolherImagemPersonagem
        compacto
        opcoes={opcoes}
        valor={marca.imageKey}
        onChange={(k) => onChange({ imageKey: k })}
      />
    </div>
  );
}

/**
 * A foto ocupando o espaço disponível (sem cortar e sem rolagem). Clique numa
 * pessoa marca quem trocar (até 3); clique no número desmarca.
 */
export function ImagemMarcador({
  src,
  marcas,
  onMarcar,
  onRemover,
}: {
  src: string;
  marcas: Marca[];
  onMarcar: (x: number, y: number) => void;
  onRemover: (id: string) => void;
}) {
  const [areaRef, area] = useTamanho<HTMLDivElement>();
  const [proporcao, setProporcao] = useState(1);
  const largura = area.w && area.h ? Math.min(area.w, area.h * proporcao) : 0;
  const altura = largura / proporcao;

  function clicar(e: React.MouseEvent<HTMLDivElement>) {
    if (marcas.length >= MAX_MARCAS) return;
    const r = e.currentTarget.getBoundingClientRect();
    onMarcar(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div ref={areaRef} className="flex-1 min-h-0 grid place-items-center">
        <div
          className="relative rounded-xl overflow-hidden bg-black"
          style={{ width: largura, height: altura }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-fill select-none"
            draggable={false}
            onLoad={(e) => {
              const i = e.currentTarget;
              if (i.naturalWidth && i.naturalHeight)
                setProporcao(i.naturalWidth / i.naturalHeight);
            }}
          />
          <div
            className={cn(
              "absolute inset-0",
              marcas.length < MAX_MARCAS && "cursor-crosshair",
            )}
            onClick={clicar}
            role="button"
            aria-label={tx("Clique na pessoa que deve ser trocada")}
          />
          {marcas.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onRemover(m.id)}
              title={tx("Desmarcar")}
              className="absolute -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full grid place-items-center text-[13px] font-bold text-bg shadow-lg ring-2 ring-black/40"
              style={{
                left: `${m.x * 100}%`,
                top: `${m.y * 100}%`,
                background: CORES_MARCA[i],
              }}
            >
              {i + 1}
            </button>
          ))}
          {marcas.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg animate-pulse">
                <MousePointerClick className="w-4 h-4 text-accent" />
                {tx("Clique em quem você quer trocar")}
              </span>
            </div>
          )}
        </div>
      </div>
      <p className="text-[12px] text-ink-dim text-center shrink-0">
        {marcas.length === 0
          ? tx("Sem marcar ninguém, a IA troca a pessoa principal da foto.")
          : marcas.length < MAX_MARCAS
            ? tx(
                "Clique em outra pessoa para trocar mais de uma · clique no número para desmarcar.",
              )
            : tx("Máximo de 3 pessoas por foto.")}
      </p>
    </div>
  );
}
