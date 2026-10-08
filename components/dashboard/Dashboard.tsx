"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  Heart,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  Pencil,
  Quote,
  RefreshCw,
  Repeat2,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { confirmar } from "@/components/ui/Confirmacao";
import { detectarRedeDoLink } from "@/lib/social/link-metricas";
import { IconeRede } from "@/components/ui/IconeRede";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import type { Metricas, PostMetricas } from "@/lib/social/metricas";
import {
  engajamento,
  resumir,
  ZERO,
  variacao,
  type LinhaPersonagem,
  type Periodo,
  type Resumo,
} from "@/lib/social/painel";
import { INFO_REDES, REDES } from "@/lib/social/redes";
import type { Character } from "@/lib/types";
import { capaSrc } from "@/lib/storage/client";
import { useCharacters } from "@/lib/store";

interface Resposta {
  configurado: boolean;
  posts: PostMetricas[];
  atualizadoEm: string | null;
  /** Dá pra cadastrar post por link (Apify configurado)? */
  porLink: boolean;
  linksVelhos: number;
  erro: string | null;
  error?: string;
}

type Aba = "geral" | "personagem";

const PERIODOS: Periodo[] = [7, 30, 90];
const KPIS: Array<{ campo: keyof Metricas; rotulo: string; icon: LucideIcon }> =
  [
    { campo: "views", rotulo: "Visualizações", icon: Eye },
    { campo: "curtidas", rotulo: "Curtidas", icon: Heart },
    { campo: "comentarios", rotulo: "Comentários", icon: MessageCircle },
    { campo: "reposts", rotulo: "Reposts", icon: Repeat2 },
    { campo: "quotes", rotulo: "Quotes", icon: Quote },
    { campo: "salvos", rotulo: "Salvamentos", icon: Bookmark },
  ];

