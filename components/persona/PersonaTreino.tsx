"use client";

import { useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import {
  Brain,
  Check,
  CheckCircle2,
  Images,
  Loader2,
  Lock,
  Sparkles,
  X,
} from "lucide-react";
import type { Character, ImagemTreino } from "@/lib/types";
import { useCharacters } from "@/lib/store";
import { fileUrl } from "@/lib/storage/client";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { DECLARACAO_TREINO } from "@/lib/declaracoes";
import { usePersona, type StatusAlvo } from "@/lib/persona/usePersona";
import {
  bloqueioPersona,
  CREDITOS_IMAGEM_DATASET,
  CREDITOS_TREINO,
  TREINO_MAX_IMAGENS,
  TREINO_MIN_IMAGENS,
} from "@/lib/planos";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

const QUANTIDADES = [12, 20, 30];

/**
 * Persona treinada: um modelo próprio do personagem (rosto idêntico em toda
 * imagem). Fluxo: montar o conjunto de treino → aprovar/descartar →
 * declaração obrigatória → treinar (Rápido = FLUX.1 LoRA Fast; Pro = FLUX.2).
 * Vídeo com a persona: imagem gerada com ela como primeiro quadro em "Criar vídeo".
 */
export function PersonaTreino({ character }: { character: Character }) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const update = useCharacters((s) => s.update);
  const { ativo, status, treinando, gratisRestantes, recarregar } = usePersona(
    character.id,
  );
  const opcoes = useImagensPersonagem(character);

  const [referencia, setReferencia] = useState<string | null>(
    opcoes[0]?.key ?? null,
  );
  const [quantidade, setQuantidade] = useState(20);
  const [treinador, setTreinador] = useState<"rapido" | "pro">("rapido");
  const [aceito, setAceito] = useState(false);
  const [ocupado, setOcupado] = useState<"dataset" | "treino" | null>(null);
  const [erro, setErro] = useState<{ msg: string; code?: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!ativo) return null;

  const dataset = character.personaDataset ?? [];
  const aprovadas = dataset.filter((d) => d.aprovada);
  const bloqueio = conta ? bloqueioPersona(conta.plano) : null;
  const gratis = treinador === "rapido" && gratisRestantes > 0;
  const custoTreino = gratis ? 0 : CREDITOS_TREINO[treinador];
  const podeTreinar =
    aprovadas.length >= TREINO_MIN_IMAGENS &&
    aprovadas.length <= TREINO_MAX_IMAGENS &&
    aceito &&
    !treinando &&
    !bloqueio;

  function salvarDataset(novo: ImagemTreino[]) {
    update(character.id, (c) => {
      c.personaDataset = novo;
    });
  }

  function adicionarDaGaleria() {
    const ja = new Set(dataset.map((d) => d.key));
    const novas = opcoes
      .filter((o) => !ja.has(o.key))
      .map((o) => ({ id: nanoid(8), key: o.key, aprovada: true }));
    salvarDataset([...dataset, ...novas]);
    setAviso(
      novas.length
        ? `${novas.length} imagem(ns) da galeria adicionadas.`
        : "Todas as imagens da galeria já estão no conjunto.",
    );
  }

  async function gerarVariacoes() {
    if (!referencia) return;
    setErro(null);
    setAviso(null);
    setOcupado("dataset");
    try {
      const res = await fetch("/api/persona/dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          referenciaKey: referencia,
          quantidade,
          inicio: dataset.length,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        imagens?: Array<{ id: string; key: string }>;
        falhas?: number;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !b.imagens)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
        });
      salvarDataset([
        ...(useCharacters.getState().get(character.id)?.personaDataset ?? []),
        ...b.imagens.map((i) => ({ ...i, aprovada: true })),
      ]);
      setAviso(
        `${b.imagens.length} variações geradas${b.falhas ? ` (${b.falhas} falharam — créditos devolvidos)` : ""}. Descarte as que fugiram do personagem.`,
      );
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  async function treinar() {
    setErro(null);
    setOcupado("treino");
    try {
      const res = await fetch("/api/persona/treinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          treinador,
          keys: aprovadas.map((a) => a.key),
          consentimento: aceito,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
        });
      setAceito(false);
      recarregar();
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="rounded-xl border border-accent/25 bg-accent/5 p-4 grid gap-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-accent/15 text-accent shrink-0">
          <Brain className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <span className="label-cap !text-accent">
            {tx("Persona treinada")}
          </span>
          <p className="text-[13px] text-ink-mute mt-1 leading-relaxed">
            {tx(
              "Um modelo próprio do personagem: o rosto sai idêntico em toda imagem, sem depender de referência. Para vídeo, gere a imagem com a persona e use-a em “Criar vídeo”.",
            )}
          </p>
          <div className="flex gap-3 flex-wrap mt-2">
            <StatusTreino s={status ?? undefined} />
          </div>
        </div>
      </div>

      {bloqueio ? (
        <div className="text-[13px] text-ink-mute">
          <Lock className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
          {bloqueio}{" "}
          <Link
            href="/app/planos"
            className="text-accent font-semibold hover:underline"
          >
            {tx("Ver planos")}
          </Link>
        </div>
      ) : (
        <>
          {/* 1. Conjunto de treino */}
          <div className="grid gap-3">
            <div className="text-[12px] font-semibold text-ink">
              {tx("1. Conjunto de treino")}{" "}
              <span className="font-normal text-ink-dim">
                · {aprovadas.length} {tx("aprovadas (mín.")}{" "}
                {TREINO_MIN_IMAGENS}
                {tx(", ideal 15–30)")}
              </span>
            </div>
            {(recursos.gemini || recursos.fal) && (
              <div className="rounded-xl border border-line bg-panel p-3 grid gap-2">
                <div className="text-[12px] text-ink-mute">
                  {tx(
                    "Gerar variações (ângulos, expressões, luzes) a partir de:",
                  )}
                </div>
                <EscolherImagemPersonagem
                  opcoes={opcoes}
                  valor={referencia}
                  onChange={setReferencia}
                  dica={tx(
                    "Use o card de referência ou um retrato aprovado — as variações saem fiéis a ele.",
                  )}
                />
                <div className="flex gap-2 flex-wrap items-center">
                  <div className="flex gap-1 border border-line rounded-full p-1 bg-bg">
                    {QUANTIDADES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuantidade(q)}
                        className={cn(
                          "px-3 h-7 rounded-full text-[11px] font-bold mono transition",
                          quantidade === q
                            ? "bg-accent text-bg"
                            : "text-ink-mute hover:text-ink",
                        )}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="accent"
                    onClick={gerarVariacoes}
                    disabled={!referencia || !!ocupado}
                  >
                    {ocupado === "dataset" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {ocupado === "dataset"
                      ? tx("Gerando… (1 a 3 min)")
                      : `Gerar ${quantidade} variações · ${quantidade * CREDITOS_IMAGEM_DATASET} créditos`}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={adicionarDaGaleria}
                    disabled={!!ocupado}
                  >
                    <Images className="w-3.5 h-3.5" />{" "}
                    {tx("Usar imagens da galeria")}
                  </Button>
                </div>
              </div>
            )}

            {dataset.length > 0 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {dataset.map((d) => (
                  <div key={d.id} className="relative group">
                    <button
                      type="button"
                      onClick={() =>
                        salvarDataset(
                          dataset.map((x) =>
                            x.id === d.id ? { ...x, aprovada: !x.aprovada } : x,
                          ),
                        )
                      }
                      title={
                        d.aprovada
                          ? tx("Aprovada — clique para descartar")
                          : tx("Descartada — clique para aprovar")
                      }
                      className={cn(
                        "relative block w-full aspect-[3/4] rounded-lg overflow-hidden border-2 transition",
                        d.aprovada
                          ? "border-accent"
                          : "border-line opacity-40 grayscale",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fileUrl(d.key)}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {d.aprovada && (
                        <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-accent text-bg inline-flex items-center justify-center">
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        salvarDataset(dataset.filter((x) => x.id !== d.id))
                      }
                      className="absolute bottom-1 right-1 h-5 w-5 inline-flex items-center justify-center rounded bg-black/60 text-white opacity-0 group-hover:opacity-100"
                      aria-label={tx("Remover do conjunto")}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {dataset.length > 0 && (
              <p className="text-[11px] text-ink-dim">
                {tx(
                  "Clique para aprovar/descartar. Descarte as que fugiram do rosto, do cabelo ou da roupa do personagem — o treino aprende exatamente o que você aprovar.",
                )}
              </p>
            )}
          </div>

          {/* 2. Treinar */}
          <div className="grid gap-3">
            <div className="text-[12px] font-semibold text-ink">
              {tx("2. Treinar")}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {(
                [
                  [
                    "rapido",
                    "Rápido",
                    `${gratisRestantes > 0 ? "Grátis este mês (incluso no plano)" : `${CREDITOS_TREINO.rapido} créditos`} · FLUX.1 · ~5 min`,
                  ],
                  [
                    "pro",
                    "Pro",
                    `${CREDITOS_TREINO.pro} créditos · FLUX.2 · mais detalhe, aceita referências`,
                  ],
                ] as const
              ).map(([id, titulo, sub]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTreinador(id)}
                  className={cn(
                    "rounded-xl border px-3.5 py-2.5 text-left transition",
                    treinador === id
                      ? "border-accent bg-accent/10"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <div className="text-[13px] font-bold text-ink">{titulo}</div>
                  <div className="text-[11px] text-ink-dim">{sub}</div>
                </button>
              ))}
            </div>

            <label className="flex items-start gap-2.5 text-[13px] text-ink cursor-pointer rounded-xl border border-line bg-panel px-3.5 py-3">
              <input
                type="checkbox"
                checked={aceito}
                onChange={(e) => setAceito(e.target.checked)}
                className="accent-accent h-4 w-4 mt-0.5 shrink-0"
              />
              <span>
                {DECLARACAO_TREINO}{" "}
                <span className="text-ink-dim">
                  {tx(
                    "(obrigatório — a declaração fica registrada na sua conta)",
                  )}
                </span>
              </span>
            </label>

            <Button
              variant="accent"
              onClick={treinar}
              disabled={!podeTreinar || !!ocupado}
              className="w-fit"
            >
              {ocupado === "treino" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Brain className="w-4 h-4" />
              )}
              {ocupado === "treino"
                ? tx("Enviando para o treino…")
                : treinando
                  ? tx("Treinando… (aguarde terminar)")
                  : `${status ? tx("Treinar de novo") : tx("Treinar persona")} · ${gratis ? "grátis" : `${custoTreino} créditos`}`}
            </Button>
            {aprovadas.length < TREINO_MIN_IMAGENS && (
              <p className="text-[11px] text-ink-dim">
                {tx("Faltam")} {TREINO_MIN_IMAGENS - aprovadas.length}{" "}
                {tx("imagem(ns) aprovada(s) para treinar.")}
              </p>
            )}
          </div>
        </>
      )}

      {aviso ? <p className="text-[12px] text-ink-mute">{aviso}</p> : null}
      {erro ? <ErroGeracao mensagem={erro.msg} code={erro.code} /> : null}
    </section>
  );
}

function StatusTreino({ s }: { s?: StatusAlvo }) {
  if (!s)
    return (
      <span className="text-[11px] text-ink-dim">
        {tx("Ainda não treinada")}
      </span>
    );
  const rotulo = s.treinador === "pro" ? "Persona Pro" : "Persona Rápida";
  if (s.status === "treinando")
    return (
      <span className="text-[11px] text-ink-mute inline-flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> {rotulo}
        {tx(": treinando (")}
        {s.imagens} {tx("imagens, ~5–20 min)")}
      </span>
    );
  if (s.status === "erro")
    return (
      <span className="text-[11px] text-pink" title={txErro(s.erro ?? "")}>
        {rotulo}
        {tx(": falhou")}{" "}
        {s.temPronto
          ? tx("(a versão anterior continua valendo)")
          : tx("— créditos devolvidos")}
      </span>
    );
  return (
    <span className="text-[11px] text-ok inline-flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3" /> {rotulo}
      {tx(": pronta · gatilho")} <code className="mono">{s.gatilho}</code>
    </span>
  );
}
