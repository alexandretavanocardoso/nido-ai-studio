"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import { AlertTriangle, Loader2, RefreshCw, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import { CORES_MARCA, type Marca } from "@/components/revisao/MarcarPessoas";
import { uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";

/** Imagem enviada para entrar no lugar de alguém: a key no armazenamento e a prévia local. */
export interface ImagemEnviada {
  key: string;
  src: string;
}

/**
 * Aviso dos modelos da troca que podem recusar rosto de pessoa real
 * (`recusaRostoReal` em MODELOS_TROCA): aparece ao escolher um deles.
 */
export function AvisoRostoReal() {
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-mute">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-pink" />
      {tx(
        "Este modelo pode recusar vídeos e imagens com rostos de pessoas reais. Se recusar, os créditos voltam. Com pessoas reais, prefira um Kling O3.",
      )}
    </p>
  );
}

/**
 * Marca da Sombra sem personagem: não há personagem, só a imagem enviada
 * (characterId fica vazio; a rota não usa).
 */
export function marcaSemPersonagem(x: number, y: number, t: number): Marca {
  return { id: nanoid(6), x, y, t, characterId: "", imageKey: null };
}

/**
 * Quem entra no lugar: a imagem que a pessoa envia (um rosto, um corpo
 * inteiro, um bicho, um objeto). Clique para enviar ou trocar.
 */
export function QuemEntra({
  valor,
  onChange,
  numero,
  textos,
}: {
  valor: ImagemEnviada | null;
  onChange: (v: ImagemEnviada) => void;
  /** Número da pessoa marcada (pinta a borda com a cor da marca). */
  numero?: number;
  /** Outros textos (o cartão também serve para a foto de um produto). */
  textos?: { enviada: string; enviar: string; dica: string };
}) {
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cor = numero ? CORES_MARCA[numero - 1] : undefined;

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    const regras = STORAGE_KINDS.refs;
    if (!(regras.types as readonly string[]).includes(arquivo.type))
      return setErro(tx("Envie uma imagem em JPG, PNG ou WebP."));
    if (arquivo.size > regras.maxBytes)
      return setErro(tx("A imagem passa de 10 MB."));
    setErro(null);
    setEnviando(0);
    try {
      const key = await uploadFile(arquivo, "refs", (p) => setEnviando(p));
      onChange({ key, src: URL.createObjectURL(arquivo) });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="grid gap-1.5">
      <label
        className={cn(
          "group relative flex cursor-pointer items-center gap-3 rounded-xl border bg-bg p-2 transition hover:border-line-strong",
          valor ? "border-line" : "border-dashed border-line-strong",
        )}
        style={cor ? { borderColor: `${cor}80` } : undefined}
      >
        <span className="relative grid h-20 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-panel text-ink-mute">
          {enviando !== null ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : valor ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={valor.src}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Upload className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">
            {enviando !== null
              ? `${tx("Enviando…")} ${Math.round(enviando * 100)}%`
              : valor
                ? tx(textos?.enviada ?? "Imagem de quem entra")
                : tx(textos?.enviar ?? "Enviar a imagem de quem entra")}
          </span>
          <span className="block text-[11.5px] text-ink-dim">
            {valor
              ? tx("Clique para trocar a imagem.")
              : tx(
                  textos?.dica ??
                    "Rosto nítido, de frente. De corpo inteiro funciona melhor.",
                )}
          </span>
        </span>
        {valor && enviando === null ? (
          <RefreshCw className="h-4 w-4 shrink-0 text-ink-mute group-hover:text-ink" />
        ) : null}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={enviando !== null}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            // Limpa o campo: escolher o mesmo arquivo de novo tem que enviar de novo.
            e.target.value = "";
            void enviar(arquivo);
          }}
        />
      </label>
      {erro ? <p className="text-[12px] text-pink">{erro}</p> : null}
    </div>
  );
}

/** Cartão de uma pessoa marcada: o número na cor da marca e quem entra no lugar dela. */
export function PessoaMarcada({
  numero,
  valor,
  onChange,
}: {
  numero: number;
  valor: ImagemEnviada | null;
  onChange: (v: ImagemEnviada) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
        <span
          className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-bg"
          style={{ background: CORES_MARCA[numero - 1] }}
        >
          {numero}
        </span>
        {tx("Pessoa")} {numero} {tx("vira")}
      </div>
      <QuemEntra numero={numero} valor={valor} onChange={onChange} />
    </div>
  );
}

/** Escolha entre duas ou mais opções em cartões (roupa, motor…). */
export function Opcoes<T extends string>({
  titulo,
  opcoes,
  valor,
  onChange,
}: {
  titulo: string;
  opcoes: ReadonlyArray<readonly [T, string, string]>;
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-ink">{titulo}</div>
      <div className="grid grid-cols-2 gap-2">
        {opcoes.map(([id, rotulo, nota]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={valor === id}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition",
              valor === id
                ? "border-accent bg-accent/10"
                : "border-line hover:border-line-strong",
            )}
          >
            <div className="text-[13px] font-bold text-ink">{rotulo}</div>
            <div className="text-[11px] text-ink-dim">{nota}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Área para enviar a foto ou o vídeo de origem (clique ou arraste). */
export function EnviarOrigem({
  titulo,
  texto,
  accept,
  enviando,
  onArquivo,
  icone,
}: {
  titulo: string;
  texto: string;
  accept: string;
  enviando: number | null;
  onArquivo: (f: File) => void;
  icone: React.ReactNode;
}) {
  return (
    <label
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f && enviando === null) onArquivo(f);
      }}
      className={cn(
        "grid cursor-pointer justify-items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-panel px-6 py-14 text-center transition hover:border-accent/60",
        enviando !== null && "pointer-events-none",
      )}
    >
      {enviando !== null ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <span className="text-[13px] text-ink-mute">
            {tx("Enviando…")} {Math.round(enviando * 100)}%
          </span>
        </>
      ) : (
        <>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
            {icone}
          </span>
          <span className="text-[15px] font-semibold text-ink">{titulo}</span>
          <span className="max-w-md text-[13px] text-ink-mute">{texto}</span>
        </>
      )}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onArquivo(f);
        }}
      />
    </label>
  );
}
