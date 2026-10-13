"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
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
import { CREDITOS_POST_POR_REDE } from "@/lib/planos";
import {
  INFO_REDES,
  MAX_TITULO_YOUTUBE,
  problemasDoPost,
  REDES,
  type Rede,
} from "@/lib/social/redes";
import { Textarea } from "@/components/ui/Input";
import { confirmar } from "@/components/ui/Confirmacao";
import {
  CalendarioPosts,
  CORES_TOM,
} from "@/components/estudio/CalendarioPosts";
import { paraValor, SeletorHorario } from "@/components/estudio/SeletorHorario";
import { usePublicacao, type Post } from "@/components/estudio/Publicar";
import { tx } from "@/lib/i18n/tx";
import { IconeRede, IconesRedes } from "@/components/ui/IconeRede";
import { txErro } from "@/lib/i18n/erros";

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Agendamentos do influencer: calendário com tudo que foi agendado e
 * publicado (com o status em cada post) e o Backlog — posts prontos, sem
 * data, para agendar ou publicar quando quiser.
 */
export function Agendamentos({ character }: { character: Character }) {
  const recursos = useRecursos();
  const router = useRouter();
  const { estado, carregando, erroCarga, carregar } = usePublicacao(
    character.id,
  );
  const [erro, setErro] = useState<string | null>(null);

  if (!recursos.social)
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-[14px] text-ink-dim">
        {tx(
          "A publicação nas redes não está configurada neste deploy (BUNDLE_SOCIAL).",
        )}
      </div>
    );
  if (carregando && !estado)
    return (
      <div className="py-10 grid place-items-center text-ink-dim">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );

  const posts = estado?.posts ?? [];
  const backlog = posts.filter((p) => p.status === "BACKLOG");

  async function cancelar(id: string) {
    const ok = await confirmar({
      titulo: tx("Cancelar este agendamento?"),
      mensagem:
        "O post sai da fila e volta para o Backlog, onde você pode editar e agendar de novo. Os créditos são devolvidos.",
      confirmar: "Cancelar agendamento",
      cancelar: "Manter agendado",
      tom: "perigo",
    });
    if (!ok) return;
    const r = await fetch(`/api/social/posts/${id}`, { method: "DELETE" });
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    avisarCreditos();
    if (!r.ok) setErro(txErro(b.error ?? "Não consegui cancelar."));
    carregar();
  }

  /** Arrastou um post agendado para outro dia: muda a data (a hora fica). */
  async function mover(id: string, quando: Date) {
    setErro(null);
    const r = await fetch(`/api/social/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quando: quando.toISOString() }),
    }).catch(() => null);
    const b = (await r?.json().catch(() => ({}))) as
      | { error?: string }
      | undefined;
    if (!r?.ok) setErro(txErro(b?.error ?? "Não consegui mover o post."));
    await carregar();
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-3 min-w-0">
        {erroCarga ? <ErroGeracao mensagem={erroCarga} /> : null}
        {erro ? <ErroGeracao mensagem={erro} /> : null}
        <CalendarioPosts
          posts={posts}
          onCancelar={cancelar}
          onAtualizar={carregar}
          onMover={mover}
          onAgendarDia={(d) =>
            router.replace(
              `?aba=estudio&secao=publicar&dia=${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
              { scroll: false },
            )
          }
        />
      </div>

      <section className="grid gap-3 min-w-0 border-t border-line pt-6">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-ink inline-flex items-center gap-2">
            <Archive className="w-4 h-4 text-violet-300" /> {tx("Backlog")}
            <span className="text-ink-dim font-normal">· {backlog.length}</span>
          </h3>
          <Link
            href="?aba=estudio&secao=publicar"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> {tx("Novo post")}
          </Link>
        </div>
        {backlog.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-3.5 py-6 text-center text-[13px] text-ink-dim">
            {tx(
              "Posts prontos sem data ficam aqui. Em Publicar, escolha “Salvar no backlog”.",
            )}
          </p>
        ) : (
          // Colunas pela largura que sobra (cartão de ~260px, no máximo 3): com breakpoint de tela e o menu do app aberto, em 1280px o cartão ficava com 220px e os botões saíam dele.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,max(260px,calc((100%_-_1.5rem)_/_3))),1fr))] gap-3">
            {backlog.map((p) => (
              <ItemBacklog key={p.id} post={p} onMudou={carregar} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ItemBacklog({
  post: p,
  onMudou,
}: {
  post: Post;
  onMudou: () => void;
}) {
  const { conta } = useCreditos();
  const [agendando, setAgendando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [quando, setQuando] = useState(() => {
    const d = new Date(Date.now() + 3600_000);
    d.setMinutes(0, 0, 0);
    return paraValor(d);
  });
  const [ocupado, setOcupado] = useState<"agendar" | "agora" | "apagar" | null>(
    null,
  );
  const [erro, setErro] = useState<{ msg: string; code?: string } | null>(null);
  const custo = p.redes.length * CREDITOS_POST_POR_REDE;

  async function enviar(agora: boolean) {
    setErro(null);
    setOcupado(agora ? "agora" : "agendar");
    try {
      const r = await fetch(`/api/social/posts/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quando: agora ? undefined : new Date(quando).toISOString(),
        }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!r.ok)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${r.status}).`),
          code: b.code,
        });
      setAgendando(false);
      onMudou();
    } finally {
      setOcupado(null);
    }
  }

  async function apagar() {
    const ok = await confirmar({
      titulo: tx("Apagar este post do backlog?"),
      mensagem:
        "A legenda e as escolhas de redes deste post somem. O vídeo/imagem continua no Estúdio.",
      confirmar: "Apagar",
      tom: "perigo",
    });
    if (!ok) return;
    setOcupado("apagar");
    try {
      await fetch(`/api/social/posts/${p.id}`, { method: "DELETE" });
      onMudou();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="rounded-xl border border-violet-500/30 bg-panel p-3 grid gap-2.5">
      <div className="flex gap-3">
        <div className="w-11 aspect-[9/16] rounded-md overflow-hidden bg-black shrink-0">
          {p.midiaKey ? (
            p.midiaTipo === "video" ? (
              <video
                src={fileUrl(p.midiaKey)}
                preload="metadata"
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl(p.midiaKey)}
                alt=""
                className="h-full w-full object-cover object-top"
              />
            )
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded border",
              CORES_TOM.backlog,
            )}
          >
            {tx("Backlog")}
          </span>
          <p className="text-[12px] text-ink-mute line-clamp-3 mt-1">
            {p.titulo || p.texto || "—"}
          </p>
          <IconesRedes redes={p.redes} className="text-ink-mute mt-1.5" />
        </div>
      </div>

      {agendando ? (
        <div className="grid gap-2">
          <SeletorHorario valor={quando} onChange={setQuando} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="accent"
              onClick={() => enviar(false)}
              disabled={!!ocupado || new Date(quando).getTime() < Date.now()}
            >
              {ocupado === "agendar" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CalendarClock className="w-3.5 h-3.5" />
              )}
              {tx("Agendar")}
              {conta ? ` · ${custo} cr` : ""}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAgendando(false)}
              disabled={!!ocupado}
            >
              {tx("Voltar")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="accent"
            onClick={() => setAgendando(true)}
            disabled={!!ocupado}
          >
            <CalendarClock className="w-3.5 h-3.5" /> {tx("Agendar")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditando(true)}
            disabled={!!ocupado}
          >
            <Pencil className="w-3.5 h-3.5" /> {tx("Editar")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => enviar(true)}
            disabled={!!ocupado}
          >
            {ocupado === "agora" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {tx("Agora")}
          </Button>
          <button
            type="button"
            onClick={apagar}
            disabled={!!ocupado}
            className="ml-auto h-8 w-8 grid place-items-center rounded-full text-ink-dim hover:text-pink"
            title={tx("Apagar do backlog")}
            aria-label={tx("Apagar do backlog")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {erro ? <ErroGeracao mensagem={erro.msg} code={erro.code} /> : null}
      {editando && (
        <EditarPost
          post={p}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false);
            onMudou();
          }}
        />
      )}
    </div>
  );
}

/** Editar um post do backlog: legenda, título (YouTube) e redes. Cabe na tela, sem barra de rolagem. */
function EditarPost({
  post: p,
  onFechar,
  onSalvo,
}: {
  post: Post;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [redes, setRedes] = useState<Rede[]>(p.redes);
  const [texto, setTexto] = useState(p.texto);
  const [titulo, setTitulo] = useState(p.titulo ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const problemas = problemasDoPost({
    redes,
    texto,
    titulo,
    midiaTipo: p.midiaTipo,
  });

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const r = await fetch(`/api/social/posts/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redes,
          texto,
          titulo: redes.includes("YOUTUBE") ? titulo : undefined,
        }),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
      onSalvo();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className="card w-full max-w-3xl h-[min(620px,92dvh)] grid grid-rows-[auto_1fr] sm:grid-rows-1 sm:grid-cols-[minmax(0,280px)_1fr] overflow-hidden rounded-t-3xl sm:rounded-3xl">
        {/* grid-rows-[minmax(0,1fr)]: sem a linha presa à altura da caixa, um vídeo em pé crescia até a largura da tela e cobria o resto do modal no celular. */}
        <div className="bg-black grid grid-rows-[minmax(0,1fr)] place-items-center min-h-0 h-[30dvh] sm:h-full">
          {p.midiaKey ? (
            p.midiaTipo === "video" ? (
              <video
                src={fileUrl(p.midiaKey)}
                controls
                playsInline
                className="h-full w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileUrl(p.midiaKey)}
                alt=""
                className="h-full w-full object-contain"
              />
            )
          ) : (
            <span className="text-[13px] text-ink-dim">
              {tx("Post só com texto")}
            </span>
          )}
        </div>
        <div className="flex flex-col min-h-0">
          <header className="flex items-center gap-3 px-5 py-4 border-b border-line">
            <h2 className="flex-1 text-[17px] font-bold text-ink">
              {tx("Editar post do backlog")}
            </h2>
            <button
              type="button"
              onClick={onFechar}
              className="h-9 w-9 grid place-items-center rounded-full border border-line text-ink-mute hover:text-ink"
              aria-label={tx("Fechar")}
            >
              <X className="w-4 h-4" />
            </button>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-5 grid content-start gap-4">
            <div>
              <div className="text-[12px] font-semibold text-ink mb-2">
                {tx("Onde publicar")}
              </div>
              <div className="flex gap-2 flex-wrap">
                {REDES.map((r) => {
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
                        "inline-flex items-center gap-1.5 rounded-full h-8 px-3.5 text-[12px] font-semibold border transition",
                        ativo
                          ? "bg-accent text-bg border-accent"
                          : "border-line text-ink-mute hover:text-ink",
                      )}
                    >
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
                  className="w-full h-10 rounded-xl border border-line bg-bg px-3.5 text-[14px] text-ink focus:outline-none focus:border-accent"
                />
              </div>
            )}
            <div>
              <div className="text-[12px] font-semibold text-ink mb-2">
                {tx("Legenda")}
              </div>
              <Textarea
                rows={8}
                maxLength={5000}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
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
            {problemas.length > 0 && (
              <ul className="text-[12px] text-pink grid gap-0.5">
                {problemas.map((x) => (
                  <li key={x}>• {x}</li>
                ))}
              </ul>
            )}
            {erro ? <ErroGeracao mensagem={erro} /> : null}
          </div>
          <footer className="flex justify-end gap-2 px-5 py-4 border-t border-line">
            <Button variant="ghost" onClick={onFechar} disabled={salvando}>
              {tx("Voltar")}
            </Button>
            <Button
              variant="accent"
              onClick={salvar}
              disabled={salvando || problemas.length > 0}
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {tx("Salvar alterações")}
            </Button>
          </footer>
        </div>
      </div>
    </div>
  );
}
