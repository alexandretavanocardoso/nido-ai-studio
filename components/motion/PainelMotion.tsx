"use client";

import { useState } from "react";
import { AlertTriangle, Download, FileCode, Film, Loader2, Wand2, X } from "lucide-react";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import type { ItemMotion } from "@/lib/motion";
import { downloadUrl } from "@/lib/storage/client";
import {
  creditosMotion,
  ehModeloMotion,
  MODELOS_MOTION,
  ROTULO_ESFORCO,
  type EsforcoMotion,
} from "@/worker/motion/modelos";
import { FORMATOS_MOTION, type ProgressoMotion } from "@/worker/motion/tipos";
import { EscolherMusica, type MusicaEscolhida } from "@/components/musica/EscolherMusica";
import { PlayerMotion } from "./PlayerMotion";

const ETAPA: Record<ProgressoMotion["etapa"], string> = {
  site: "Lendo o site…",
  assistindo: "Assistindo ao vídeo de referência…",
  pensando: "Pensando na animação…",
  escrevendo: "Escrevendo a animação…",
  conferindo: "Conferindo se a animação carrega…",
  revisando: "Revisando os quadros…",
  gravando: "Gravando o vídeo…",
  enviando: "Guardando o vídeo…",
};

export const nomeDoModelo = (m: string) => (ehModeloMotion(m) ? MODELOS_MOTION[m].rotulo : m);
export const nomeDoEsforco = (e: string | null) => (e && e in ROTULO_ESFORCO ? tx(ROTULO_ESFORCO[e as EsforcoMotion]) : "");

/** Tempo em minutos e segundos ("2 min 10 s"). */
const duracaoTexto = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);

