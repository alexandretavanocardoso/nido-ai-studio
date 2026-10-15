"use client";

import { useEffect } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import type { VideoDeProduto } from "@/app/api/produto/route";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { TempoDecorrido } from "@/components/revisao/VideosOrigem";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { downloadUrl, fileUrl } from "@/lib/storage/client";

const EM_ANDAMENTO = ["na_fila", "processando", "finalizando"];

/**
 * Os vídeos de produto já pedidos. Em andamento, a consulta do job (a cada
 * 10s) é o que faz as cenas andarem e o vídeo ficar pronto.
 */
export function HistoricoProduto({
  videos,
  onMudou,
}: {
  videos: VideoDeProduto[];
  /** Algum vídeo terminou: a tela recarrega a lista. */
  onMudou: () => void;
}) {
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
        const b = (await r?.json().catch(() => null)) as { status?: string } | null;
        if (b?.status && !EM_ANDAMENTO.includes(b.status)) mudou = true;
        if (b?.status === "erro") avisarCreditos(); // créditos devolvidos
      }
      if (vivo && mudou) onMudou();
    };
    void consultar();
    const timer = setInterval(consultar, 10_000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [pendentes, onMudou]);

  if (!videos.length) return null;
  return (
    <section className="grid gap-3">
      <div className="text-[13px] font-semibold text-ink">
        {tx("Vídeos gerados")} <span className="font-normal text-ink-dim">· {videos.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {videos.map((v) => (
          <figure key={v.jobId} className="grid content-start gap-2">
            <div className="relative grid aspect-[9/16] place-items-center overflow-hidden rounded-xl border border-line bg-bg">
              {v.status === "concluido" && v.key ? (
                <video src={fileUrl(v.key)} controls playsInline preload="metadata" className="h-full w-full object-contain" />
              ) : v.status === "erro" ? (
                <div className="grid justify-items-center gap-2 p-3 text-center">
                  <AlertTriangle className="h-5 w-5 text-pink" />
                  <span className="text-[12px] text-ink-mute">{v.erro ? txErro(v.erro) : tx("Falhou.")}</span>
                </div>
              ) : (
                <div className="grid justify-items-center gap-2 p-3 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
                  <span className="text-[12px] text-ink-mute">
                    <TempoDecorrido desde={new Date(v.criadoEm).getTime()} />
                  </span>
                </div>
              )}
              {v.status === "concluido" && v.key ? (
                <a
                  href={downloadUrl(v.key, `produto-${v.jobId}.mp4`)}
                  aria-label={tx("Baixar")}
                  title={tx("Baixar")}
                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
                >
                  <Download className="h-4 w-4" />
                </a>
              ) : null}
            </div>
            <figcaption className="truncate text-[12px] text-ink-mute" title={v.produto}>
              {v.produto}
              {v.duracao ? <span className="text-ink-dim"> · {Math.round(v.duracao)}s</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
