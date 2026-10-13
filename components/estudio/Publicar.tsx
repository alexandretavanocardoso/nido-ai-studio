"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  Info,
  Link2,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/cn";
import { fileUrl } from "@/lib/storage/client";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import { paraValor, SeletorHorario } from "@/components/estudio/SeletorHorario";
import { Textarea } from "@/components/ui/Input";
import { bloqueioPublicar, CREDITOS_POST_POR_REDE } from "@/lib/planos";
import {
  INFO_REDES,
  MAX_TITULO_YOUTUBE,
  problemasDoPost,
  REDES,
  statusEmAberto,
  type Rede,
  type TipoMidia,
} from "@/lib/social/redes";
import { tx } from "@/lib/i18n/tx";
import { useDuravel } from "@/lib/duravel";
import { IconeRede, IconesRedes } from "@/components/ui/IconeRede";
import { txErro } from "@/lib/i18n/erros";

interface Conta {
  rede: Rede;
  usuario: string | null;
  nome: string | null;
  avatar: string | null;
}
export interface Post {
  id: string;
  redes: Rede[];
  texto: string;
  titulo: string | null;
  midiaKey: string | null;
  midiaTipo: TipoMidia | null;
  quando: string;
  status: string;
  erros: Partial<Record<Rede, string>> | null;
  links: Partial<Record<Rede, string>> | null;
}
interface Estado {
  configurado: boolean;
  conectado?: boolean;
  contas: Conta[];
  erroContas?: string | null;
  posts: Post[];
}
interface Midia {
  key: string;
  tipo: TipoMidia;
  rotulo: string;
}

