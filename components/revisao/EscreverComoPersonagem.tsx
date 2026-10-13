"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Trash2,
  MessageCircle,
  PenLine,
  Clapperboard,
} from "lucide-react";
import { nanoid } from "nanoid";
import type { Character, TextoEscrito } from "@/lib/types";
import { useCharacters } from "@/lib/store";
import { confirmar } from "@/components/ui/Confirmacao";
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
import { useDuravel } from "@/lib/duravel";
import { useSearchParams } from "next/navigation";
import { txErro } from "@/lib/i18n/erros";

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

/** Quantos textos ficam guardados por personagem (os mais antigos saem). */
const MAX_TEXTOS = 30;

/**
 * Escrever como o personagem: legendas, roteiros e respostas a comentários na
 * voz dele, a partir da ficha (substitui copiar o Prompt Mestre para outra IA).
 * Tudo que é escrito fica salvo no personagem (e na conta), em "Textos salvos".
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
  const atualizar = useCharacters((s) => s.update);
  const salvos = character.textos ?? [];
  /** Texto salvo que está aberto na lista (o recém-escrito abre sozinho). */
  const [aberto, setAberto] = useState<string | null>(salvos[0]?.id ?? null);
  const [carregando, setCarregando] = useDuravel<boolean>(
    `escrever:${character.id}:carregando`,
    false,
    "Escrevendo texto",
  );
  const [erro, setErro] = useDuravel<{ msg: string; code?: string } | null>(
    `escrever:${character.id}:erro`,
    null,
  );
  const [copiado, setCopiado] = useState<string | null>(null);

  async function excluir(t: TextoEscrito) {
    const ok = await confirmar({
      titulo: tx("Excluir este texto?"),
      mensagem: tx("Ele sai da lista de textos salvos. Não dá para desfazer."),
      confirmar: tx("Excluir"),
      tom: "perigo",
    });
    if (!ok) return;
    atualizar(character.id, (c) => {
      c.textos = (c.textos ?? []).filter((x) => x.id !== t.id);
    });
  }

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
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
        });
      // Salva na hora, no personagem: não se perde ao recarregar nem em outro aparelho.
      const novo: TextoEscrito = {
        id: nanoid(10),
        tipo,
        plataforma,
        tema: (tipo === "resposta" ? comentario : tema).trim(),
        opcoes: b.opcoes,
        createdAt: Date.now(),
      };
      atualizar(character.id, (c) => {
        c.textos = [novo, ...(c.textos ?? [])].slice(0, MAX_TEXTOS);
      });
      setAberto(novo.id);
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setCarregando(false);
    }
  }

  async function copiar(texto: string, chave: string) {
    if (await copyToClipboard(texto)) {
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 1500);
    }
  }

  return (
    // Uma coluna que não cresce com o conteúdo: um título longo (sem quebra)
    // é cortado com reticências em vez de empurrar o cartão para fora da tela.
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
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
            onClick={() => setTipo(t.id)}
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

      {/* flex-wrap + nowrap nas pílulas: no celular as redes que não cabem descem para a linha de baixo, em vez de o texto quebrar dentro da pílula. */}
      <div className="flex w-fit max-w-full flex-wrap gap-1 border border-line rounded-[18px] p-1 bg-panel">
        {PLATAFORMAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlataforma(p.id)}
            className={cn(
              "px-3 h-7 whitespace-nowrap rounded-full text-[11px] font-bold mono transition",
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

      {salvos.length > 0 && (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
          <div className="flex items-baseline gap-2.5 pt-1">
            <span className="text-[13px] font-semibold text-ink">
              {tx("Textos salvos")}
            </span>
            <span className="mono text-[11px] text-ink-dim">
              {salvos.length}
              {salvos.length >= MAX_TEXTOS ? ` · ${tx("máximo")}` : ""}
            </span>
          </div>
          {salvos.map((t) => {
            const rotulo = TIPOS.find((x) => x.id === t.tipo)?.label ?? t.tipo;
            const rede =
              PLATAFORMAS.find((x) => x.id === t.plataforma)?.label ??
              t.plataforma;
            const expandido = aberto === t.id;
            return (
              <div key={t.id} className="rounded-xl border border-line bg-panel">
                <div className="flex items-center gap-2 px-3.5 py-2.5">
                  <button
                    type="button"
                    onClick={() => setAberto(expandido ? null : t.id)}
                    aria-expanded={expandido}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-ink-mute transition",
                        expandido && "rotate-180",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {t.tema || tx(rotulo)}
                      </span>
                      <span className="mono block truncate text-[11px] uppercase text-ink-dim">
                        {tx(rotulo)} · {rede} ·{" "}
                        {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => excluir(t)}
                    title={tx("Excluir")}
                    aria-label={tx("Excluir")}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mute transition hover:bg-pink/10 hover:text-pink"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {expandido
                  ? t.opcoes.map((texto, i) => {
                      const chave = `${t.id}:${i}`;
                      return (
                        <div key={chave} className="border-t border-line">
                          <div className="flex items-center justify-between px-3.5 py-2">
                            <span className="text-[11px] text-ink-dim mono uppercase">
                              {t.opcoes.length > 1
                                ? `${tx("Opção")} ${i + 1}`
                                : tx(rotulo)}
                            </span>
                            <button
                              type="button"
                              onClick={() => copiar(texto, chave)}
                              className="text-[12px] text-ink-mute hover:text-ink inline-flex items-center gap-1 font-semibold"
                            >
                              {copiado === chave ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              {copiado === chave ? tx("Copiado") : tx("Copiar")}
                            </button>
                          </div>
                          <p className="px-3.5 pb-3.5 text-[13px] text-ink whitespace-pre-wrap leading-relaxed">
                            {texto}
                          </p>
                        </div>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
