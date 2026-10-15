"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Pause, Play } from "lucide-react";
import { tx } from "@/lib/i18n/tx";

/**
 * Prévia do motion: o HTML roda num iframe isolado (sandbox, sem acesso ao
 * app), no tamanho real do vídeo e encolhido para caber. O relógio dentro dele
 * (worker/motion/runtime.ts) toca em loop e obedece play, pausa e a barra.
 */
export function PlayerMotion({
  id,
  largura,
  altura,
  duracao,
}: {
  id: string;
  largura: number;
  altura: number;
  duracao: number;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(true);
  const [escala, setEscala] = useState(0.25);
  const caixa = useRef<HTMLDivElement>(null);
  const quadro = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let vivo = true;
    setHtml(null);
    setErro(null);
    setTempo(0);
    setTocando(true);
    fetch(`/api/admin/motion/${encodeURIComponent(id)}/html`, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (r.ok) setHtml(b.html);
        else setErro(b.error ?? `Falha (HTTP ${r.status}).`);
      })
      .catch(() => vivo && setErro(tx("Sem conexão. Tente de novo.")));
    return () => {
      vivo = false;
    };
  }, [id]);

  // A escala acompanha a largura da caixa.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(el.clientWidth / largura);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [largura]);

  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.source !== quadro.current?.contentWindow) return;
      const d = e.data as { motion?: boolean; tipo?: string; t?: number; tocando?: boolean; mensagem?: string };
      if (!d?.motion) return;
      if (d.tipo === "tempo") {
        setTempo(d.t ?? 0);
        if (typeof d.tocando === "boolean") setTocando(d.tocando);
      }
      if (d.tipo === "erro") setErro(d.mensagem ?? tx("A animação deu erro."));
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, []);

  const mandar = (m: Record<string, unknown>) => quadro.current?.contentWindow?.postMessage(m, "*");

  return (
    <div className="grid gap-2">
      <div
        ref={caixa}
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-line bg-black"
        style={{ aspectRatio: `${largura} / ${altura}`, maxWidth: `calc(56vh * ${largura / altura})` }}
      >
        {html ? (
          <iframe
            ref={quadro}
            title={tx("Prévia do motion")}
            srcDoc={html}
            sandbox="allow-scripts"
            width={largura}
            height={altura}
            className="absolute left-0 top-0 border-0"
            style={{ transform: `scale(${escala})`, transformOrigin: "0 0" }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            mandar({ motionControle: tocando ? "pausar" : "tocar" });
            setTocando(!tocando);
          }}
          aria-label={tocando ? tx("Pausar") : tx("Tocar")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-ink hover:border-line-strong cursor-pointer"
        >
          {tocando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={duracao}
          step={1 / 30}
          value={tempo}
          onChange={(e) => {
            const t = Number(e.target.value);
            setTempo(t);
            setTocando(false);
            mandar({ motionControle: "pular", t });
          }}
          aria-label={tx("Tempo")}
          className="min-w-0 flex-1 accent-accent"
        />
        <span className="w-[72px] shrink-0 text-right text-[12px] tabular-nums text-ink-dim">
          {tempo.toFixed(1)}s / {duracao}s
        </span>
      </div>
      {erro ? (
        <p className="flex items-start gap-1.5 text-[12px] text-pink">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {tx("Erro na animação:")} {erro}
          </span>
        </p>
      ) : null}
    </div>
  );
}