/** O motion escolhido: andamento, prévia, custo e as ações (ajustar, gravar o MP4, baixar). */
export function PainelMotion({
  motion: m,
  worker,
  onNovo,
  onMudou,
  onFechar,
}: {
  motion: ItemMotion;
  worker: boolean | null;
  /** Um ajuste virou um motion novo. */
  onNovo: (m: ItemMotion) => void;
  onMudou: (m: ItemMotion) => void;
  /** Tira o motion do painel. */
  onFechar: () => void;
}) {
  const [pedido, setPedido] = useState("");
  const [enviando, setEnviando] = useState<"ajustar" | "exportar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { largura, altura } = FORMATOS_MOTION[m.formato];
  const andamento = m.status === "na_fila" || m.status === "gerando";
  const gravando = m.render === "na_fila" || m.render === "renderizando";

  /** Põe, troca ou tira a música do MP4 (o MP4 gravado antes deixa de valer). */
  async function trocarMusica(nova: MusicaEscolhida | null) {
    setErro(null);
    const r = await fetch(`/api/motion/${encodeURIComponent(m.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "musica", musica: nova }),
    }).catch(() => null);
    const b = await r?.json().catch(() => ({}));
    if (!r?.ok) return setErro(b?.error ? txErro(b.error) : tx("Sem conexão. Tente de novo."));
    onMudou(b.motion);
  }

  async function agir(acao: "ajustar" | "exportar") {
    setErro(null);
    setEnviando(acao);
    try {
      const r = await fetch(`/api/motion/${encodeURIComponent(m.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "ajustar" ? { acao, pedido } : { acao }),
      });
      const b = await r.json().catch(() => ({}));
      if (acao === "ajustar") avisarCreditos();
      if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
      if (acao === "ajustar") {
        setPedido("");
        onNovo(b.motion);
      } else onMudou(b.motion);
    } catch {
      setErro(tx("Sem conexão. Tente de novo."));
    } finally {
      setEnviando(null);
    }
  }

  const p = m.progresso;
  return (
    <div className="card grid gap-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <div className="text-[14px] font-semibold text-ink line-clamp-2">
            {m.ajuste ? `${tx("Ajuste")}: ${m.ajuste}` : m.brief || m.assunto || tx("Motion")}
          </div>
          <div className="text-[12px] text-ink-dim">
            {nomeDoModelo(m.modelo)} · {nomeDoEsforco(m.esforco)} · {m.formato} · {m.duracao}s
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label={tx("Fechar")}
          title={tx("Fechar")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-ink-mute hover:border-line-strong hover:text-ink cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {andamento ? (
        <div className="grid justify-items-center gap-2 rounded-xl border border-line px-4 py-10 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
          <span className="text-[13px] text-ink">
            {m.status === "na_fila" ? tx("Na fila do worker…") : p ? tx(ETAPA[p.etapa]) : tx("Começando…")}
          </span>
          {p?.etapa === "escrevendo" && p.caracteres ? (
            <span className="text-[12px] tabular-nums text-ink-dim">
              {p.caracteres.toLocaleString("pt-BR")} {tx("caracteres")}
            </span>
          ) : null}
          {worker === false || m.parado ? (
            <span className="max-w-xs text-[12px] text-pink">
              {tx("O worker do Motion não está respondendo. Confira se o serviço está ligado no Railway.")}
            </span>
          ) : (
            <span className="text-[12px] text-ink-dim">{tx("Leva alguns minutos.")}</span>
          )}
        </div>
      ) : m.status === "erro" ? (
        <p className="flex items-start gap-2 rounded-xl border border-line p-4 text-[13px] text-pink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {m.erro ?? tx("A geração falhou.")}
        </p>
      ) : (
        <PlayerMotion id={m.id} largura={largura} altura={altura} duracao={m.duracao} musicaKey={m.musica?.key} />
      )}

      {m.uso ? (
        <div className="text-[12px] text-ink-dim">
          {nomeDoModelo(m.uso.modelo)} · {(m.uso.entrada + m.uso.saida).toLocaleString("pt-BR")} tokens ·{" "}
          <b className="font-semibold text-ink">
            {creditosMotion(m.uso.custo)} {tx("créditos")}
          </b>{" "}
          ·{" "}
          {duracaoTexto(m.uso.segundos)}
          {m.uso.correcoes ? ` · ${tx("1 correção automática")}` : ""}
          {m.uso.revisado ? ` · ${tx("ajustado na revisão dos quadros")}` : ""}
        </div>
      ) : null}

      {m.status === "pronto" ? (
        <>
          <div className="grid gap-2">
            <span className="label-cap">{tx("Ajustar")}</span>
            <Textarea
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={tx("O que mudar. Ex.: texto final maior, fundo mais escuro, produto entrando mais cedo.")}
            />
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => void agir("ajustar")}
              disabled={pedido.trim().length < 3 || !!enviando}
            >
              {enviando === "ajustar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {tx("Ajustar (cria uma versão nova)")}
            </Button>
            <span className="text-[12px] text-ink-dim">
              {tx("Cobra créditos como um motion novo: a estimativa na hora e o acerto pelo custo real quando ficar pronto.")}
            </span>
          </div>

          <div className="grid gap-2 border-t border-line pt-4">
            <span className="label-cap">
              {tx("Música de fundo")}{" "}
              <span className="font-normal normal-case tracking-normal text-ink-dim">· {tx("vai no MP4")}</span>
            </span>
            <EscolherMusica valor={m.musica ?? null} onChange={(nova) => void trocarMusica(nova)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {m.render === "pronto" && m.videoKey ? (
              <a
                href={downloadUrl(m.videoKey, `motion-${m.id}.mp4`)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-bold text-bg hover:bg-ink-mute"
              >
                <Download className="h-4 w-4" />
                {tx("Baixar MP4")}
              </a>
            ) : (
              <Button size="sm" onClick={() => void agir("exportar")} disabled={gravando || !!enviando}>
                {gravando || enviando === "exportar" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Film className="h-3.5 w-3.5" />
                )}
                {gravando
                  ? p?.etapa === "gravando" && p.total
                    ? `${tx("Gravando")} ${Math.round(((p.quadro ?? 0) / p.total) * 100)}%`
                    : p?.etapa === "enviando"
                      ? tx("Guardando o vídeo…")
                      : tx("Na fila para gravar…")
                  : m.render === "erro"
                    ? tx("Gravar de novo")
                    : tx("Exportar MP4")}
              </Button>
            )}
            <a
              href={`/api/motion/${encodeURIComponent(m.id)}/html?modo=arquivo`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-4 text-[13px] font-semibold text-ink hover:border-line-strong"
            >
              <FileCode className="h-4 w-4" />
              {tx("Baixar HTML")}
            </a>
          </div>
          {m.render === "erro" && m.renderErro ? <p className="text-[12px] text-pink">{m.renderErro}</p> : null}
        </>
      ) : null}
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
    </div>
  );
}
