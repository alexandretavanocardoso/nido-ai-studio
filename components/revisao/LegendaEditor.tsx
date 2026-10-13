"use client";

import { useRef, useState } from "react";
import {
  Eraser,
  Loader2,
  Lock,
  Sparkles,
  SquareDashedMousePointer,
  Type,
  X,
} from "lucide-react";
import type { VideoArquivo } from "@/lib/types";
import { fileUrl } from "@/lib/storage/client";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import {
  bloqueioLegendaIA,
  CREDITOS_LEGENDA,
  creditosLegendaIA,
} from "@/lib/planos";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { useDuravel } from "@/lib/duravel";
import { txErro } from "@/lib/i18n/erros";
import {
  caracteresPorLinha,
  centroDaLegenda,
  LEGENDA_ALTURA_LINHA,
  LEGENDA_CONTORNO,
  LEGENDA_FONTE,
  LEGENDA_IMA,
  quebrarLinhas,
} from "@/lib/video/legenda-texto";

const limitar = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/** Prévia da legenda nova: mesmas medidas do servidor, em % da largura do vídeo (cqw). */
const PREVIA_FONTE = LEGENDA_FONTE * 100;
const PREVIA_POR_LINHA = caracteresPorLinha(1, LEGENDA_FONTE);
const PREVIA_CONTORNO = [-1, 0, 1]
  .flatMap((x) => [-1, 0, 1].map((y) => [x, y]))
  .filter(([x, y]) => x || y)
  .map(
    ([x, y]) =>
      `${(x * PREVIA_FONTE * LEGENDA_CONTORNO).toFixed(2)}cqw ${(y * PREVIA_FONTE * LEGENDA_CONTORNO).toFixed(2)}cqw 0 #000`,
  )
  .join(", ");

interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  video: VideoArquivo;
  /** Personagem dono do vídeo (o job da IA atualiza a ficha quando termina). */
  characterId: string;
  onClose: () => void;
  /** Modo rápido: chamado com o vídeo novo (a edição gera outro arquivo; o original fica). */
  onPronto: (novo: {
    key: string;
    size: number;
    duracao: number;
    /** Registro da edição (vira o jobId do vídeo: é por ele que se pede reembolso). */
    jobId?: string;
  }) => void;
  /** Modo IA: chamado com o job em processamento (aparece na lista e termina sozinho). */
  onJob: (job: { jobId: string; duracao: number }) => void;
}

/**
 * Editor de legenda "queimada": a pessoa escolhe um quadro, arrasta um
 * retângulo sobre a legenda e escolhe remover ou trocar o texto. O
 * processamento é no servidor (ffmpeg), em /api/videos/legenda.
 */
