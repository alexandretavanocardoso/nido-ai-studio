"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronsLeftRight,
  Download,
  Loader2,
  Maximize2,
  X,
} from "lucide-react";
import type { FotoDaSombra, VideoDaSombra } from "@/app/api/sombra/route";
import {
  AntesDepois,
  AntesDepoisImagem,
} from "@/components/revisao/AntesDepois";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { TempoDecorrido } from "@/components/revisao/VideosOrigem";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";
import { downloadUrl, fileUrl } from "@/lib/storage/client";

const EM_ANDAMENTO = ["na_fila", "processando", "finalizando"];

/** Botão redondo sobre a miniatura: fundo escuro translúcido para ler sobre qualquer imagem. */
const ICONE =
  "grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80";

/**
 * O que já foi gerado na Sombra sem personagem: as fotos ou os vídeos (a aba
 * escolhida na tela). Vídeo em andamento é acompanhado a cada 10s.
 */
export function HistoricoSombra({
  tipo,
  fotos,
  videos,
  onMudou,
}: {
  tipo: "foto" | "video";
  fotos: FotoDaSombra[];
  videos: VideoDaSombra[];
  /** Algum vídeo terminou: a tela recarrega o histórico. */
  onMudou: () => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  /** Item aberto no "antes e depois" (keys da original e do resultado). */
  const [comparar, setComparar] = useState<{
    tipo: "foto" | "video";
    antes: string;
    depois: string;
  } | null>(null);
  const pendentes = videos
    .filter((v) => EM_ANDAMENTO.includes(v.status))
    .map((v) => v.jobId)
    .join(",");

  useEffect(() => {
    if (!pendentes) return;
    let vivo = true;
    const consultar = async () => {
      let mudou = false;
      for (const id of pendentes.split(",")) {
        const r = await fetch(`/api/videos/jobs/${encodeURIComponent(id)}`, {
          cache: "no-store",
        }).catch(() => null);
        const b = (await r?.json().catch(() => null)) as {
          status?: string;
        } | null;
        if (b?.status && !EM_ANDAMENTO.includes(b.status)) mudou = true;
        if (b?.status === "erro") avisarCreditos(); // créditos devolvidos
      }
      if (vivo && mudou) onMudou();
    };
    const timer = setInterval(consultar, 10_000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [pendentes, onMudou]);

  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberta(null);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberta]);

  const vazio = tipo === "foto" ? !fotos.length : !videos.length;
  if (vazio) return null;

  return (
    <section className="grid gap-3">
      <div className="text-[13px] font-semibold text-ink">
        {tipo === "foto" ? tx("Imagens geradas") : tx("Vídeos gerados")}{" "}
        <span className="font-normal text-ink-dim">
          · {tipo === "foto" ? fotos.length : videos.length}
        </span>
      </div>

      {tipo === "foto" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map(({ key, antesKey }) => (
            <figure
              key={key}
              className="relative aspect-[4/5] overflow-hidden rounded-xl border border-line bg-bg"
            >
              <button
                type="button"
                onClick={() => setAberta(key)}
                aria-label={tx("Abrir")}
                className="absolute inset-0 cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl(key)}
                  alt={tx("Imagem gerada")}
                  className="h-full w-full object-cover"
                />
              </button>
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setAberta(key)}
                  aria-label={tx("Abrir")}
                  title={tx("Abrir")}
                  className={ICONE}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                {antesKey ? (
                  <button
                    type="button"
                    onClick={() =>
                      setComparar({
                        tipo: "foto",
                        antes: antesKey,
                        depois: key,
                      })
                    }
                    aria-label={tx("Antes e depois")}
                    title={tx("Antes e depois")}
                    className={ICONE}
                  >
                    <ChevronsLeftRight className="h-4 w-4" />
                  </button>
                ) : null}
                <a
                  href={downloadUrl(key, "sombra.jpg")}
                  aria-label={tx("Baixar")}
                  title={tx("Baixar")}
                  className={ICONE}
                >
                  <Download className="h-4 w-4" />
                </a>
              </div>
            </figure>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <figure
              key={v.jobId}
              className="overflow-hidden rounded-xl border border-line bg-bg"
            >
              {v.status === "concluido" && v.key ? (
                <video
                  src={fileUrl(v.key)}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-[9/16] max-h-[420px] w-full bg-black object-contain"
                />
              ) : (
                <div className="grid aspect-[9/16] max-h-[420px] w-full place-items-center bg-black/40 p-4 text-center">
                  {v.status === "erro" ? (
                    <div className="grid justify-items-center gap-2">
                      <AlertTriangle className="h-6 w-6 text-pink" />
                      <span className="text-[12.5px] text-pink">
                        {txErro(v.erro ?? "O processamento falhou.")}
                      </span>
                      <span className="text-[11.5px] text-ink-dim">
                        {tx("Os créditos foram devolvidos.")}
                      </span>
                    </div>
                  ) : (
                    <div className="grid justify-items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-accent" />
                      <span className="text-[12.5px] text-ink-mute">
                        {tx("Costuma levar de 3 a 15 min")}
                      </span>
                      <TempoDecorrido desde={new Date(v.criadoEm).getTime()} />
                    </div>
                  )}
                </div>
              )}
              <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="grid min-w-0 text-[12px] text-ink-dim">
                  <span className="truncate">
                    {new Date(v.criadoEm).toLocaleString()}
                    {v.duracao ? ` · ${v.duracao.toFixed(0)}s` : ""}
                  </span>
                  {/* Vídeo por link: o post de origem, como na lista do Estúdio. */}
                  {v.fonte ? (
                    <span className="truncate">
                      {tx("A partir de:")}{" "}
                      <a
                        href={v.fonte}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        {tx("link")}
                      </a>
                    </span>
                  ) : null}
                </span>
                {v.status === "concluido" && v.key ? (
                  <span className="flex shrink-0 items-center gap-3">
                    {v.antesKey ? (
                      <button
                        type="button"
                        onClick={() =>
                          setComparar({
                            tipo: "video",
                            antes: v.antesKey!,
                            depois: v.key!,
                          })
                        }
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
                      >
                        <ChevronsLeftRight className="h-3.5 w-3.5" />{" "}
                        {tx("Antes e depois")}
                      </button>
                    ) : null}
                    <a
                      href={downloadUrl(v.key, "sombra.mp4")}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
                    >
                      <Download className="h-3.5 w-3.5" /> {tx("Baixar")}
                    </a>
                  </span>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {comparar?.tipo === "foto" ? (
        <AntesDepoisImagem
          antes={fileUrl(comparar.antes)}
          depois={fileUrl(comparar.depois)}
          onClose={() => setComparar(null)}
        />
      ) : comparar ? (
        <AntesDepois
          antes={fileUrl(comparar.antes)}
          depois={fileUrl(comparar.depois)}
          onClose={() => setComparar(null)}
        />
      ) : null}

      {aberta ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setAberta(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(aberta)}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] max-w-full rounded-xl object-contain"
          />
          <div className="absolute right-4 top-4 flex gap-2">
            <a
              href={downloadUrl(aberta, "sombra.jpg")}
              onClick={(e) => e.stopPropagation()}
              aria-label={tx("Baixar")}
              title={tx("Baixar")}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <Download className="h-5 w-5" />
            </a>
            <button
              type="button"
              onClick={() => setAberta(null)}
              aria-label={tx("Fechar")}
              title={tx("Fechar")}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
