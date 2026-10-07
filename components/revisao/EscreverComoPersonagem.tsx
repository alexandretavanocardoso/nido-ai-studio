"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  MessageCircle,
  PenLine,
  Clapperboard,
} from "lucide-react";
import type { Character } from "@/lib/types";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { copyToClipboard } from "@/lib/export";
import { CREDITOS_TEXTO } from "@/lib/planos";
import type { Plataforma, TipoEscrita } from "@/lib/prompts/escrever";
import { tx } from "@/lib/i18n/tx";
import { useSearchParams } from "next/navigation";

const TIPOS: Array<{
  id: TipoEscrita;
  label: string;
  icon: typeof PenLine;
  placeholder: string;
}> = [
  {
    id: "legenda",
    label: "Legenda",
    icon: PenLine,
    placeholder:
      "Sobre o que é o post? Ex.: provei o pastel mais famoso da feira de domingo",
  },
  {
    id: "roteiro",
    label: "Roteiro de vídeo",
    icon: Clapperboard,
    placeholder:
      "Sobre o que é o vídeo? Ex.: 3 erros que eu cometi no meu primeiro freela",
  },
  {
    id: "resposta",
    label: "Responder comentário",
    icon: MessageCircle,
    placeholder: "Contexto do post (opcional). Ex.: vídeo do look da semana",
  },
];

const PLATAFORMAS: Array<{ id: Plataforma; label: string }> = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube Shorts" },
];

/**
 * Escrever como o personagem: legendas, roteiros e respostas a comentários na
 * voz dele, a partir da ficha (substitui copiar o Prompt Mestre para outra IA).
 */
export function EscreverComoPersonagem({
  character,
}: {
  character: Character;
}) {
  const { conta } = useCreditos();
  const [tipo, setTipo] = useState<TipoEscrita>("legenda");
  const [plataforma, setPlataforma] = useState<Plataforma>("instagram");
  // O Radar manda o assunto pela URL (?tema=…): já chega preenchido.
  const temaInicial = useSearchParams()?.get("tema") ?? "";
  const [tema, setTema] = useState(temaInicial);
  const [comentario, setComentario] = useState("");
  const [opcoes, setOpcoes] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<{ msg: string; code?: string } | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);

  const info = TIPOS.find((t) => t.id === tipo)!;
  const pronto =
    tipo === "resposta"
      ? comentario.trim().length >= 2
      : tema.trim().length >= 3;

  async function escrever() {
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/escrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character,
          tipo,
          plataforma,
          tema,
          comentario: tipo === "resposta" ? comentario : undefined,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        opcoes?: string[];
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !b.opcoes)
        return setErro({
          msg: b.error ?? `Falha (HTTP ${res.status}).`,
          code: b.code,
        });
      setOpcoes(b.opcoes);
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setCarregando(false);
    }
  }

  async function copiar(texto: string, i: number) {
    if (await copyToClipboard(texto)) {
      setCopiado(i);
      setTimeout(() => setCopiado(null), 1500);
    }
  }

  return (
    <section className="grid gap-4">
      <p className="text-[13px] text-ink-mute">
        {tx("Escrevendo como")}{" "}
        <strong className="text-ink">
          {character.identidade.nome || tx("o personagem")}
        </strong>{" "}
        {tx("— com as gírias, o humor e os bordões da ficha.")}
      </p>

      <div className="flex gap-2 flex-wrap">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTipo(t.id);
              setOpcoes([]);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full h-9 px-4 text-[13px] font-bold transition",
              tipo === t.id
                ? "bg-accent text-bg"
                : "bg-panel border border-line text-ink-mute hover:text-ink",
            )}
          >
            <t.icon className="w-3.5 h-3.5" /> {tx(t.label)}
          </button>
        ))}
      </div>

      <div className="flex gap-1 border border-line rounded-full p-1 bg-panel w-fit">
        {PLATAFORMAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlataforma(p.id)}
            className={cn(
              "px-3 h-7 rounded-full text-[11px] font-bold mono transition",
              plataforma === p.id
                ? "bg-accent text-bg"
                : "text-ink-mute hover:text-ink",
            )}
          >
            {tx(p.label)}
          </button>
        ))}
      </div>

      {tipo === "resposta" && (
        <Textarea
          rows={2}
          maxLength={1000}
          placeholder={tx("Cole o comentário do seguidor")}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      )}
      <Textarea
        rows={tipo === "resposta" ? 2 : 3}
        maxLength={1500}
        placeholder={tx(info.placeholder)}
        value={tema}
        onChange={(e) => setTema(e.target.value)}
      />

      <Button
        variant="accent"
        onClick={escrever}
        disabled={!pronto || carregando}
        className="w-fit"
      >
        {carregando ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <info.icon className="w-4 h-4" />
        )}
        {carregando
          ? tx("Escrevendo…")
          : `Escrever${conta ? ` · ${CREDITOS_TEXTO.escrever} créditos` : ""}`}
      </Button>

      {erro ? <ErroGeracao mensagem={erro.msg} code={erro.code} /> : null}

      {opcoes.length > 0 && (
        <div className="grid gap-2">
          {opcoes.map((texto, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-line">
                <span className="text-[11px] text-ink-dim mono uppercase">
                  {opcoes.length > 1
                    ? `${tx("Opção")} ${i + 1}`
                    : tx(info.label)}
                </span>
                <button
                  type="button"
                  onClick={() => copiar(texto, i)}
                  className="text-[12px] text-ink-mute hover:text-ink inline-flex items-center gap-1 font-semibold"
                >
                  {copiado === i ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiado === i ? tx("Copiado") : tx("Copiar")}
                </button>
              </div>
              <p className="p-3.5 text-[13px] text-ink whitespace-pre-wrap leading-relaxed">
                {texto}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