const compacto = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = (n: number) => compacto.format(n);
const pct = (n: number) =>
  `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const cartao = "rounded-[18px] border border-white/[0.07] bg-nido-panel";
const mono = "font-geist-mono";

/**
 * Dashboard (/app/dashboard): o que os posts publicados de todos os personagens
 * renderam — views, curtidas, comentários, reposts, quotes e salvamentos —
 * no período, por personagem e por rede. Os posts entram pela data de publicação.
 */
export function Dashboard() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [aba, setAba] = useState<Aba>("geral");
  const temPersonagens = useCharacters((s) => s.characters.length > 0);
  const [adicionando, setAdicionando] = useState(false);

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true);
    try {
      const ler = async () => {
        const r = await fetch(
          `/api/social/metricas${forcar ? "?atualizar=1" : ""}`,
          { cache: "no-store" },
        );
        const b = (await r.json().catch(() => null)) as Resposta | null;
        if (!r.ok || !b) {
          setErro(txErro(b?.error ?? `Falha (HTTP ${r.status}).`));
          return null;
        }
        setErro(b.erro ? txErro(b.erro) : null);
        setDados(b);
        return b;
      };
      const b = await ler();
      // Posts por link: relê os de leitura velha (ou todos, no "Atualizar") e mostra de novo.
      const reler =
        b?.porLink &&
        (forcar ? b.posts.some((p) => p.link) : b.linksVelhos > 0);
      if (!reler) return;
      const r = await fetch("/api/social/metricas/links", { method: "PATCH" });
      const lido = (await r.json().catch(() => null)) as {
        erro?: string | null;
        error?: string;
      } | null;
      await ler();
      const falha = lido?.erro ?? lido?.error;
      if (falha) setErro(txErro(falha));
    } catch {
      setErro(txErro("Não consegui carregar as métricas."));
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const personagens = useCharacters((s) => s.characters);
  // Filtro da aba "Por personagem" (null = todos). Some se o personagem for apagado.
  const [filtro, setFiltro] = useState<string | null>(null);
  const so =
    aba === "personagem" && personagens.some((c) => c.id === filtro)
      ? filtro
      : null;
  const posts = useMemo(
    () => (dados?.posts ?? []).filter((p) => !so || p.characterId === so),
    [dados, so],
  );
  const resumo = useMemo(() => resumir(posts, periodo), [posts, periodo]);

  return (
    <main className="flex w-full max-w-[1440px] flex-col gap-7 px-4 pb-16 pt-3 font-geist text-nido-ink sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2.5">
          <span
            className={cn(
              mono,
              "text-[11px] uppercase tracking-[0.18em] text-nido-yellow",
            )}
          >
            {tx("Seu desempenho na NIDO")}
          </span>
          <h1 className="font-archivo text-[clamp(32px,4vw,48px)] font-black uppercase leading-[0.95] tracking-[-0.02em] [font-stretch:125%]">
            {tx("Dashboard")}{" "}
            <span className="text-nido-yellow [text-shadow:-2px_0_rgba(0,229,255,0.4),2px_0_rgba(186,38,38,0.6)]">
              {tx("do criador")}
            </span>
          </h1>
          <p className="max-w-[60ch] text-[15px] leading-[1.55] text-nido-mute">
            {tx(
              "Uma visão geral de tudo que seus personagens publicaram: alcance e engajamento, por personagem e por rede.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dados?.porLink && temPersonagens ? (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="inline-flex h-[38px] items-center gap-1.5 rounded-full border border-white/10 px-4 text-[13px] font-semibold text-nido-soft transition hover:border-nido-yellow/50 hover:text-nido-ink"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              {tx("Adicionar link de post")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => carregar(true)}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 text-[12px] text-nido-mute transition hover:text-nido-ink disabled:opacity-60"
          >
            {carregando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {tx("Atualizar")}
          </button>
          <div className="flex gap-0.5 rounded-full border border-white/[0.07] bg-nido-panel p-1">
            {PERIODOS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodo(p)}
                className={cn(
                  mono,
                  "h-[34px] rounded-full px-3.5 text-[12.5px] font-semibold transition",
                  periodo === p
                    ? "bg-nido-yellow text-nido-bg"
                    : "text-nido-soft hover:text-nido-ink",
                )}
              >
                {p}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {erro ? (
        <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
          {erro}
        </div>
      ) : null}

      {!dados ? (
        carregando ? (
          <div className="grid place-items-center py-20 text-nido-dim">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : null
      ) : !dados.configurado ? (
        <Vazio>
          {tx(
            "A publicação nas redes não está configurada neste deploy (BUNDLE_SOCIAL).",
          )}
        </Vazio>
      ) : dados.posts.length === 0 && !temPersonagens ? (
        <Vazio>
          {tx(
            "Nenhum post publicado ainda. Publique pelo Estúdio de um personagem e os números aparecem aqui.",
          )}
        </Vazio>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["geral", "Visão geral"],
                ["personagem", "Por personagem"],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                className={cn(
                  "h-[38px] rounded-full border px-4 text-[13.5px] font-semibold transition",
                  aba === id
                    ? "border-nido-yellow bg-nido-yellow text-nido-bg"
                    : "border-white/10 text-nido-soft hover:border-nido-yellow/50",
                )}
              >
                {tx(rotulo)}
              </button>
            ))}
          </div>

          {aba === "personagem" && personagens.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {[null, ...personagens].map((c) => {
                const ativo = (c?.id ?? null) === so;
                return (
                  <button
                    key={c?.id ?? "todos"}
                    type="button"
                    onClick={() => setFiltro(c?.id ?? null)}
                    aria-pressed={ativo}
                    className={cn(
                      "inline-flex h-9 max-w-[220px] items-center gap-2 rounded-full border pr-3.5 text-[13px] font-semibold transition",
                      c ? "pl-1" : "pl-3.5",
                      ativo
                        ? "border-nido-yellow bg-nido-yellow/10 text-nido-yellow"
                        : "border-white/10 text-nido-soft hover:border-nido-yellow/50 hover:text-nido-ink",
                    )}
                  >
                    {c ? <Capa personagem={c} redonda /> : null}
                    <span className="truncate">
                      {c ? c.identidade.nome || tx("Sem nome") : tx("Todos")}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <Kpis resumo={resumo} periodo={periodo} />

          {aba === "geral" ? (
            <>
              <Grafico resumo={resumo} periodo={periodo} />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-3.5">
                <TabelaPersonagens linhas={resumo.personagens} />
                <PorRede resumo={resumo} />
              </div>
            </>
          ) : (
            <>
              {so ? (
                <>
                  <Grafico resumo={resumo} periodo={periodo} />
                  <PorRede resumo={resumo} />
                </>
              ) : null}
              <TabelaPersonagens
                linhas={resumo.personagens}
                so={so}
                completa
              />
            </>
          )}

          <PostsPorLink
            posts={posts.filter((p) => p.link)}
            onMudou={() => carregar()}
          />

          <p className={cn(mono, "text-[11px] text-nido-dim")}>
            {tx("Posts contam pela data de publicação.")}{" "}
            {dados.atualizadoEm
              ? `${tx("Última leitura das redes:")} ${new Date(
                  dados.atualizadoEm,
                ).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}.`
              : null}
          </p>
        </>
      )}
      {adicionando ? (
        <AdicionarLink
          onFechar={() => setAdicionando(false)}
          onSalvo={() => {
            setAdicionando(false);
            carregar();
          }}
        />
      ) : null}
    </main>
  );
}

/** Cadastra um post publicado por fora: escolhe o personagem e cola o link do post. */
function AdicionarLink({
  onFechar,
  onSalvo,
}: {
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const personagens = useCharacters((s) => s.characters);
  const [characterId, setCharacterId] = useState(personagens[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const rede = detectarRedeDoLink(url);

  async function salvar() {
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/social/metricas/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, url: url.trim() }),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
      onSalvo();
    } catch {
      setErro(txErro("Não consegui ler o post."));
    } finally {
      setEnviando(false);
    }
  }

  const [aberto, setAberto] = useState(false);
  const escolhido = personagens.find((c) => c.id === characterId);
  const rotulo = "text-[12px] font-semibold text-nido-soft";
  const campo =
    "h-11 w-full rounded-xl border border-white/10 bg-nido-bg px-3.5 text-[14px] text-nido-ink transition hover:border-white/20 focus:border-nido-yellow focus:outline-none";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && !enviando && onFechar()}
    >
      <div
        className={cn(
          cartao,
          "grid w-full max-w-lg gap-5 rounded-b-none bg-[#151314] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] sm:rounded-b-[18px]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="text-[17px] font-bold">
              {tx("Adicionar link de post")}
            </h2>
            <p className="text-[13px] leading-relaxed text-nido-mute">
              {tx(
                "Postou por fora (baixou o vídeo ou a imagem e publicou à mão)? Cole o link do post e as métricas públicas entram no Dashboard.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            aria-label={tx("Fechar")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-nido-mute hover:text-nido-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative grid gap-1.5">
          <span className={rotulo}>{tx("Personagem")}</span>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={aberto}
            className={cn(
              campo,
              "flex items-center gap-2.5 pl-2 text-left",
              aberto && "border-nido-yellow",
            )}
          >
            {escolhido ? <Capa personagem={escolhido} /> : null}
            <span className="min-w-0 flex-1 truncate font-medium">
              {escolhido
                ? escolhido.identidade.nome || tx("Sem nome")
                : tx("Personagem")}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-nido-mute transition",
                aberto && "rotate-180",
              )}
            />
          </button>
          {aberto ? (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setAberto(false)}
                aria-hidden
              />
              <ul
                role="listbox"
                className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1718] p-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] [scrollbar-width:thin]"
              >
                {personagens.map((c) => {
                  const ativo = c.id === characterId;
                  return (
                    <li key={c.id} role="option" aria-selected={ativo}>
                      <button
                        type="button"
                        onClick={() => {
                          setCharacterId(c.id);
                          setAberto(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] transition",
                          ativo
                            ? "bg-nido-yellow/10 text-nido-ink"
                            : "text-nido-soft hover:bg-white/[0.05] hover:text-nido-ink",
                        )}
                      >
                        <Capa personagem={c} />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {c.identidade.nome || tx("Sem nome")}
                        </span>
                        {ativo ? (
                          <Check className="h-4 w-4 shrink-0 text-nido-yellow" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
        <label className="grid gap-1.5">
          <span className={rotulo}>{tx("Link do post")}</span>
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setErro(null);
            }}
            placeholder="https://www.instagram.com/reel/…"
            className={cn(campo, "placeholder:text-nido-dim")}
            autoFocus
          />
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
            <span className="flex gap-1">
              {REDES.map((r) => (
                <span
                  key={r}
                  title={INFO_REDES[r].nome}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-lg border transition",
                    rede === r
                      ? "border-nido-yellow bg-nido-yellow/15 text-nido-yellow"
                      : "border-white/[0.08] text-nido-dim",
                  )}
                >
                  <IconeRede rede={r} />
                </span>
              ))}
            </span>
            <span className="text-[12px] text-nido-mute">
              {rede
                ? INFO_REDES[rede].nome
                : url.trim()
                  ? tx("Não reconheci esse link como um post.")
                  : tx("O post precisa ser público.")}
            </span>
          </span>
        </label>
        {erro ? (
          <div className="rounded-xl border border-pink/40 bg-pink/10 px-3.5 py-2.5 text-sm text-pink">
            {erro}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-3">
          {enviando ? (
            <span className={cn(mono, "mr-auto text-[11px] text-nido-mute")}>
              {tx("Lendo o post… pode levar até 1 minuto.")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onFechar}
            disabled={enviando}
            className="h-10 rounded-full px-4 text-[13.5px] font-semibold text-nido-mute transition hover:text-nido-ink disabled:opacity-50"
          >
            {tx("Cancelar")}
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={enviando || !rede || !characterId}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-nido-yellow px-5 text-[13.5px] font-bold text-nido-bg transition hover:bg-nido-yellow-hi disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-nido-dim"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {tx("Adicionar")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Views de um post por link: clique para digitar o número (ex.: impressões do
 * LinkedIn, que só o autor vê). Vazio volta a valer o que a rede informa.
 */
function EditarViews({
  post: p,
  valor,
  onSalvo,
}: {
  post: PostMetricas;
  valor: number;
  onSalvo: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const limpo = texto.replace(/\D/g, "");
    const views = limpo ? Number(limpo) : null;
    setEditando(false);
    // Nada mudou: não chama o servidor.
    if (views === (p.viewsManual ? valor : null)) return;
    setSalvando(true);
    try {
      await fetch("/api/social/metricas/links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, views }),
      });
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  if (editando)
    return (
      <span className="inline-flex items-center gap-1">
        <Eye className="h-3 w-3 text-nido-yellow" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value.replace(/\D/g, ""))}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setEditando(false);
          }}
          inputMode="numeric"
          maxLength={12}
          placeholder={tx("views")}
          aria-label={tx("Visualizações")}
          autoFocus
          className="h-6 w-20 rounded-md border border-nido-yellow bg-nido-bg px-1.5 text-[12px] text-nido-ink focus:outline-none"
        />
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => {
        setTexto(p.viewsManual ? String(valor) : "");
        setEditando(true);
      }}
      disabled={salvando}
      title={tx(
        p.viewsManual
          ? "Views digitadas por você. Clique para mudar; vazio volta ao número da rede."
          : "Clique para digitar as views (ex.: impressões do LinkedIn, que só você vê).",
      )}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 transition hover:border-nido-yellow hover:text-nido-yellow",
        p.viewsManual
          ? "border-nido-yellow/40 text-nido-yellow"
          : "border-white/15",
      )}
    >
      <Eye className="h-3 w-3" />
      {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : num(valor)}
      <Pencil className="h-2.5 w-2.5 opacity-70" />
    </button>
  );
}

function Capa({
  personagem: c,
  redonda,
}: {
  personagem: Character;
  redonda?: boolean;
}) {
  const capa = capaSrc(c);
  return (
    <span
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center overflow-hidden bg-[linear-gradient(135deg,#4a3820,#aa7d43)] text-[10px] font-bold text-nido-ink",
        redonda ? "rounded-full" : "rounded-lg",
      )}
    >
      {capa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={capa} alt="" className="h-full w-full object-cover object-top" />
      ) : (
        (c.identidade.nome || "?").slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

/** Posts cadastrados por link: o que foi lido de cada um, o link e o remover. */
function PostsPorLink({
  posts,
  onMudou,
}: {
  posts: PostMetricas[];
  onMudou: () => void;
}) {
  const personagens = useCharacters((s) => s.characters);
  if (!posts.length) return null;

  async function remover(id: string) {
    const ok = await confirmar({
      titulo: tx("Remover este post do Dashboard?"),
      mensagem:
        "As métricas dele saem das contas. O post continua na rede social.",
      confirmar: "Remover",
      tom: "perigo",
    });
    if (!ok) return;
    await fetch(`/api/social/posts/${id}`, { method: "DELETE" });
    onMudou();
  }

  return (
    <section className={cn(cartao, "flex min-w-0 flex-col overflow-hidden")}>
      <div className="flex items-baseline justify-between gap-3 px-[22px] py-[18px]">
        <h3 className="text-[15px] font-semibold">{tx("Posts por link")}</h3>
        <span className={cn(mono, "text-[11px] text-nido-mute")}>
          {tx("publicados por fora · métricas públicas · views editáveis")}
        </span>
      </div>
      {posts.map((p) => {
        const rede = p.redes[0];
        const m = p.metricas[rede];
        const c = personagens.find((x) => x.id === p.characterId);
        return (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] px-[22px] py-3"
          >
            <IconeRede rede={rede} className="h-4 w-4 text-nido-soft" />
            <span className="flex min-w-0 flex-1 basis-[220px] flex-col gap-0.5">
              <span className="truncate text-[13.5px] font-semibold">
                {p.texto || INFO_REDES[rede].nome}
              </span>
              <span className="truncate text-[11.5px] text-[#8a8278]">
                {c ? c.identidade.nome || tx("Sem nome") : tx("Personagem removido")}{" "}
                ·{" "}
                {new Date(p.quando).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "2-digit",
                })}
              </span>
            </span>
            <span className={cn(mono, "flex flex-wrap gap-x-3.5 text-[12px] text-nido-soft")}>
              <EditarViews post={p} valor={m?.views ?? 0} onSalvo={onMudou} />
              {KPIS.slice(1).map(({ campo, icon: Icon, rotulo }) => (
                <span
                  key={campo}
                  title={tx(rotulo)}
                  className="inline-flex items-center gap-1"
                >
                  <Icon className="h-3 w-3 text-nido-dim" />
                  {num(m?.[campo] ?? 0)}
                </span>
              ))}
            </span>
            <span className="flex items-center gap-1">
              {p.link ? (
                <a
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={tx("Ver post")}
                  aria-label={tx("Ver post")}
                  className="grid h-8 w-8 place-items-center rounded-full text-nido-mute hover:text-nido-yellow"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => remover(p.id)}
                title={tx("Remover")}
                aria-label={tx("Remover")}
                className="grid h-8 w-8 place-items-center rounded-full text-nido-dim hover:text-pink"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        );
      })}
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-dashed border-white/[0.14] px-4 py-14 text-center text-[14px] text-nido-mute">
      {children}
    </div>
  );
}

function Kpis({ resumo, periodo }: { resumo: Resumo; periodo: Periodo }) {
  return (
    <div
      className={cn(
        cartao,
        "grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] overflow-hidden",
      )}
    >
      {KPIS.map(({ campo, rotulo, icon: Icon }) => {
        const d = variacao(resumo.atual[campo], resumo.anterior[campo]);
        return (
          <div
            key={campo}
            className="flex flex-col gap-2.5 border-b border-r border-white/[0.06] px-6 py-[22px]"
          >
            <span
              className={cn(
                mono,
                "flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-nido-mute",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tx(rotulo)}
            </span>
            <span
              className={cn(
                "font-archivo text-[38px] font-extrabold leading-none tracking-[-0.02em] [font-stretch:112%]",
                campo === "views" ? "text-nido-yellow" : "text-nido-paper",
              )}
            >
              {num(resumo.atual[campo])}
            </span>
            <span
              className={cn(
                mono,
                "text-[11px]",
                d === null
                  ? "text-nido-dim"
                  : d < 0
                    ? "text-[#ff6b5e]"
                    : "text-[#56d364]",
              )}
            >
              {d === null
                ? "—"
                : `${d < 0 ? "−" : "+"}${Math.abs(Math.round(d))}%`}{" "}
              {tx("vs")} {periodo}d {tx("anteriores")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Grafico({ resumo, periodo }: { resumo: Resumo; periodo: Periodo }) {
  const max = Math.max(...resumo.barras.map((b) => b.views), 1) * 1.12;
  const colunas = {
    gridTemplateColumns: `repeat(${resumo.barras.length}, minmax(0, 1fr))`,
  };
  const rotulo = (d: Date) =>
    periodo === 7
      ? d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return (
    <section className={cn(cartao, "flex flex-col gap-[18px] p-6")}>
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-[15px] font-semibold">{tx("Visualizações")}</h3>
        <span className={cn(mono, "text-[11px] text-nido-mute")}>
          {tx("últimos")} {periodo} {tx("dias")} ·{" "}
          {periodo === 7
            ? tx("por dia")
            : `${tx("a cada")} ${resumo.barras[0]?.dias} ${tx("dias")}`}{" "}
          · {resumo.posts} {resumo.posts === 1 ? "post" : "posts"}
        </span>
      </div>
      <div
        style={colunas}
        className="grid h-[220px] items-end gap-2.5 border-b border-white/[0.08] bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:100%_55px] pt-6"
      >
        {resumo.barras.map((b) => {
          const altura = `${((b.views / max) * 100).toFixed(1)}%`;
          return (
            <div
              key={b.inicio.getTime()}
              className="relative flex h-full flex-col justify-end"
            >
              {b.views > 0 ? (
                <span
                  style={{ bottom: `calc(${altura} + 6px)` }}
                  className={cn(
                    mono,
                    "absolute inset-x-0 text-center text-[10.5px] text-nido-soft",
                  )}
                >
                  {num(b.views)}
                </span>
              ) : null}
              <div
                style={{ height: altura }}
                className="rounded-t-md bg-[linear-gradient(180deg,#fdf327,#c9bf1d)] shadow-[0_0_18px_-6px_rgba(253,243,39,0.6)]"
              />
            </div>
          );
        })}
      </div>
      <div style={colunas} className="grid gap-2.5">
        {resumo.barras.map((b) => (
          <span
            key={b.inicio.getTime()}
            className={cn(
              mono,
              "text-center text-[10.5px] capitalize text-nido-dim",
            )}
          >
            {rotulo(b.inicio)}
          </span>
        ))}
      </div>
    </section>
  );
}

function TabelaPersonagens({
  linhas: linhasComPost,
  completa,
  so,
}: {
  linhas: LinhaPersonagem[];
  completa?: boolean;
  /** Mostra só este personagem (filtro da aba "Por personagem"). */
  so?: string | null;
}) {
  const personagens = useCharacters((s) => s.characters);
  // Personagens sem post no período entram no fim, zerados.
  const comPost = new Set(linhasComPost.map((l) => l.characterId));
  const linhas: LinhaPersonagem[] = [
    ...linhasComPost,
    ...personagens
      .filter((c) => !comPost.has(c.id) && (!so || c.id === so))
      .map((c) => ({ characterId: c.id, posts: 0, total: ZERO, melhor: null })),
  ];
  // Na aba "Por personagem" entram todas as métricas; na visão geral, só o essencial.
  const colunas: Array<{
    rotulo: string;
    valor: (l: LinhaPersonagem) => string;
  }> = [
    { rotulo: "Posts", valor: (l) => String(l.posts) },
    { rotulo: "Views", valor: (l) => num(l.total.views) },
    ...(completa
      ? KPIS.slice(1).map(({ campo, rotulo }) => ({
          rotulo,
          valor: (l: LinhaPersonagem) => num(l.total[campo]),
        }))
      : [{ rotulo: "Curtidas", valor: (l: LinhaPersonagem) => num(l.total.curtidas) }]),
    { rotulo: "Eng.", valor: (l) => pct(engajamento(l.total)) },
  ];
  const grade = {
    gridTemplateColumns: `minmax(${completa ? 180 : 0}px, 1.6fr) repeat(${colunas.length}, minmax(${completa ? 84 : 60}px, ${completa ? "1fr" : "0.6fr"}))`,
  };

  return (
    <section className={cn(cartao, "flex min-w-0 flex-col overflow-hidden")}>
      <div className="flex items-baseline justify-between gap-3 px-[22px] py-[18px]">
        <h3 className="text-[15px] font-semibold">{tx("Por personagem")}</h3>
        <span className={cn(mono, "text-[11px] text-nido-mute")}>
          {tx("ordenado por visualizações")}
        </span>
      </div>
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className={cn(completa && "min-w-[860px]")}>
          <div
            style={grade}
            className={cn(
              mono,
              "grid gap-3 border-t border-white/[0.06] px-[22px] py-2.5 text-[10px] uppercase tracking-[0.12em] text-nido-dim",
            )}
          >
            <span>{tx("Personagem")}</span>
            {colunas.map((c) => (
              <span key={c.rotulo} className="text-right">
                {tx(c.rotulo)}
              </span>
            ))}
          </div>
          {linhas.length === 0 ? (
            <p className="border-t border-white/[0.06] px-[22px] py-8 text-center text-[13px] text-nido-mute">
              {tx("Nenhum post publicado neste período.")}
            </p>
          ) : null}
          {linhas.map((l) => {
            const c = personagens.find((x) => x.id === l.characterId);
            const nome = c
              ? c.identidade.nome || tx("Sem nome")
              : tx("Personagem removido");
            const capa = c ? capaSrc(c) : undefined;
            const eng = engajamento(l.total);
            const conteudo = (
              <>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-[linear-gradient(135deg,#4a3820,#aa7d43)] text-[11px] font-bold">
                    {capa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={capa}
                        alt=""
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      nome.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13.5px] font-semibold">
                      {nome}
                    </span>
                    <span className="truncate text-[11.5px] text-[#8a8278]">
                      {l.melhor
                        ? `${tx("melhor em")} ${INFO_REDES[l.melhor].nome}`
                        : tx(
                            l.posts
                              ? "sem views ainda"
                              : "sem publicação no período",
                          )}
                    </span>
                  </span>
                </span>
                {colunas.map((col, i) => (
                  <span
                    key={col.rotulo}
                    className={cn(
                      mono,
                      "text-right text-[12.5px]",
                      i === colunas.length - 1
                        ? eng >= 0.05
                          ? "text-nido-yellow"
                          : "text-nido-soft"
                        : i === 0
                          ? "text-nido-soft"
                          : "text-nido-ink",
                    )}
                  >
                    {col.valor(l)}
                  </span>
                ))}
              </>
            );
            const classe =
              "grid items-center gap-3 border-t border-white/[0.06] px-[22px] py-3";
            return c ? (
              <Link
                key={l.characterId}
                href={`/app/personagem/${c.id}`}
                style={grade}
                className={cn(classe, "transition hover:bg-white/[0.025]")}
              >
                {conteudo}
              </Link>
            ) : (
              <div key={l.characterId} style={grade} className={classe}>
                {conteudo}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PorRede({ resumo }: { resumo: Resumo }) {
  const total = resumo.redes.reduce((n, r) => n + r.views, 0);
  return (
    <section
      className={cn(cartao, "flex flex-col gap-4 px-[22px] pb-[22px] pt-[18px]")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{tx("Por rede")}</h3>
        <span className={cn(mono, "text-[11px] text-nido-mute")}>
          {tx("% das visualizações")}
        </span>
      </div>
      {resumo.redes.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-nido-mute">
          {tx("Nenhum post publicado neste período.")}
        </p>
      ) : null}
      {resumo.redes.map(({ rede, views }) => {
        const parte = total ? (views / total) * 100 : 0;
        return (
          <div key={rede} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-2 font-medium">
                <IconeRede rede={rede} className="h-[15px] w-[15px]" />
                {INFO_REDES[rede].nome}
              </span>
              <span className={cn(mono, "text-nido-soft")}>
                {num(views)} · {Math.round(parte)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-md bg-white/[0.06]">
              <div
                style={{ width: `${parte.toFixed(1)}%` }}
                className="h-full rounded-md bg-[linear-gradient(90deg,#aa7d43,#fdf327)]"
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}
