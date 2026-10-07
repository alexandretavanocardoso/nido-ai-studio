"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Character } from "@/lib/types";
import {
  custoCriar,
  MODELOS_CRIAR,
  type ModeloCriar,
} from "@/lib/video/precos";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { bloqueioCriarVideo, creditosCriarVideo } from "@/lib/planos";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import { tx } from "@/lib/i18n/tx";

interface Props {
  character: Character;
  onClose: () => void;
  onEnviado: (job: {
    jobId: string;
    duracao: number;
    modelo: ModeloCriar;
  }) => void;
}

/** Texto inicial: a primeira ideia de conteúdo da ficha, se houver. */
function cenaInicial(c: Character): string {
  const ideia = c.nicho.ideiasConteudo[0];
  const nome = c.identidade.nome || "O personagem";
  if (!ideia) return "";
  return `${nome} — ${ideia.titulo}${ideia.descricao ? `. ${ideia.descricao}` : ""}`.slice(
    0,
    1000,
  );
}

/**
 * Cria um vídeo novo do personagem pelo Runway: imagem como primeiro quadro +
 * texto. Com persona treinada, use uma imagem gerada com ela (rosto idêntico).
 */
export function CriarVideoModal({ character, onClose, onEnviado }: Props) {
  const opcoes = useImagensPersonagem(character);
  const disponiveis = Object.keys(MODELOS_CRIAR) as ModeloCriar[];
  const [imagem, setImagem] = useState<string | null>(opcoes[0]?.key ?? null);
  const [modelo, setModelo] = useState<ModeloCriar>("gen4.5");
  const [duracao, setDuracao] = useState<number>(5);
  const [vertical, setVertical] = useState(true);
  const [audio, setAudio] = useState(false);
  const [texto, setTexto] = useState(() => cenaInicial(character));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const m = MODELOS_CRIAR[modelo];
  const { conta } = useCreditos();
  const [erroCode, setErroCode] = useState<string | null>(null);
  const comAudio = m.audio && audio;

  function escolherModelo(id: ModeloCriar) {
    setModelo(id);
    const duracoes = MODELOS_CRIAR[id].duracoes as readonly number[];
    if (!duracoes.includes(duracao)) setDuracao(duracoes[0]);
  }

  async function enviar() {
    if (!imagem) return setErro("Escolha a imagem do personagem.");
    if (texto.trim().length < 3) return setErro("Descreva a cena.");
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/videos/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          imageKey: imagem,
          modelo,
          promptText: texto,
          duracao,
          vertical,
          audio: comAudio,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !body.jobId) {
        setErroCode(body.code ?? null);
        return setErro(body.error ?? `Falha ao enviar (HTTP ${res.status}).`);
      }
      onEnviado({ jobId: body.jobId, duracao, modelo });
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
      <div className="card w-full max-w-2xl p-5 sm:p-6 relative max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          disabled={enviando}
          className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="display text-xl text-ink uppercase mb-1">
          {tx("Criar vídeo do personagem")}
        </h2>
        <p className="text-[13px] text-ink-mute mb-4">
          {tx(
            "A imagem vira o primeiro quadro e o texto descreve o que acontece. Gera clipes curtos (até 10s) — para vídeos maiores, gere várias cenas.",
          )}
        </p>

        <div className="text-[12px] font-semibold text-ink mb-2">
          {tx("Imagem do personagem")}
        </div>
        <EscolherImagemPersonagem
          opcoes={opcoes}
          valor={imagem}
          onChange={setImagem}
          dica={tx(
            "A imagem é o ponto de partida da cena: use um retrato no cenário/enquadramento que você quer. Com persona treinada, gere essa imagem com “Persona treinada” — o rosto sai idêntico.",
          )}
        />

        <div className="text-[12px] font-semibold text-ink mb-2">
          {tx("Cena")}
        </div>
        <Textarea
          rows={4}
          maxLength={1000}
          placeholder={tx(
            "Ex.: Lila caminha pela feira de domingo, para numa barraca de pastel, morde e faz uma careta de satisfação olhando pra câmera. Câmera na mão, luz de fim de tarde.",
          )}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <p className="text-[11px] text-ink-dim mt-1 mb-4">
          {tx(
            "Descreva ação, câmera e luz. Inglês costuma funcionar um pouco melhor, mas português é aceito.",
          )}
        </p>

        <div className="text-[12px] font-semibold text-ink mb-2">
          {tx("Modelo")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {disponiveis.map((id) => {
            const mm = MODELOS_CRIAR[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => escolherModelo(id)}
                className={cn(
                  "rounded-xl border px-3.5 py-2.5 text-left transition",
                  modelo === id
                    ? "border-accent bg-accent/10"
                    : "border-line hover:border-line-strong",
                )}
              >
                <div className="text-[13px] font-bold text-ink">{mm.label}</div>
                <div className="text-[11px] text-ink-dim">
                  {mm.nota} {tx("· US$")} {mm.porSegundo.toFixed(2)}/s
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-4 flex-wrap items-center mb-2">
          <div className="flex gap-1 border border-line rounded-full p-1 bg-panel w-fit">
            {(m.duracoes as readonly number[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuracao(d)}
                className={cn(
                  "px-3 h-7 rounded-full text-[11px] font-bold mono transition",
                  duracao === d
                    ? "bg-accent text-bg"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                {d}s
              </button>
            ))}
          </div>
          <div className="flex gap-1 border border-line rounded-full p-1 bg-panel w-fit">
            {(
              [
                [true, "Vertical 9:16"],
                [false, "Horizontal 16:9"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setVertical(v)}
                className={cn(
                  "px-3 h-7 rounded-full text-[11px] font-bold mono transition",
                  vertical === v
                    ? "bg-accent text-bg"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {m.audio && (
            <label className="inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={audio}
                onChange={(e) => setAudio(e.target.checked)}
                className="accent-accent h-4 w-4"
              />
              {tx("Com áudio")}
            </label>
          )}
        </div>
        <div className="text-[13px] text-ink mb-4">
          {tx("Custo:")}{" "}
          <strong>
            {conta
              ? `${creditosCriarVideo(modelo, duracao, comAudio)} créditos`
              : `~US$ ${custoCriar(modelo, duracao, comAudio).toFixed(2)}`}
          </strong>
          <span className="text-[11px] text-ink-dim">
            {" "}
            {tx("· cobrança real no painel do Runway")}
          </span>
        </div>

        {conta && bloqueioCriarVideo(conta.plano, modelo, comAudio) ? (
          <div className="mb-4">
            <ErroGeracao
              mensagem={bloqueioCriarVideo(conta.plano, modelo, comAudio)!}
              code="PLANO"
            />
          </div>
        ) : null}
        {erro ? (
          <div className="mb-4">
            <ErroGeracao mensagem={erro} code={erroCode} />
          </div>
        ) : null}

        <Button
          variant="accent"
          onClick={enviar}
          disabled={
            enviando ||
            !imagem ||
            (!!conta && !!bloqueioCriarVideo(conta.plano, modelo, comAudio))
          }
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {enviando ? tx("Enviando…") : tx("Criar vídeo")}
        </Button>
      </div>
    </div>
  );
}
