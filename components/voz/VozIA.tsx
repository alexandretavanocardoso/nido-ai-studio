"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import { AudioLines, Loader2, Lock, Mic, Upload, Wand2, X } from "lucide-react";
import type { Character } from "@/lib/types";
import { useCharacters } from "@/lib/store";
import { useDuravel } from "@/lib/duravel";
import { fileUrl, uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";
import { useRecursos } from "@/components/RecursosProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { DECLARACAO_VOZ } from "@/lib/declaracoes";
import { bloqueioVoz, CREDITOS_CRIAR_VOZ, creditosFala } from "@/lib/planos";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

interface Voz {
  voiceId: string;
  nome: string;
  origem: "design" | "clone";
  descricao: string | null;
  amostraKey: string | null;
}

/** Descrição inicial (em português, a ElevenLabs entende) a partir dos campos da ficha. */
export function descricaoInicial(c: Character): string {
  const v = c.voz;
  return [
    v.vozGenero ||
      (c.identidade.genero === "masculino"
        ? "Voz masculina"
        : c.identidade.genero === "feminino"
          ? "Voz feminina"
          : "Voz"),
    c.identidade.idadeAparente ? `de ${c.identidade.idadeAparente}` : "",
    v.vozTimbre ? `timbre ${v.vozTimbre}` : "",
    v.vozRitmo ? `ritmo ${v.vozRitmo}` : "",
    c.identidade.sotaque
      ? `sotaque ${c.identidade.sotaque}`
      : "sotaque brasileiro",
    "tom de criador de conteúdo",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Voz do personagem (ElevenLabs): criar uma voz sintética pela descrição ou
 * clonar de amostras (com declaração obrigatória), ouvir e gerar falas.
 * As falas ficam na ficha (`audios`) e podem ir pros vídeos ("Adicionar fala").
 */
export function VozIA({ character }: { character: Character }) {
  const recursos = useRecursos();
  const { user } = useAuth();
  const { conta } = useCreditos();
  const update = useCharacters((s) => s.update);
  const inputRef = useRef<HTMLInputElement>(null);

  const [vozes, setVozes] = useState<Voz[]>([]);
  const [modo, setModo] = useState<"design" | "clone">("design");
  const [descricao, setDescricao] = useState(() => descricaoInicial(character));
  const [amostras, setAmostras] = useDuravel<
    Array<{ key: string; nome: string }>
  >(`voz:${character.id}:amostras`, []);
  const [aceito, setAceito] = useState(false);
  const [texto, setTexto] = useState(
    () => character.voz.abertura || character.voz.bordoes[0] || "",
  );
  const [ocupado, setOcupado] = useDuravel<"criar" | "falar" | "upload" | null>(
    `voz:${character.id}:ocupado`,
    null,
    (o) =>
      o === "criar"
        ? "Criando a voz"
        : o === "falar"
          ? "Gerando fala"
          : "Enviando amostra de voz",
  );
  const [erro, setErro] = useDuravel<{ msg: string; code?: string } | null>(
    `voz:${character.id}:erro`,
    null,
  );

  const ativo = recursos.voz && recursos.armazenamento && !!user;
  const voz = vozes[0];
  const audios = character.audios ?? [];
  const bloqueio = conta ? bloqueioVoz(conta.plano) : null;

  const carregar = useCallback(() => {
    if (!ativo) return;
    fetch(`/api/voz/${encodeURIComponent(character.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { vozes: Voz[] } | null) => b && setVozes(b.vozes))
      .catch(() => {});
  }, [ativo, character.id]);
  useEffect(() => carregar(), [carregar]);

  if (!ativo) return null;

  async function enviarAmostra(file: File | undefined) {
    if (!file) return;
    if (!(STORAGE_KINDS.audios.types as readonly string[]).includes(file.type))
      return setErro({
        msg: "Formato não aceito. Use MP3, WAV, M4A, WebM ou OGG.",
      });
    setErro(null);
    setOcupado("upload");
    try {
      const key = await uploadFile(file, "audios");
      setAmostras((a) => [...a, { key, nome: file.name }].slice(0, 3));
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  async function criar() {
    setErro(null);
    setOcupado("criar");
    try {
      const res = await fetch("/api/voz/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          modo,
          descricao: modo === "design" ? descricao : undefined,
          amostraKeys:
            modo === "clone" ? amostras.map((a) => a.key) : undefined,
          consentimento: modo === "clone" ? aceito : undefined,
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
      setAmostras([]);
      setAceito(false);
      carregar();
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  async function gerarFala() {
    if (!voz || texto.trim().length < 2) return;
    setErro(null);
    setOcupado("falar");
    try {
      const res = await fetch("/api/voz/falar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          voiceId: voz.voiceId,
          texto,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        key?: string;
        size?: number;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !b.key)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
        });
      update(character.id, (c) => {
        c.audios = [
          {
            id: nanoid(8),
            key: b.key!,
            texto: texto.trim(),
            size: b.size ?? 0,
            createdAt: Date.now(),
          },
          ...(c.audios ?? []),
        ].slice(0, 50);
      });
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="rounded-xl border border-accent/25 bg-accent/5 p-4 grid gap-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-accent/15 text-accent shrink-0">
          <AudioLines className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <span className="label-cap !text-accent">
            {tx("Voz do personagem (IA)")}
          </span>
          <p className="text-[13px] text-ink-mute mt-1 leading-relaxed">
            {tx(
              "Uma voz fixa para o personagem falar em português nos vídeos — criada pela descrição ou clonada de uma amostra.",
            )}
          </p>
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
          {voz && (
            <div className="rounded-xl border border-line bg-panel px-3.5 py-3 grid gap-2">
              <div className="text-[12px] text-ink">
                <strong>{tx("Voz atual")}</strong> ·{" "}
                {voz.origem === "design"
                  ? tx("criada pela descrição")
                  : "clonada"}
                {voz.descricao ? (
                  <span className="text-ink-dim"> · {voz.descricao}</span>
                ) : null}
              </div>
              {voz.amostraKey && (
                <audio
                  src={fileUrl(voz.amostraKey)}
                  controls
                  preload="none"
                  className="w-full h-8"
                />
              )}
            </div>
          )}

          <details
            className="rounded-xl border border-line bg-panel px-3.5 py-3"
            open={!voz}
          >
            <summary className="text-[12px] font-semibold text-ink cursor-pointer">
              {voz ? tx("Criar outra voz") : tx("Criar a voz")}
            </summary>
            <div className="grid gap-3 mt-3">
              <div className="flex gap-1 border border-line rounded-full p-1 bg-bg w-fit">
                {(
                  [
                    ["design", tx("Pela descrição"), Wand2],
                    ["clone", tx("Clonar amostra"), Mic],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setModo(id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-[11px] font-bold mono transition",
                      modo === id
                        ? "bg-accent text-bg"
                        : "text-ink-mute hover:text-ink",
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>

              {modo === "design" ? (
                <div>
                  <Textarea
                    rows={2}
                    maxLength={1000}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                  <p className="text-[11px] text-ink-dim mt-1">
                    {tx(
                      "Voz 100% sintética, montada a partir da ficha. Ajuste à vontade (idade, energia, sotaque…).",
                    )}
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  <input
                    ref={inputRef}
                    type="file"
                    accept={STORAGE_KINDS.audios.types.join(",")}
                    className="sr-only"
                    onChange={(e) => {
                      enviarAmostra(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex gap-2 flex-wrap items-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => inputRef.current?.click()}
                      disabled={!!ocupado || amostras.length >= 3}
                    >
                      {ocupado === "upload" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      {tx("Enviar amostra (")}
                      {amostras.length}/3)
                    </Button>
                    {amostras.map((a) => (
                      <span
                        key={a.key}
                        className="inline-flex items-center gap-1 text-[11px] text-ink-mute border border-line rounded-full px-2 h-7"
                      >
                        {a.nome}
                        <button
                          type="button"
                          onClick={() =>
                            setAmostras((x) => x.filter((y) => y.key !== a.key))
                          }
                          aria-label={tx("Remover")}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-dim">
                    {tx("1 a 2 minutos de fala limpa, sem música de fundo.")}
                  </p>
                  <label className="flex items-start gap-2.5 text-[13px] text-ink cursor-pointer rounded-xl border border-line bg-bg px-3.5 py-3">
                    <input
                      type="checkbox"
                      checked={aceito}
                      onChange={(e) => setAceito(e.target.checked)}
                      className="accent-accent h-4 w-4 mt-0.5 shrink-0"
                    />
                    <span>
                      {DECLARACAO_VOZ}{" "}
                      <span className="text-ink-dim">
                        {tx("(obrigatório — fica registrado na sua conta)")}
                      </span>
                    </span>
                  </label>
                </div>
              )}

              <Button
                size="sm"
                variant="accent"
                onClick={criar}
                disabled={
                  !!ocupado ||
                  (modo === "clone" && (!amostras.length || !aceito)) ||
                  (modo === "design" && descricao.trim().length < 5)
                }
                className="w-fit"
              >
                {ocupado === "criar" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                {ocupado === "criar"
                  ? tx("Criando a voz…")
                  : `Criar voz · ${CREDITOS_CRIAR_VOZ} créditos`}
              </Button>
            </div>
          </details>

          {voz && (
            <div className="grid gap-2">
              <div className="text-[12px] font-semibold text-ink">
                {tx("Gerar fala")}
              </div>
              <Textarea
                rows={3}
                maxLength={1500}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={tx("O que o personagem vai falar…")}
              />
              <Button
                size="sm"
                variant="accent"
                onClick={gerarFala}
                disabled={!!ocupado || texto.trim().length < 2}
                className="w-fit"
              >
                {ocupado === "falar" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
                {ocupado === "falar"
                  ? tx("Gerando…")
                  : `Gerar fala · ${creditosFala(texto.trim().length)} créditos`}
              </Button>
            </div>
          )}

          {audios.length > 0 && (
            <div className="grid gap-2">
              <div className="text-[11px] text-ink-dim">
                {tx("Falas ·")} {audios.length}{" "}
                {tx('(use em "Adicionar fala" nos vídeos)')}
              </div>
              {audios.slice(0, 8).map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-line bg-panel px-3 py-2 grid gap-1"
                >
                  <div className="text-[12px] text-ink-mute line-clamp-2">
                    {a.texto}
                  </div>
                  <audio
                    src={fileUrl(a.key)}
                    controls
                    preload="none"
                    className="w-full h-8"
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {erro ? <ErroGeracao mensagem={erro.msg} code={erro.code} /> : null}
    </section>
  );
}
