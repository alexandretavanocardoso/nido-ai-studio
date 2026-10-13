"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clapperboard,
  ImageIcon,
  ImagePlus,
  PenLine,
  Send,
  Sparkles,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useCharacters } from "@/lib/store";
import { GradeDePersonagens } from "@/components/home/GradeDePersonagens";
import { useRecursos } from "@/components/RecursosProvider";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { CREDITOS_TEXTO, PLANOS } from "@/lib/planos";
import { STATUS_POST } from "@/lib/social/redes";
import type { SecaoEstudio } from "@/components/estudio/Estudio";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { idiomaAtual, tx } from "@/lib/i18n/tx";
import {
  DEPOIS_DO_MENU,
  linkEstudio,
  useCriar,
  useMaisRecente,
} from "@/components/AppShell";

type Modo = "ia" | "manual" | "imagem";

const MAX_PROMPT = 600;

const SUGESTOES = [
  {
    rotulo: "Benzedeira consultora de ESG",
    texto:
      "Benzedeira do interior de Minas que virou consultora de ESG. Fala com planta, com juiz e com algoritmo. Tom acolhedor, humor seco.",
  },
  {
    rotulo: "Caminhoneiro filósofo",
    texto:
      "Caminhoneiro da BR-116 que virou filósofo de posto. Café preto, verdade crua, reels gravados na boleia de madrugada.",
  },
  {
    rotulo: "Avó gamer de Recife",
    texto:
      "Avó de 72 anos de Recife que faz live de jogo de terror e comenta tudo como novela das oito.",
  },
];

const ATALHOS: Array<{
  rotulo: string;
  icon: LucideIcon;
  secao?: SecaoEstudio;
}> = [
  { rotulo: "Personagem", icon: UserPlus },
  { rotulo: "Vídeo", icon: Clapperboard, secao: "videos" },
  { rotulo: "Imagem", icon: ImageIcon, secao: "imagens" },
  { rotulo: "Texto", icon: PenLine, secao: "textos" },
  { rotulo: "Publicar", icon: Send, secao: "publicar" },
  { rotulo: "Agendar", icon: CalendarDays, secao: "agendamentos" },
];