/** "Agora + 1h", no formato do <input type="datetime-local"> (hora local). */
function daquiUmaHora(): string {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Contas conectadas e posts do influencer; confere de novo a cada 30s enquanto algo publica. */
export function usePublicacao(characterId: string) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/social/${encodeURIComponent(characterId)}`, {
        cache: "no-store",
      });
      const b = (await r.json().catch(() => null)) as
        (Estado & { error?: string }) | null;
      if (!r.ok || !b)
        return setErroCarga(txErro(b?.error ?? `Falha (HTTP ${r.status}).`));
      setErroCarga(null);
      setEstado(b);
    } finally {
      setCarregando(false);
    }
  }, [characterId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const emAndamento = estado?.posts.some(
    (p) =>
      statusEmAberto(p.status) &&
      new Date(p.quando).getTime() < Date.now() + 60_000,
  );
  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(carregar, 30_000);
    return () => clearInterval(t);
  }, [emAndamento, carregar]);

  return { estado, carregando, erroCarga, carregar };
}

/**
 * Publicar nas redes do influencer (bundle.social): conectar as contas e
 * montar o post (mídia + legenda + redes) para publicar já, agendar ou
 * guardar no backlog. O calendário fica em Agendamentos.
 */
export function Publicar({ character }: { character: Character }) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const { estado, carregando, erroCarga, carregar } = usePublicacao(
    character.id,
  );
  const params = useSearchParams();
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useDuravel<{ msg: string; code?: string } | null>(
    `publicar:${character.id}:erro`,
    null,
  );

  const [redes, setRedes] = useState<Rede[]>([]);
  const [midiaKey, setMidiaKey] = useState<string | null>(null);
  const [texto, setTexto] = useDuravel<string>(`publicar:${character.id}:texto`, "");
  const [titulo, setTitulo] = useDuravel<string>(`publicar:${character.id}:titulo`, "");
  const [modo, setModo] = useState<"agora" | "agendar" | "backlog">("agendar");
  const [quando, setQuando] = useState(daquiUmaHora);
  const [enviando, setEnviando] = useDuravel<boolean>(
    `publicar:${character.id}:enviando`,
    false,
    "Publicando o post",
  );
  const [escrevendo, setEscrevendo] = useDuravel<boolean>(
    `publicar:${character.id}:escrevendo`,
    false,
    "Escrevendo a legenda",
  );
  const [aviso, setAviso] = useDuravel<string | null>(
    `publicar:${character.id}:aviso`,
    null,
  );

  // Vindo do calendário ("Agendar neste dia"): já abre agendando naquele dia.
  const diaParam = params?.get("dia");
  useEffect(() => {
    if (!diaParam || !/^\d{4}-\d{2}-\d{2}$/.test(diaParam)) return;
    const d = new Date(`${diaParam}T18:00`);
    setModo("agendar");
    setQuando(
      paraValor(d.getTime() > Date.now() ? d : new Date(Date.now() + 3600_000)),
    );
    document
      .getElementById("novo-post")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [diaParam]);

  const midias = useMemo<Midia[]>(() => {
    const videos = (character.videos ?? [])
      .filter((v) => v.key && !v.status)
      .map((v) => ({ key: v.key, tipo: "video" as const, rotulo: v.name }));
    const imagens = (character.geradas ?? []).map((g) => ({
      key: g.key,
      tipo: "imagem" as const,
      rotulo: g.tipo === "retrato" ? "Retrato" : "Card",
    }));
    return [...videos, ...imagens];
  }, [character.videos, character.geradas]);
  const midia = midias.find((m) => m.key === midiaKey) ?? null;

  // Vindo de um vídeo ou imagem ("Publicar" no card): já abre com essa mídia escolhida.
  const midiaParam = params?.get("midia");
  const temMidiaDoLink = !!midiaParam && midias.some((m) => m.key === midiaParam);
  useEffect(() => {
    if (!midiaParam || !temMidiaDoLink) return;
    setMidiaKey(midiaParam);
    document
      .getElementById("novo-post")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [midiaParam, temMidiaDoLink]);

  const conectadas = new Set((estado?.contas ?? []).map((c) => c.rede));
  const problemas = problemasDoPost({
    redes,
    texto,
    titulo,
    midiaTipo: midia?.tipo ?? null,
  });
  const bloqueio = conta ? bloqueioPublicar(conta.plano) : null;
  const custo = redes.length * CREDITOS_POST_POR_REDE;
  const agendadoNoPassado =
    modo === "agendar" && new Date(quando).getTime() < Date.now();
  const nAgendados = (estado?.posts ?? []).filter(
    (p) => p.status === "SCHEDULED",
  ).length;
  const nBacklog = (estado?.posts ?? []).filter(
    (p) => p.status === "BACKLOG",
  ).length;

  async function conectar() {
    setErro(null);
    setConectando(true);
    try {
      const r = await fetch("/api/social/conectar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          nome: character.identidade.nome,
        }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        code?: string;
      };
      if (!r.ok || !b.url)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${r.status}).`),
          code: b.code,
        });
      window.location.href = b.url;
    } finally {
      setConectando(false);
    }
  }

  async function escreverLegenda() {
    setErro(null);
    setEscrevendo(true);
    try {
      const plataforma = redes.includes("TIKTOK")
        ? "tiktok"
        : redes.includes("YOUTUBE")
          ? "youtube"
          : "instagram";
      const r = await fetch("/api/escrever", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character,
          tipo: "legenda",
          plataforma,
          tema: texto.trim() || midia?.rotulo || "um post do dia a dia",
        }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        opcoes?: string[];
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!r.ok || !b.opcoes?.length)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${r.status}).`),
          code: b.code,
        });
      setTexto(b.opcoes[0]);
    } finally {
      setEscrevendo(false);
    }
  }

  async function publicar() {
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          redes,
          texto,
          titulo: redes.includes("YOUTUBE") ? titulo : undefined,
          midiaKey: midia?.key,
          midiaTipo: midia?.tipo,
          quando:
            modo === "agendar" ? new Date(quando).toISOString() : undefined,
          backlog: modo === "backlog" || undefined,
        }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        id?: string;
        agora?: boolean;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!r.ok || !b.id)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${r.status}).`),
          code: b.code,
        });
      setAviso(
        modo === "backlog"
          ? "Guardado no backlog — agende quando quiser em Agendamentos."
          : b.agora
            ? "Enviado! A publicação leva de alguns segundos a poucos minutos."
            : "Post agendado — aparece no calendário em Agendamentos.",
      );
      setTexto("");
      setTitulo("");
      carregar();
    } finally {
      setEnviando(false);
    }
  }

  if (!recursos.social)
    return (
      <Vazio>
        {tx(
          "A publicação nas redes não está configurada neste deploy (BUNDLE_SOCIAL).",
        )}
      </Vazio>
    );
  if (carregando && !estado)
    return (
      <div className="py-10 grid place-items-center text-ink-dim">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );

  return (
    // min-w-0 nos filhos: as faixas com rolagem horizontal (mídias, dias) não podem alargar a grade.
    <div className="grid gap-8 [&>*]:min-w-0">
      {/* 1. Contas */}
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">
              {tx("Redes de")} {character.identidade.nome || tx("o personagem")}
            </h3>
            <p className="text-[13px] text-ink-mute">
              {tx("Cada influencer conecta as próprias contas.")}
            </p>
          </div>
          <Button
            size="sm"
            variant={conectadas.size ? "ghost" : "accent"}
            onClick={conectar}
            disabled={conectando || !!bloqueio}
          >
            {conectando ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Link2 className="w-3.5 h-3.5" />
            )}
            {conectadas.size ? tx("Gerenciar contas") : tx("Conectar redes")}
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {REDES.map((r) => {
            const c = estado?.contas.find((x) => x.rede === r);
            return (
              <div
                key={r}
                className={cn(
                  "rounded-xl border px-3 py-2.5",
                  c ? "border-ok/40 bg-ok/5" : "border-line bg-panel",
                )}
              >
                <div className="text-[13px] font-semibold text-ink inline-flex items-center gap-1.5">
                  <IconeRede rede={r} />
                  {INFO_REDES[r].nome}
                </div>
                <div
                  className={cn(
                    "text-[12px] truncate",
                    c ? "text-ok" : "text-ink-dim",
                  )}
                >
                  {c
                    ? `@${c.usuario || c.nome || "conectado"}`
                    : tx("não conectada")}
                </div>
              </div>
            );
          })}
        </div>
        {!conectadas.has("INSTAGRAM") && (
          <div className="rounded-xl border border-line bg-panel px-3.5 py-3 flex gap-2.5 text-[13px]">
            <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div className="text-ink-mute leading-relaxed">
              <strong className="text-ink">{tx("Instagram:")}</strong>{" "}
              {tx("só dá para publicar com uma conta")}{" "}
              <strong className="text-ink">profissional</strong>{" "}
              {tx("(Comercial ou Criador de conteúdo) ligada a uma")}{" "}
              <strong className="text-ink">{tx("página do Facebook")}</strong>{" "}
              {tx(
                '— exigência da Meta. Para mudar: no app do Instagram, Configurações → Tipo de conta e ferramentas → Mudar para conta profissional; depois ligue a uma página em Central de Contas. Na hora de conectar, escolha "Entrar com Facebook" e marque todas as páginas e contas que você administra.',
              )}
            </div>
          </div>
        )}
        {estado?.erroContas ? (
          <p className="text-[12px] text-pink">{estado.erroContas}</p>
        ) : null}
        {bloqueio ? <ErroGeracao mensagem={bloqueio} code="PLANO" /> : null}
      </section>

      {/* 2. Novo post */}
      {conectadas.size > 0 && (
        <section
          id="novo-post"
          className="grid gap-4 border-t border-line pt-6 scroll-mt-6 [&>*]:min-w-0"
        >
          <h3 className="text-[15px] font-semibold text-ink">
            {tx("Novo post")}
          </h3>

          <div>
            <div className="text-[12px] font-semibold text-ink mb-2">
              {tx("Mídia")}
            </div>
            {midias.length === 0 ? (
              <p className="text-[13px] text-ink-dim">
                {tx(
                  "Nenhum vídeo ou imagem pronta ainda — gere em Vídeos ou Imagens.",
                )}
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setMidiaKey(null)}
                  className={cn(
                    "shrink-0 w-20 aspect-[9/16] rounded-lg border-2 grid place-items-center text-[11px] text-ink-mute",
                    !midiaKey ? "border-accent" : "border-line",
                  )}
                >
                  {tx("Só texto")}
                </button>
                {midias.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMidiaKey(m.key)}
                    title={m.rotulo}
                    className={cn(
                      "relative shrink-0 w-20 aspect-[9/16] rounded-lg overflow-hidden border-2 bg-black",
                      midiaKey === m.key ? "border-accent" : "border-line",
                    )}
                  >
                    {m.tipo === "video" ? (
                      <video
                        src={fileUrl(m.key)}
                        preload="metadata"
                        muted
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fileUrl(m.key)}
                        alt=""
                        className="h-full w-full object-cover object-top"
                      />
                    )}
                    <span className="absolute bottom-1 left-1 text-[9px] font-bold uppercase bg-black/70 text-white rounded px-1">
                      {m.tipo === "video" ? tx("Vídeo") : tx("Imagem")}
                    </span>
                    {midiaKey === m.key && (
                      <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-accent text-bg grid place-items-center">
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-[12px] font-semibold text-ink mb-2">
              {tx("Onde publicar")}
            </div>
            <div className="flex gap-2 flex-wrap">
              {REDES.filter((r) => conectadas.has(r)).map((r) => {
                const ativo = redes.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setRedes((x) =>
                        ativo ? x.filter((y) => y !== r) : [...x, r],
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full h-9 px-4 text-[13px] font-semibold border transition",
                      ativo
                        ? "bg-accent text-bg border-accent"
                        : "border-line text-ink-mute hover:text-ink",
                    )}
                  >
                    {ativo && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                    <IconeRede rede={r} />
                    {INFO_REDES[r].nome}
                  </button>
                );
              })}
            </div>
          </div>

          {redes.includes("YOUTUBE") && (
            <div>
              <div className="text-[12px] font-semibold text-ink mb-2">
                {tx("Título do Short")}
              </div>
              <input
                value={titulo}
                maxLength={MAX_TITULO_YOUTUBE}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder={tx("Título que aparece no YouTube")}
                className="w-full h-10 rounded-xl border border-line bg-bg px-3.5 text-[14px] text-ink focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-[12px] font-semibold text-ink">
                {tx("Legenda")}
              </span>
              {recursos.ia && (
                <button
                  type="button"
                  onClick={escreverLegenda}
                  disabled={escrevendo}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline disabled:opacity-50"
                >
                  {escrevendo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  {tx("Escrever com IA")}
                </button>
              )}
            </div>
            <Textarea
              rows={5}
              maxLength={5000}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={tx(
                "Legenda do post. Dica: escreva o tema e clique em “Escrever com IA”.",
              )}
            />
            <div className="text-[11px] text-ink-dim mt-1 flex gap-3 flex-wrap">
              <span>{texto.length} caracteres</span>
              {redes.map((r) => (
                <span
                  key={r}
                  className={
                    texto.length > INFO_REDES[r].maxTexto ? "text-pink" : ""
                  }
                >
                  {INFO_REDES[r].nome}
                  {tx(": até")} {INFO_REDES[r].maxTexto}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            {/* No celular as três opções dividem a linha e o texto pode ocupar duas linhas: na pílula de 32px, "Salvar no backlog" quebrava e ficava colado nas bordas. */}
            <div className="flex w-full gap-1 rounded-2xl border border-line bg-panel p-1 sm:w-fit sm:rounded-full">
              {(
                [
                  ["agendar", tx("Agendar")],
                  ["agora", tx("Publicar agora")],
                  ["backlog", tx("Salvar no backlog")],
                ] as const
              ).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModo(id)}
                  className={cn(
                    "min-h-8 flex-auto rounded-xl px-2 py-1.5 text-center text-[12px] font-bold leading-tight transition sm:flex-none sm:whitespace-nowrap sm:rounded-full sm:px-3.5 sm:py-0",
                    modo === id
                      ? "bg-accent text-bg"
                      : "text-ink-mute hover:text-ink",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            {modo === "agendar" && (
              <SeletorHorario valor={quando} onChange={setQuando} />
            )}
          </div>

          <p className="text-[11px] text-ink-dim">
            {tx(
              "O post sai marcado como conteúdo gerado por IA nas redes que têm essa marcação (Instagram, TikTok, X e YouTube).",
            )}
          </p>

          {problemas.length > 0 && redes.length > 0 && (
            <ul className="text-[12px] text-pink grid gap-0.5">
              {problemas.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
          {erro ? <ErroGeracao mensagem={erro.msg} code={erro.code} /> : null}
          {aviso ? (
            <p className="text-[13px] text-ok font-semibold">{aviso}</p>
          ) : null}

          <Button
            variant="accent"
            className="w-fit"
            onClick={publicar}
            disabled={
              enviando ||
              problemas.length > 0 ||
              agendadoNoPassado ||
              !!bloqueio
            }
          >
            {enviando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : modo === "agora" ? (
              <Send className="w-4 h-4" />
            ) : modo === "backlog" ? (
              <Archive className="w-4 h-4" />
            ) : (
              <CalendarClock className="w-4 h-4" />
            )}
            {modo === "agora"
              ? tx("Publicar agora")
              : modo === "backlog"
                ? tx("Salvar no backlog")
                : tx("Agendar post")}
            {conta && redes.length && modo !== "backlog"
              ? ` · ${custo} crédito${custo > 1 ? "s" : ""}`
              : ""}
          </Button>
        </section>
      )}
      {!conectadas.size && erro ? (
        <ErroGeracao mensagem={erro.msg} code={erro.code} />
      ) : null}
      {erroCarga ? <ErroGeracao mensagem={erroCarga} /> : null}

      {/* Atalho pros Agendamentos */}
      {(nAgendados > 0 || nBacklog > 0) && (
        <Link
          href="?aba=estudio&secao=agendamentos"
          className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 hover:border-line-strong transition"
        >
          <CalendarDays className="w-5 h-5 text-accent shrink-0" />
          <span className="flex-1 text-[13px] text-ink-mute">
            <strong className="text-ink">{nAgendados}</strong> agendado
            {nAgendados === 1 ? "" : "s"} ·{" "}
            <strong className="text-ink">{nBacklog}</strong>{" "}
            {tx("no backlog — ver o calendário")}
          </span>
          <ArrowRight className="w-4 h-4 text-ink-dim" />
        </Link>
      )}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-[14px] text-ink-dim">
      {children}
    </div>
  );
}