export function LegendaEditor({
  video,
  characterId,
  onClose,
  onPronto,
  onJob,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  /** Movendo a área já marcada: onde o ponteiro a pegou (distância até o canto dela). */
  const pega = useRef<{ dx: number; dy: number } | null>(null);
  /** Ponteiro apertado sobre o vídeo (marcando ou movendo a área). */
  const [arrastando, setArrastando] = useState(false);
  const [aspecto, setAspecto] = useState(9 / 16);
  const [duracao, setDuracao] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [modo, setModo] = useState<"remover" | "trocar">("remover");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useDuravel<boolean>(
    `legenda:${video.id}:enviando`,
    false,
    "Editando a legenda do vídeo",
  );
  const [erro, setErro] = useDuravel<string | null>(
    `legenda:${video.id}:erro`,
    null,
  );
  const [erroCode, setErroCode] = useDuravel<string | null>(
    `legenda:${video.id}:erroCode`,
    null,
  );
  const { conta } = useCreditos();
  const recursos = useRecursos();
  /** rapida = ffmpeg, na hora · ia = Bria Video Eraser (fundo complexo), alguns minutos. */
  const [qualidade, setQualidade] = useState<"rapida" | "ia">("rapida");
  const bloqueioIA =
    conta && duracao ? bloqueioLegendaIA(conta.plano, duracao) : null;
  const creditos =
    qualidade === "ia" ? creditosLegendaIA(duracao) : CREDITOS_LEGENDA;

  function pos(e: React.PointerEvent) {
    const r = areaRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = pos(e);
    setArrastando(true);
    // Dentro da área marcada, o arrasto move a área; fora dela, marca outra.
    if (
      caixa &&
      p.x >= caixa.x &&
      p.x <= caixa.x + caixa.w &&
      p.y >= caixa.y &&
      p.y <= caixa.y + caixa.h
    ) {
      pega.current = { dx: p.x - caixa.x, dy: p.y - caixa.y };
      return;
    }
    inicio.current = p;
    setCaixa(null);
  }

  function onMove(e: React.PointerEvent) {
    const p = pos(e);
    if (pega.current) {
      const { dx, dy } = pega.current;
      setCaixa((c) => {
        if (!c) return c;
        let x = limitar(p.x - dx, 0, 1 - c.w);
        // Trocando o texto, a área gruda no meio do vídeo quando passa perto dele.
        if (modo === "trocar" && Math.abs(x + c.w / 2 - 0.5) <= LEGENDA_IMA)
          x = 0.5 - c.w / 2;
        return { ...c, x, y: limitar(p.y - dy, 0, 1 - c.h) };
      });
      return;
    }
    if (!inicio.current) return;
    const a = inicio.current;
    setCaixa({
      x: Math.min(a.x, p.x),
      y: Math.min(a.y, p.y),
      w: Math.abs(p.x - a.x),
      h: Math.abs(p.y - a.y),
    });
  }

  function onUp() {
    inicio.current = null;
    pega.current = null;
    setArrastando(false);
    setCaixa((c) => (c && c.w > 0.02 && c.h > 0.01 ? c : null));
  }

  /** A área como vai para o servidor; a prévia usa a mesma, pra legenda sair onde aparece. */
  const areaEnviada = caixa ? comFolga(caixa) : null;
  const linhasPrevia =
    areaEnviada && modo === "trocar" && texto.trim()
      ? quebrarLinhas(texto, PREVIA_POR_LINHA).split("\n")
      : null;
  const meioPrevia =
    areaEnviada && linhasPrevia
      ? centroDaLegenda(areaEnviada, linhasPrevia)
      : 0.5;

  async function aplicar() {
    setErro(null);
    if (!caixa) return setErro("Arraste um retângulo sobre a legenda.");
    if (modo === "trocar" && !texto.trim())
      return setErro("Escreva o texto da nova legenda.");
    setEnviando(true);
    try {
      const res = await fetch("/api/videos/legenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Uma folga em volta da caixa ajuda o delogo a não deixar contorno de letra.
        body: JSON.stringify({
          key: video.key,
          caixa: areaEnviada,
          modo,
          texto: modo === "trocar" ? texto : undefined,
          qualidade,
          characterId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        key?: string;
        jobId?: string;
        size?: number;
        duracao?: number;
        edicaoId?: string | null;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (res.ok && body.jobId)
        return onJob({ jobId: body.jobId, duracao: body.duracao ?? duracao });
      if (!res.ok || !body.key) {
        setErroCode(body.code ?? null);
        return setErro(txErro(body.error ?? `Falha ao editar (HTTP ${res.status}).`));
      }
      onPronto({
        key: body.key,
        size: body.size ?? 0,
        duracao: body.duracao ?? duracao,
        jobId: body.edicaoId ?? undefined,
      });
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
      <div className="card w-full max-w-3xl p-5 sm:p-6 relative max-h-[94dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="display text-xl text-ink uppercase mb-1">
          {tx("Editar legenda")}
        </h2>
        <p className="text-[13px] text-ink-mute mb-4">
          {tx(
            "Arraste um retângulo no vídeo: sobre a legenda que quer tirar, ou onde a nova vai ficar. A área marcada vale pro vídeo todo. O original não é alterado: sai um vídeo novo.",
          )}
        </p>

        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
          <div>
            <div
              ref={areaRef}
              className="relative w-full max-h-[60dvh] mx-auto bg-black rounded-lg overflow-hidden touch-none select-none cursor-crosshair"
              style={{
                aspectRatio: aspecto,
                maxWidth: `calc(60dvh * ${aspecto})`,
                // A prévia da legenda mede a letra pela largura do vídeo (cqw).
                containerType: "inline-size",
              }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <video
                ref={videoRef}
                src={fileUrl(video.key)}
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 w-full h-full pointer-events-none"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight)
                    setAspecto(v.videoWidth / v.videoHeight);
                  setDuracao(v.duration);
                  v.currentTime = Math.min(1, v.duration / 3);
                }}
              />
              {caixa && (
                <div
                  className="absolute border-2 border-accent bg-accent/20 cursor-move"
                  style={{
                    left: `${caixa.x * 100}%`,
                    top: `${caixa.y * 100}%`,
                    width: `${caixa.w * 100}%`,
                    height: `${caixa.h * 100}%`,
                  }}
                />
              )}
              {/* Sem área marcada: convite pra arrastar, em cima do vídeo. */}
              {!caixa && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center p-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-center text-[12px] font-semibold text-white shadow-lg animate-pulse">
                    <SquareDashedMousePointer className="h-4 w-4 shrink-0 text-accent" />
                    {modo === "trocar"
                      ? tx("Arraste onde a legenda vai ficar")
                      : tx("Arraste sobre a legenda que quer remover")}
                  </span>
                </div>
              )}
              {/* Guia do meio do vídeo, enquanto a legenda está grudada nele. */}
              {arrastando && linhasPrevia && meioPrevia === 0.5 ? (
                <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent/70" />
              ) : null}
              {/* Prévia da legenda nova, no lugar em que o servidor escreve. */}
              {areaEnviada && linhasPrevia ? (
                <div
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre text-center font-bold text-white"
                  style={{
                    left: `${meioPrevia * 100}%`,
                    top: `${(areaEnviada.y + areaEnviada.h / 2) * 100}%`,
                    fontSize: `${PREVIA_FONTE}cqw`,
                    lineHeight: LEGENDA_ALTURA_LINHA,
                    textShadow: PREVIA_CONTORNO,
                  }}
                >
                  {linhasPrevia.join("\n")}
                </div>
              ) : null}
            </div>
            <input
              type="range"
              min={0}
              max={duracao || 0}
              step={0.1}
              value={tempo}
              onChange={(e) => {
                const t = Number(e.target.value);
                setTempo(t);
                if (videoRef.current) videoRef.current.currentTime = t;
              }}
              className="w-full mt-3 accent-accent"
              aria-label={tx("Escolher quadro")}
            />
            <div className="text-[11px] text-ink-dim">
              {tempo.toFixed(1)}
              {tx("s /")} {duracao.toFixed(1)}s
            </div>
          </div>

          <div className="grid gap-4 content-start">
            <div className="flex gap-1 border border-line rounded-full p-1 bg-panel w-fit">
              {(
                [
                  ["remover", "Remover", Eraser],
                  ["trocar", "Trocar texto", Type],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModo(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 h-8 rounded-full text-[12px] font-bold uppercase tracking-wider mono transition",
                    modo === id
                      ? "bg-accent text-bg"
                      : "text-ink-mute hover:text-ink",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {!caixa && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-3 text-[12px] text-ink-mute leading-relaxed">
                <strong className="text-ink">
                  {modo === "trocar"
                    ? tx("Marque no vídeo onde a legenda vai ficar.")
                    : tx("Marque a legenda no vídeo.")}
                </strong>{" "}
                {modo === "trocar"
                  ? tx(
                      "Arraste um retângulo sobre a legenda atual. Se o vídeo não tem legenda, arraste no lugar onde a nova deve aparecer.",
                    )
                  : tx("Arraste um retângulo sobre a legenda que quer remover.")}
              </div>
            )}

            {modo === "trocar" && (
              <div>
                <Textarea
                  rows={3}
                  maxLength={200}
                  placeholder={tx(
                    "Nova legenda (ex.: Quando o prazo é amanhã)",
                  )}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <p className="text-[11px] text-ink-dim mt-1">
                  {tx(
                    "Sai no meio da área marcada, em branco com contorno, quebrando linha sozinha.",
                  )}
                </p>
              </div>
            )}

            <p className="text-[12px] text-ink-mute leading-relaxed">
              {caixa
                ? `${tx("Área marcada. Arraste a área para mover, ou arraste fora dela para marcar outra.")} `
                : null}
              {tx(
                "A remoção reconstrói a área a partir dos pixels vizinhos: em fundo liso fica quase invisível; em fundo com muito detalhe pode sobrar um leve borrão (a nova legenda ajuda a esconder).",
              )}
            </p>

            {recursos.fal && (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["rapida", tx("Rápida"), tx("Na hora · fundo liso")],
                    ["ia", tx("Com IA"), tx("Alguns minutos · fundo complexo")],
                  ] as const
                ).map(([id, titulo, sub]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setQualidade(id)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left transition",
                      qualidade === id
                        ? "border-accent bg-accent/10"
                        : "border-line hover:border-line-strong",
                    )}
                  >
                    <div className="text-[12px] font-bold text-ink inline-flex items-center gap-1">
                      {id === "ia" &&
                        (bloqueioIA ? (
                          <Lock className="w-3 h-3" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        ))}
                      {titulo}
                    </div>
                    <div className="text-[11px] text-ink-dim">
                      {sub}
                      {conta && duracao
                        ? ` · ${id === "ia" ? creditosLegendaIA(duracao) : CREDITOS_LEGENDA} créditos`
                        : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {qualidade === "ia" && (
              <p className="text-[12px] text-ink-mute leading-relaxed">
                {tx(
                  "A IA reconstrói o fundo atrás da legenda quadro a quadro — sem borrão. Só a área marcada muda; o resto do vídeo e o áudio ficam originais. Pode fechar a página: o vídeo aparece na lista quando ficar pronto.",
                )}
              </p>
            )}

            {qualidade === "ia" && bloqueioIA ? (
              <ErroGeracao mensagem={bloqueioIA} code="PLANO" />
            ) : null}
            {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}

            <Button
              variant="accent"
              onClick={aplicar}
              disabled={
                enviando || !caixa || (qualidade === "ia" && !!bloqueioIA)
              }
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {enviando
                ? qualidade === "ia"
                  ? tx("Enviando os trechos pra IA…")
                  : tx("Processando… (até ~1 min)")
                : !caixa
                  ? tx("Marque a área no vídeo")
                  : `${modo === "remover" ? tx("Remover legenda") : tx("Trocar legenda")}${conta ? ` · ${creditos} créditos` : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function comFolga(c: Caixa, f = 0.01): Caixa {
  const x = Math.max(0, c.x - f);
  const y = Math.max(0, c.y - f);
  return {
    x,
    y,
    w: Math.min(1 - x, c.w + 2 * f),
    h: Math.min(1 - y, c.h + 2 * f),
  };
}
