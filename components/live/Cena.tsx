"use client";

import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import type { CenaLive } from "@/lib/live/tipos";
import { CREDITOS_CENARIO } from "@/lib/planos";
import { fileUrl, uploadFile } from "@/lib/storage/client";

type Modo = "fundo" | "texto" | "imagem";

const modoDe = (c: CenaLive | null): Modo => (!c ? "fundo" : "prompt" in c ? "texto" : "imagem");

/** Ideias rápidas de cenário (preenchem o texto). */
const SUGESTOES = [
  "numa praia ao pôr do sol",
  "num estúdio de podcast com luz neon",
  "numa cafeteria aconchegante",
  "num quarto gamer com luzes RGB",
  "numa cidade à noite, com luzes desfocadas",
];

/**
 * Onde a live acontece: o fundo da própria foto, um lugar descrito em texto ou
 * uma imagem do lugar. Devolve `null` enquanto não há cenário válido (fica o
 * fundo da foto).
 */
export function EscolherCena({
  valor,
  onChange,
}: {
  valor: CenaLive | null;
  onChange: (c: CenaLive | null) => void;
}) {
  const [modo, setModo] = useState<Modo>(modoDe(valor));
  const [texto, setTexto] = useState(valor && "prompt" in valor ? valor.prompt : "");
  const [imagem, setImagem] = useState(valor && "imageKey" in valor ? valor.imageKey : "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Persona salva escolhida: o cenário dela vem de fora.
  useEffect(() => {
    if (!valor) return;
    setModo(modoDe(valor));
    if ("prompt" in valor) setTexto(valor.prompt);
    else setImagem(valor.imageKey);
  }, [valor]);

  function escolherModo(m: Modo) {
    setModo(m);
    setErro(null);
    if (m === "fundo") onChange(null);
    if (m === "texto") onChange(texto.trim().length >= 3 ? { prompt: texto.trim() } : null);
    if (m === "imagem") onChange(imagem ? { imageKey: imagem } : null);
  }

  function escrever(t: string) {
    setTexto(t);
    onChange(t.trim().length >= 3 ? { prompt: t.trim() } : null);
  }

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(true);
    try {
      const key = await uploadFile(arquivo, "refs");
      setImagem(key);
      onChange({ imageKey: key });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-2">
      <span className="label-cap">{tx("Cenário")}</span>
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["fundo", "Fundo da foto"],
            ["texto", "Descrever"],
            ["imagem", "Enviar imagem"],
          ] as const
        ).map(([m, rotulo]) => (
          <button
            key={m}
            type="button"
            onClick={() => escolherModo(m)}
            className={cn(
              "h-8 truncate rounded-full border px-2 text-[12px] font-semibold transition cursor-pointer",
              m === modo ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-mute hover:text-ink",
            )}
          >
            {tx(rotulo)}
          </button>
        ))}
      </div>

      {modo === "texto" ? (
        <>
          <Input
            value={texto}
            onChange={(e) => escrever(e.target.value)}
            maxLength={400}
            placeholder={tx("Ex.: numa praia ao pôr do sol")}
          />
          <div className="flex flex-wrap gap-1.5">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => escrever(tx(s))}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-mute hover:border-line-strong hover:text-ink cursor-pointer"
              >
                {tx(s)}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {modo === "imagem" ? (
        <label
          className={cn(
            "relative grid aspect-video w-full cursor-pointer place-items-center overflow-hidden rounded-xl border transition",
            imagem ? "border-line" : "border-dashed border-line-strong hover:border-accent hover:bg-accent/5",
          )}
        >
          {imagem ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(imagem)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">
                {enviando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {tx("Trocar")}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-mute">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {tx("Imagem do lugar")}
            </span>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={enviando}
            onChange={(e) => void enviar(e.target.files?.[0])}
          />
        </label>
      ) : null}

      {modo !== "fundo" ? (
        <span className="text-[12px] text-ink-dim">
          {tx("A pessoa é colocada no cenário antes de virar o avatar:")} {CREDITOS_CENARIO} {tx("créditos ao preparar (de graça se repetir a mesma foto e o mesmo cenário).")}
        </span>
      ) : null}
      {erro ? <span className="text-[12px] text-pink">{erro}</span> : null}
    </div>
  );
}