export default function Home() {
  const recursos = useRecursos();
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const characters = useCharacters((s) => s.characters);
  const { conta } = useCreditos();
  const {
    criar: handleCreateClick,
    criarCom,
    noLimite: avisoLimite,
  } = useCriar();
  const recente = useMaisRecente();
  const limitePersonagens = conta ? PLANOS[conta.plano].personagens : Infinity;

  const [prompt, setPrompt] = useState("");
  const [modo, setModo] = useState<Modo>(recursos.ia ? "ia" : "manual");
  const [aviso, setAviso] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function avisar(msg: string) {
    clearTimeout(avisoTimer.current);
    setAviso(msg);
    avisoTimer.current = setTimeout(() => setAviso(null), 2200);
  }
  useEffect(() => () => clearTimeout(avisoTimer.current), []);

  function gerar() {
    if (modo === "manual") return criarCom({ modo: "manual" });
    if (modo === "imagem") return criarCom({ modo: "imagem" });
    const texto = prompt.trim();
    if (texto.length < 10) {
      avisar(tx("Descreva seu AI Creator primeiro"));
      campo.current?.focus();
      return;
    }
    criarCom({ modo: "expand", contexto: texto });
  }

  const modos: Array<{ k: Modo; rotulo: string; icon: LucideIcon }> = [
    ...(recursos.ia
      ? [{ k: "ia" as const, rotulo: tx("Expandir com IA"), icon: Sparkles }]
      : []),
    { k: "manual", rotulo: tx("Manual"), icon: PenLine },
    { k: "imagem", rotulo: tx("Por imagem"), icon: ImageIcon },
  ];
  const pronto = modo !== "ia" || prompt.trim().length >= 10;

  const lista = mounted ? characters : [];

  return (
    <main className="min-h-screen bg-nido-bg font-geist text-nido-ink">
      {/* Hero */}
      <section className="relative flex min-h-[min(94svh,900px)] overflow-hidden">
        <FundoDoHero />
        <div
          className={cn(
            "relative z-[2] flex min-w-0 flex-1 flex-col items-center justify-center gap-[26px] px-4 pt-[120px] pb-16 sm:px-8",
            DEPOIS_DO_MENU,
          )}
        >
          <div className="flex h-[30px] items-center gap-2.5 whitespace-nowrap rounded-full border border-nido-yellow/[0.28] bg-nido-bg/50 px-3.5 font-geist-mono text-[11px] uppercase tracking-[0.14em] text-nido-yellow backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-nido-yellow shadow-[0_0_8px_#fdf327] animate-nido-pulse" />
            {t("inicio.selo")}
          </div>

          <h1 className="text-balance text-center font-archivo text-[clamp(28px,8.6vw,44px)] sm:text-[clamp(44px,6.6vw,112px)] font-black uppercase leading-[0.9] tracking-[-0.025em] text-nido-paper [font-stretch:125%]">
            <span className="block">{t("inicio.titulo1")}</span>
            <span className="block text-nido-yellow [text-shadow:-3px_0_rgba(0,229,255,0.45),3px_0_rgba(186,38,38,0.65)]">
              {t("inicio.titulo2")}
            </span>
          </h1>

          <p className="max-w-[56ch] text-pretty text-center text-base leading-[1.55] text-nido-soft">
            {t("inicio.descricao")}
          </p>

          <div className="relative flex w-full max-w-[880px] flex-col gap-2.5 rounded-[20px] border border-white/10 bg-[rgba(13,11,12,0.74)] p-3.5 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.85)] backdrop-blur-[26px]">
            <div className="absolute -top-px left-[12%] right-[12%] h-px bg-[linear-gradient(90deg,transparent,rgba(253,243,39,0.9),rgba(0,229,255,0.5),transparent)]" />
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setModo("imagem")}
                title={tx("Começar pela imagem")}
                aria-label={tx("Começar pela imagem")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-nido-soft transition hover:border-nido-yellow/40 hover:text-nido-yellow"
              >
                <ImagePlus className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <textarea
                ref={campo}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    gerar();
                  }
                }}
                rows={2}
                maxLength={MAX_PROMPT}
                disabled={modo !== "ia"}
                placeholder={
                  modo === "ia"
                    ? tx(
                        "Ex.: ex-pirata fofoqueiro que virou cronista de feira em Belém, fala rápido e tem bordão…",
                      )
                    : modo === "manual"
                      ? tx(
                          "Ficha em branco: você preenche cada campo no seu ritmo.",
                        )
                      : tx(
                          "Gere ou envie o rosto do personagem e siga direto para a ficha.",
                        )
                }
                className="min-h-[56px] flex-1 resize-none bg-transparent px-1 pt-2.5 text-[17px] leading-normal text-nido-paper outline-none placeholder:text-nido-dim disabled:cursor-default"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2.5">
              {/* Abaixo de 420px os três modos não cabem com ícone (somam 342px): ocupam a linha toda, só com o texto. */}
              <div className="flex w-full gap-0.5 rounded-[11px] border border-white/[0.06] bg-white/[0.04] p-[3px] min-[420px]:w-auto">
                {modos.map((m) => (
                  <button
                    key={m.k}
                    type="button"
                    onClick={() => setModo(m.k)}
                    aria-pressed={modo === m.k}
                    className={cn(
                      "flex h-[30px] flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 text-[12.5px] font-medium transition hover:text-nido-paper min-[420px]:flex-none min-[420px]:px-[11px]",
                      modo === m.k
                        ? "bg-nido-yellow/[0.12] text-nido-yellow"
                        : "text-nido-mute",
                    )}
                  >
                    <m.icon
                      className="hidden h-3.5 w-3.5 min-[420px]:block"
                      strokeWidth={1.75}
                    />
                    {m.rotulo}
                  </button>
                ))}
              </div>
              {modo === "ia" ? (
                <span className="ml-auto font-geist-mono text-[11px] text-nido-dim">
                  {prompt.length}/{MAX_PROMPT}
                </span>
              ) : (
                <span className="ml-auto" />
              )}
              <button
                type="button"
                onClick={gerar}
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-xl px-[18px] text-sm font-semibold transition duration-200 hover:brightness-110",
                  pronto
                    ? "bg-nido-yellow text-nido-bg shadow-[0_0_30px_-6px_rgba(253,243,39,0.7)]"
                    : "bg-white/[0.07] text-nido-dim",
                )}
              >
                {modo === "ia"
                  ? tx("Gerar")
                  : modo === "manual"
                    ? tx("Abrir ficha")
                    : tx("Continuar")}
                {modo === "ia" && conta ? (
                  <span className="font-geist-mono text-[11px] opacity-70">
                    {CREDITOS_TEXTO.expandirFicha} cr
                  </span>
                ) : null}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {avisoLimite && conta && (
            <div className="mx-auto max-w-xl rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink text-center">
              {t("inicio.limite", {
                plano: PLANOS[conta.plano].nome,
                n: limitePersonagens,
              })}{" "}
              <Link href="/app/planos" className="font-bold underline">
                {t("inicio.upgrade")}
              </Link>
            </div>
          )}

          {recursos.ia ? (
            <div className="flex max-w-[880px] flex-wrap items-center justify-center gap-2">
              <span className="font-geist-mono text-[11px] uppercase tracking-[0.1em] text-nido-dim">
                {tx("Tente")}
              </span>
              {SUGESTOES.map((s) => (
                <button
                  key={s.rotulo}
                  type="button"
                  onClick={() => {
                    setModo("ia");
                    setPrompt(tx(s.texto));
                    campo.current?.focus();
                  }}
                  className="h-[30px] whitespace-nowrap rounded-full border border-white/10 bg-nido-bg/45 px-3 text-[12.5px] text-nido-soft backdrop-blur transition hover:border-nido-yellow/45 hover:text-nido-paper"
                >
                  {tx(s.rotulo)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-1.5 flex flex-wrap justify-center gap-[22px]">
            {ATALHOS.map((a) => {
              const conteudo = (
                <>
                  <span className="grid h-[60px] w-[60px] place-items-center rounded-[18px] border border-white/[0.09] bg-[rgba(18,16,17,0.72)] backdrop-blur-md transition duration-200 ease-[cubic-bezier(.16,1,.3,1)] group-hover:-translate-y-[3px] group-hover:border-nido-yellow/55 group-hover:shadow-[0_10px_30px_-10px_rgba(253,243,39,0.4)]">
                    <a.icon className="h-[22px] w-[22px]" strokeWidth={1.6} />
                  </span>
                  <span className="text-[12.5px] font-medium">
                    {tx(a.rotulo)}
                  </span>
                </>
              );
              const classe =
                "group flex flex-col items-center gap-2 text-[#e6dfd3] transition hover:text-nido-yellow";
              return a.secao && recente ? (
                <Link
                  key={a.rotulo}
                  href={linkEstudio(recente.id, a.secao)}
                  className={classe}
                >
                  {conteudo}
                </Link>
              ) : (
                <button
                  key={a.rotulo}
                  type="button"
                  onClick={handleCreateClick}
                  className={classe}
                >
                  {conteudo}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div
        className={cn("relative z-[2] px-4 pb-16 sm:px-6", DEPOIS_DO_MENU)}
      >
        <div className="flex max-w-[1440px] flex-col gap-10">
          <GradeDePersonagens comTitulo />

          {lista.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-3.5">
              <FilaDeGeracao personagens={lista} />
              {recursos.social ? (
                <ProximasPublicacoes personagens={lista} />
              ) : null}
            </div>
          ) : null}

          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-5 font-geist-mono text-[11px] text-nido-dim">
            <span>
              NIDO AI Studio · v3 ·{" "}
              {recursos.ia
                ? tx("Expansão por IA + persistência local.")
                : tx(
                    "Persistência local no navegador. Expansão por IA chega em uma versão futura.",
                  )}
            </span>
            <a
              href="https://nido.global"
              target="_blank"
              rel="noopener noreferrer"
              className="text-nido-mute transition hover:text-nido-yellow"
            >
              nido.global
            </a>
          </footer>
        </div>
      </div>

      {aviso ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[200] flex h-[42px] -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-nido-yellow/35 bg-[rgba(18,16,17,0.92)] px-[18px] text-[13px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] backdrop-blur-[14px]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-nido-yellow shadow-[0_0_8px_#fdf327]" />
          {aviso}
        </div>
      ) : null}

      <MountGate onMount={() => setMounted(true)} />
    </main>
  );
}

function MountGate({ onMount }: { onMount: () => void }) {
  useEffect(() => onMount(), [onMount]);
  return null;
}

/** Fundo do hero: a imagem do banner, escurecida para o texto ler bem. */
function FundoDoHero() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-nido-bg" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/banner/banner.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="pointer-events-none absolute inset-0 bg-nido-bg/[0.62]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,transparent_30%,rgba(11,10,10,0.7)_85%),linear-gradient(to_bottom,rgba(11,10,10,0.35)_0%,rgba(11,10,10,0.15)_30%,rgba(11,10,10,0.6)_72%,#0b0a0a_100%)]" />
    </div>
  );
}

const ROTULO_ORIGEM: Record<string, string> = {
  legenda: "legenda",
  substituicao: "troca",
  criado: "vídeo",
  audio: "fala",
};

/** O que está sendo gerado agora, em todos os personagens (vídeos em processamento). */
function FilaDeGeracao({ personagens }: { personagens: Character[] }) {
  const itens = personagens.flatMap((c) =>
    (c.videos ?? [])
      .filter((v) => v.status === "processando")
      .map((v) => ({ c, v })),
  );
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-nido-panel">
      <div className="flex items-baseline gap-3 px-5 py-[18px]">
        <h3 className="text-[15px] font-semibold">{tx("Fila de geração")}</h3>
        <span className="font-geist-mono text-[11px] text-nido-mute">
          {itens.length} {tx("em curso")}
        </span>
      </div>
      {itens.length === 0 ? (
        <div className="border-t border-white/[0.06] px-5 py-6 text-[13px] text-nido-mute">
          {tx("Nada sendo gerado agora.")}
        </div>
      ) : (
        itens.map(({ c, v }) => (
          <Link
            key={v.id}
            href={linkEstudio(c.id, "videos")}
            className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-white/[0.06] px-5 py-[13px] transition hover:bg-white/[0.025] sm:grid-cols-[36px_minmax(0,1fr)_76px_120px]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white/[0.05] text-nido-soft">
              <Clapperboard className="h-[17px] w-[17px]" strokeWidth={1.75} />
            </span>
            <span className="flex min-w-0 flex-col gap-[3px]">
              <span className="truncate text-[13px] font-semibold">
                {c.identidade.nome || tx("Sem nome")}
              </span>
              <span className="truncate text-[12.5px] text-nido-mute">
                {v.name}
              </span>
            </span>
            <span className="hidden font-geist-mono text-[10.5px] uppercase tracking-[0.08em] text-[#c99a5c] sm:block">
              {tx(ROTULO_ORIGEM[v.origem ?? ""] ?? "vídeo")}
            </span>
            <span className="flex flex-col gap-1.5">
              <span className="font-geist-mono text-[10.5px] text-nido-yellow">
                {tx("gerando")}
              </span>
              <span className="hidden h-[3px] overflow-hidden rounded-[3px] bg-white/[0.07] sm:block">
                <span className="block h-full w-full bg-gradient-to-r from-nido-ocre to-nido-yellow animate-nido-pulse" />
              </span>
            </span>
          </Link>
        ))
      )}
    </section>
  );
}

interface PostDaHome {
  id: string;
  characterId: string;
  redes: string[];
  texto: string;
  titulo: string | null;
  quando: string;
  status: string;
}

const SETE_DIAS = 7 * 86_400_000;
const NOME_REDE: Record<string, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  TWITTER: "X",
  LINKEDIN: "LinkedIn",
};

/** Posts agendados dos próximos 7 dias (e os que falharam nos últimos 7), de todos os personagens. */
function ProximasPublicacoes({ personagens }: { personagens: Character[] }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostDaHome[] | null>(null);
  const temPersonagens = personagens.length > 0;

  useEffect(() => {
    if (!user || !temPersonagens) return;
    let vivo = true;
    fetch("/api/social/posts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (b: { posts?: PostDaHome[] } | null) =>
          vivo && setPosts(b?.posts ?? []),
      )
      .catch(() => vivo && setPosts([]));
    return () => {
      vivo = false;
    };
  }, [user, temPersonagens]);

  if (!user) return null;
  const nome = (id: string) =>
    personagens.find((c) => c.id === id)?.identidade.nome || tx("Sem nome");
  const agora = Date.now();
  const proximos = (posts ?? [])
    .filter((p) => {
      const quando = new Date(p.quando).getTime();
      return (
        ["SCHEDULED", "PROCESSING", "RETRYING", "REVIEW"].includes(p.status) &&
        quando > agora - 3600_000 &&
        quando < agora + SETE_DIAS
      );
    })
    .sort((a, b) => a.quando.localeCompare(b.quando))
    .slice(0, 5);
  const falhas = (posts ?? []).filter(
    (p) =>
      p.status === "ERROR" && new Date(p.quando).getTime() > agora - SETE_DIAS,
  );
  const comFalha = [...new Set(falhas.map((p) => p.characterId))];
  // O calendário abre no personagem do próximo post (ou no mexido por último).
  const doCalendario =
    proximos[0]?.characterId ??
    [...personagens].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-nido-panel">
      <div className="flex items-center justify-between gap-3 px-5 py-[18px]">
        <div className="flex items-baseline gap-3">
          <h3 className="text-[15px] font-semibold">
            {tx("Próximas publicações")}
          </h3>
          <span className="font-geist-mono text-[11px] text-nido-mute">
            {tx("7 dias")}
          </span>
        </div>
        {doCalendario ? (
          <Link
            href={linkEstudio(doCalendario, "agendamentos")}
            className="text-[12.5px] font-medium text-nido-soft transition hover:text-nido-yellow"
          >
            {tx("Calendário")}
          </Link>
        ) : null}
      </div>
      {falhas.length > 0 ? (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-nido-red/30 bg-[rgba(186,38,38,0.12)] px-3.5 py-3">
          <TriangleAlert className="h-[18px] w-[18px] shrink-0 text-[#ff6b5e]" />
          <span className="flex-1 text-[12.5px] leading-[1.45] text-[#e9c9c3]">
            {falhas.length === 1
              ? tx("1 publicação falhou em")
              : `${falhas.length} ${tx("publicações falharam em")}`}{" "}
            {comFalha.map(nome).join(", ")}.
          </span>
          <Link
            href={linkEstudio(comFalha[0], "agendamentos")}
            className="inline-flex h-[30px] items-center whitespace-nowrap rounded-lg bg-nido-ink px-3 text-xs font-semibold text-nido-bg transition hover:bg-white"
          >
            {tx("Ver")}
          </Link>
        </div>
      ) : null}
      {posts === null ? (
        <div className="border-t border-white/[0.06] px-5 py-6 text-[13px] text-nido-mute">
          {tx("Carregando…")}
        </div>
      ) : proximos.length === 0 ? (
        <div className="border-t border-white/[0.06] px-5 py-6 text-[13px] text-nido-mute">
          {tx("Nenhuma publicação agendada para os próximos 7 dias.")}
        </div>
      ) : (
        proximos.map((p) => {
          const d = new Date(p.quando);
          const hoje = d.toDateString() === new Date().toDateString();
          const andamento = p.status !== "SCHEDULED";
          return (
            <Link
              key={p.id}
              href={linkEstudio(p.characterId, "agendamentos")}
              className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-white/[0.06] px-5 py-3 transition hover:bg-white/[0.025]"
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-geist-mono text-[10px] uppercase tracking-[0.1em] text-nido-dim">
                  {hoje
                    ? tx("Hoje")
                    : d
                        .toLocaleDateString(idiomaAtual() === "en" ? "en-US" : "pt-BR", {
                          weekday: "short",
                        })
                        .replace(".", "")}
                </span>
                <span
                  className={cn(
                    "font-archivo text-lg font-extrabold leading-none [font-stretch:112%]",
                    hoje ? "text-nido-yellow" : "text-nido-ink",
                  )}
                >
                  {String(d.getHours()).padStart(2, "0")}h
                  {d.getMinutes()
                    ? String(d.getMinutes()).padStart(2, "0")
                    : ""}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="truncate text-[13px] font-semibold">
                  {nome(p.characterId)}
                </span>
                <span className="truncate text-[12.5px] text-nido-mute">
                  {[p.titulo || p.texto, p.redes.map((r) => NOME_REDE[r] ?? r).join(" + ")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span
                className={cn(
                  "flex items-center gap-1.5 font-geist-mono text-[10.5px] uppercase tracking-[0.08em]",
                  andamento ? "text-nido-yellow" : "text-[#7cc4ff]",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {tx(STATUS_POST[p.status]?.rotulo ?? p.status)}
              </span>
            </Link>
          );
        })
      )}
    </section>
  );
}
