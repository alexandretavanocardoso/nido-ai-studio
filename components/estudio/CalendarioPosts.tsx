"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { fileUrl } from "@/lib/storage/client";
import {
  INFO_REDES,
  STATUS_POST,
  type Rede,
  type TipoMidia,
  type TomStatus,
} from "@/lib/social/redes";
import { tx } from "@/lib/i18n/tx";
import { IconeRede, IconesRedes } from "@/components/ui/IconeRede";

export interface PostCalendario {
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

type Visao = "semana" | "mes" | "lista";

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_NO_MES = 3;

const chaveDia = (d: Date) =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
const inicioDoDia = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const somarDias = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const domingoDa = (d: Date) => somarDias(inicioDoDia(d), -d.getDay());
const semBarra = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function corStatus(status: string) {
  return CORES_TOM[STATUS_POST[status]?.tom ?? "neutro"];
}

/** Cor de cada status: Backlog (violeta), Agendado (azul), Publicado (verde), Publicando (lima), Falhou (rosa). */
export const CORES_TOM: Record<TomStatus, string> = {
  backlog: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  agendado: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  ok: "bg-ok/15 text-ok border-ok/30",
  andamento: "bg-accent/15 text-accent border-accent/30",
  erro: "bg-pink/15 text-pink border-pink/30",
  neutro: "bg-card text-ink-mute border-line",
};
const BORDA_TOM: Record<TomStatus, string> = {
  backlog: "border-violet-400",
  agendado: "border-sky-400",
  ok: "border-ok",
  andamento: "border-accent",
  erro: "border-pink",
  neutro: "border-line-strong",
};
const PONTO_TOM: Record<TomStatus, string> = {
  backlog: "bg-violet-400",
  agendado: "bg-sky-400",
  ok: "bg-ok",
  andamento: "bg-accent",
  erro: "bg-pink",
  neutro: "bg-ink-dim",
};
const LEGENDA: Array<[string, TomStatus]> = [
  ["Agendado", "agendado"],
  ["Publicando", "andamento"],
  ["Publicado", "ok"],
  ["Falhou", "erro"],
];

/**
 * Calendário dos posts do influencer, em três visões:
 *  - Semana (padrão): uma coluna por dia com TODOS os posts — boa pra dias cheios.
 *  - Mês: grade com até 3 por dia (+N).
 *  - Lista: tudo agrupado por dia.
 * Clicar num post/dia mostra os detalhes (link, erro, cancelar) logo abaixo.
 */
export function CalendarioPosts({
  posts,
  onCancelar,
  onAtualizar,
  onAgendarDia,
}: {
  posts: PostCalendario[];
  onCancelar: (id: string) => void;
  onAtualizar: () => void;
  onAgendarDia: (d: Date) => void;
}) {
  const hoje = new Date();
  const [visao, setVisao] = useState<Visao>("semana");
  const [ref, setRef] = useState(() => inicioDoDia(hoje));
  const [diaAberto, setDiaAberto] = useState<Date>(inicioDoDia(hoje));
  const [postAberto, setPostAberto] = useState<PostCalendario | null>(null);

  const validos = useMemo(
    () =>
      posts
        .filter((x) => x.status !== "DELETED" && x.status !== "BACKLOG")
        .sort((a, b) => a.quando.localeCompare(b.quando)),
    [posts],
  );
  const porDia = useMemo(() => {
    const m = new Map<string, PostCalendario[]>();
    for (const p of validos) {
      const k = chaveDia(new Date(p.quando));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [validos]);

  // Intervalo visível e navegação.
  const mes = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const semana = domingoDa(ref);
  const dias =
    visao === "semana"
      ? Array.from({ length: 7 }, (_, i) => somarDias(semana, i))
      : Array.from({ length: 42 }, (_, i) => somarDias(domingoDa(mes), i));
  function andar(direcao: 1 | -1) {
    setRef(
      visao === "semana"
        ? somarDias(ref, 7 * direcao)
        : new Date(ref.getFullYear(), ref.getMonth() + direcao, 1),
    );
  }
  const titulo =
    visao === "semana"
      ? `${semana.getDate()} ${semana.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")} – ${somarDias(semana, 6).getDate()} ${somarDias(
          semana,
          6,
        )
          .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
          .replace(".", "")}`
      : mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const noPeriodo =
    visao === "lista"
      ? validos.length
      : dias
          .filter((d) => visao === "semana" || d.getMonth() === mes.getMonth())
          .reduce((n, d) => n + (porDia.get(chaveDia(d))?.length ?? 0), 0);
  const doDia = porDia.get(chaveDia(diaAberto)) ?? [];
  const diaFuturo = somarDias(diaAberto, 1).getTime() > Date.now();

  return (
    <section className="grid gap-3">
      {/* Barra: visão, navegação, contagem */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 border border-line rounded-full p-0.5 bg-panel">
            {(
              [
                ["semana", tx("Semana")],
                ["mes", tx("Mês")],
                ["lista", tx("Lista")],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVisao(id)}
                className={cn(
                  "px-3 h-7 rounded-full text-[12px] font-semibold transition",
                  visao === id
                    ? "bg-accent text-bg"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {visao !== "lista" && (
            <>
              <button
                type="button"
                onClick={() => andar(-1)}
                className="h-8 w-8 grid place-items-center rounded-full border border-line text-ink-mute hover:text-ink"
                aria-label={tx("Anterior")}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="text-[14px] font-semibold text-ink capitalize min-w-40 text-center">
                {titulo}
              </h3>
              <button
                type="button"
                onClick={() => andar(1)}
                className="h-8 w-8 grid place-items-center rounded-full border border-line text-ink-mute hover:text-ink"
                aria-label={tx("Próximo")}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRef(inicioDoDia(hoje));
                  setDiaAberto(inicioDoDia(hoje));
                }}
                className="h-8 px-3 rounded-full border border-line text-[12px] text-ink-mute hover:text-ink"
              >
                {tx("Hoje")}
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-dim">
            {noPeriodo} {noPeriodo === 1 ? "post" : "posts"}
          </span>
          <button
            type="button"
            onClick={onAtualizar}
            className="inline-flex items-center gap-1 text-[12px] text-ink-mute hover:text-ink"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {tx("Atualizar")}
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        {LEGENDA.map(([rotulo, tom]) => (
          <span
            key={tom}
            className="inline-flex items-center gap-1.5 text-[11px] text-ink-mute"
          >
            <span className={cn("h-2 w-2 rounded-full", PONTO_TOM[tom])} />
            {rotulo}
          </span>
        ))}
      </div>

      {/* SEMANA — uma coluna por dia, todos os posts (rola dentro da coluna) */}
      {visao === "semana" && (
        <div className={cn("overflow-x-auto -mx-1 px-1", semBarra)}>
          <div className="grid grid-cols-7 gap-2 min-w-[840px]">
            {dias.map((d) => {
              const lista = porDia.get(chaveDia(d)) ?? [];
              const ehHoje = chaveDia(d) === chaveDia(hoje);
              const aberto = chaveDia(d) === chaveDia(diaAberto);
              return (
                <div
                  key={chaveDia(d)}
                  className={cn(
                    "min-w-0 rounded-xl border bg-bg flex flex-col overflow-hidden",
                    aberto ? "border-accent" : "border-line",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setDiaAberto(d)}
                    className="flex items-center justify-between gap-1 px-2.5 py-2 border-b border-line"
                  >
                    <span className="text-[11px] font-semibold uppercase text-ink-dim">
                      {DIAS_SEMANA[d.getDay()]}
                    </span>
                    <span
                      className={cn(
                        "text-[12px] font-bold h-6 w-6 grid place-items-center rounded-full",
                        ehHoje ? "bg-accent text-bg" : "text-ink",
                      )}
                    >
                      {d.getDate()}
                    </span>
                  </button>
                  <div
                    className={cn(
                      "grid content-start gap-2 p-2 max-h-[440px] min-h-[180px] overflow-y-auto",
                      semBarra,
                    )}
                  >
                    {lista.map((p) => (
                      <ChipPost
                        key={p.id}
                        post={p}
                        grande
                        onClick={() => {
                          setDiaAberto(d);
                          setPostAberto(p);
                        }}
                      />
                    ))}
                    {lista.length === 0 &&
                      somarDias(d, 1).getTime() > Date.now() && (
                        <button
                          type="button"
                          onClick={() => onAgendarDia(d)}
                          className="h-8 rounded-lg border border-dashed border-line text-ink-dim hover:text-accent hover:border-accent/50 grid place-items-center"
                          title={tx("Agendar neste dia")}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                  </div>
                  {lista.length > 0 && (
                    <div className="px-2 py-1 border-t border-line text-[10px] text-ink-dim text-center">
                      {lista.length} {lista.length === 1 ? "post" : "posts"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MÊS — grade, até 3 por dia */}
      {visao === "mes" && (
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="grid grid-cols-7 bg-panel border-b border-line">
            {DIAS_SEMANA.map((d) => (
              <div
                key={d}
                className="py-1.5 text-center text-[11px] font-semibold text-ink-dim uppercase"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((d, i) => {
              const doMes = d.getMonth() === mes.getMonth();
              const ehHoje = chaveDia(d) === chaveDia(hoje);
              const aberto = chaveDia(d) === chaveDia(diaAberto);
              const lista = porDia.get(chaveDia(d)) ?? [];
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDiaAberto(d)}
                  onKeyDown={(e) => e.key === "Enter" && setDiaAberto(d)}
                  className={cn(
                    "min-h-[118px] p-1.5 text-left border-line transition flex flex-col gap-1 min-w-0 cursor-pointer",
                    i % 7 !== 6 && "border-r",
                    i < 35 && "border-b",
                    doMes ? "bg-bg hover:bg-panel" : "bg-bg/40",
                    aberto && "ring-2 ring-inset ring-accent",
                  )}
                >
                  <span
                    className={cn(
                      "text-[12px] font-semibold h-6 w-6 grid place-items-center rounded-full",
                      ehHoje
                        ? "bg-accent text-bg"
                        : doMes
                          ? "text-ink-mute"
                          : "text-ink-dim/60",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {lista.slice(0, MAX_NO_MES).map((p) => (
                    <ChipPost
                      key={p.id}
                      post={p}
                      onClick={(e) => {
                        e?.stopPropagation();
                        setDiaAberto(d);
                        setPostAberto(p);
                      }}
                    />
                  ))}
                  {lista.length > MAX_NO_MES && (
                    <span className="text-[10px] font-semibold text-accent px-1">
                      +{lista.length - MAX_NO_MES} mais
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LISTA — agrupada por dia */}
      {visao === "lista" && (
        <div className="grid gap-4">
          {validos.length === 0 && (
            <p className="text-[13px] text-ink-dim">
              {tx("Nenhum post agendado ou publicado ainda.")}
            </p>
          )}
          {[...porDia.entries()].map(([k, lista]) => {
            const d = new Date(lista[0].quando);
            return (
              <div key={k} className="grid gap-2">
                <div className="text-[12px] font-semibold text-ink-mute capitalize flex items-center gap-2">
                  {d.toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  <span className="text-ink-dim font-normal">
                    · {lista.length}
                  </span>
                </div>
                {lista.map((p) => (
                  <CardPost
                    key={p.id}
                    post={p}
                    onCancelar={onCancelar}
                    onAbrir={() => setPostAberto(p)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Detalhes do dia escolhido (semana e mês) */}
      {visao !== "lista" && (
        <div className="grid gap-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-ink capitalize">
              {diaAberto.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              <span className="text-ink-dim font-normal">
                {" "}
                · {doDia.length} {doDia.length === 1 ? "post" : "posts"}
              </span>
            </span>
            {diaFuturo && (
              <button
                type="button"
                onClick={() => onAgendarDia(diaAberto)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> {tx("Agendar neste dia")}
              </button>
            )}
          </div>
          {doDia.length === 0 ? (
            <p className="text-[13px] text-ink-dim">
              {tx("Nenhum post neste dia.")}
            </p>
          ) : (
            doDia.map((p) => (
              <CardPost
                key={p.id}
                post={p}
                onCancelar={onCancelar}
                onAbrir={() => setPostAberto(p)}
              />
            ))
          )}
        </div>
      )}
      {postAberto && (
        <PostModal
          post={postAberto}
          onFechar={() => setPostAberto(null)}
          onCancelar={(id) => {
            setPostAberto(null);
            onCancelar(id);
          }}
        />
      )}
    </section>
  );
}

/** Card compacto do calendário: barra de status, hora, redes e um pedaço da legenda (grande = com miniatura). */
function ChipPost({
  post: p,
  grande,
  onClick,
}: {
  post: PostCalendario;
  grande?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
}) {
  const tom = STATUS_POST[p.status]?.tom ?? "neutro";
  const texto = p.titulo || p.texto || "—";
  const conteudo = (
    <>
      <span
        className={cn(
          "flex items-center gap-1.5 font-bold text-ink leading-tight",
          grande ? "text-[12px]" : "text-[10px]",
        )}
      >
        <span
          className={cn(
            "rounded-full shrink-0",
            grande ? "h-2 w-2" : "h-1.5 w-1.5",
            PONTO_TOM[tom],
          )}
        />
        {hora(p.quando)}
        <IconesRedes
          redes={p.redes}
          className="text-ink-mute gap-1 min-w-0"
          tamanho="h-3 w-3"
        />
      </span>
      <span
        className={cn(
          "text-ink-mute leading-snug break-words",
          grande
            ? "text-[12px] line-clamp-3 mt-1"
            : "text-[10px] block truncate mt-0.5",
        )}
      >
        {texto}
      </span>
    </>
  );
  const classe = cn(
    "block w-full text-left rounded-lg bg-panel border-l-[3px]",
    grande ? "px-2.5 py-2" : "px-1.5 py-1",
    BORDA_TOM[tom],
  );
  const dica = `${hora(p.quando)} · ${tx(STATUS_POST[p.status]?.rotulo ?? p.status)} · ${p.redes
    .map((r) => INFO_REDES[r]?.nome ?? r)
    .join(", ")}\n${texto}`;
  return onClick ? (
    <button
      type="button"
      onClick={(e) => onClick(e)}
      className={cn(classe, "hover:bg-card transition")}
      title={dica}
    >
      {conteudo}
    </button>
  ) : (
    <span className={classe} title={dica}>
      {conteudo}
    </span>
  );
}

function CardPost({
  post: p,
  onCancelar,
  onAbrir,
}: {
  post: PostCalendario;
  onCancelar: (id: string) => void;
  onAbrir?: () => void;
}) {
  const st = STATUS_POST[p.status] ?? {
    rotulo: p.status,
    tom: "neutro" as const,
  };
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-panel p-3 flex gap-3",
        onAbrir && "cursor-pointer hover:border-line-strong transition",
      )}
      onClick={(e) => {
        if (onAbrir && !(e.target as HTMLElement).closest("a,button"))
          onAbrir();
      }}
    >
      <div className="w-12 aspect-[9/16] rounded-md overflow-hidden bg-black shrink-0">
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
      <div className="min-w-0 flex-1 grid gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "text-[11px] font-bold px-2 py-0.5 rounded-full border",
              corStatus(p.status),
            )}
          >
            {tx(st.rotulo)}
          </span>
          <span className="text-[12px] text-ink-mute">{hora(p.quando)}</span>
          <IconesRedes redes={p.redes} className="text-ink-mute" />
          {p.status === "SCHEDULED" &&
            new Date(p.quando).getTime() > Date.now() && (
              <button
                type="button"
                onClick={() => onCancelar(p.id)}
                className="ml-auto inline-flex items-center gap-1 text-[12px] text-ink-mute hover:text-pink"
              >
                <X className="w-3.5 h-3.5" /> {tx("Cancelar")}
              </button>
            )}
        </div>
        {p.titulo ? (
          <div className="text-[13px] font-semibold text-ink truncate">
            {p.titulo}
          </div>
        ) : null}
        <p className="text-[13px] text-ink-mute line-clamp-2">
          {p.texto || "—"}
        </p>
        {p.links && (
          <div className="flex gap-3 flex-wrap">
            {Object.entries(p.links).map(([r, url]) => (
              <a
                key={r}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> {tx("Ver no")}{" "}
                {INFO_REDES[r as Rede]?.nome ?? r}
              </a>
            ))}
          </div>
        )}
        {p.erros && (
          <ul className="text-[12px] text-pink">
            {Object.entries(p.erros).map(([r, msg]) => (
              <li key={r}>
                {INFO_REDES[r as Rede]?.nome ?? r}: {msg}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** O post aberto: mídia à esquerda, detalhes à direita. Cabe na tela (sem barra de rolagem). */
function PostModal({
  post: p,
  onFechar,
  onCancelar,
}: {
  post: PostCalendario;
  onFechar: () => void;
  onCancelar: (id: string) => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const st = STATUS_POST[p.status] ?? {
    rotulo: p.status,
    tom: "neutro" as const,
  };
  const quando = new Date(p.quando);
  const podeCancelar =
    p.status === "SCHEDULED" && quando.getTime() > Date.now();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className="card w-full max-w-3xl h-[min(600px,92vh)] grid grid-rows-[auto_1fr] sm:grid-rows-1 sm:grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-t-3xl sm:rounded-3xl">
        {/* Mídia */}
        <div className="bg-black grid place-items-center min-h-0 h-[38vh] sm:h-full">
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

        {/* Detalhes */}
        <div className="flex flex-col min-h-0 min-w-0">
          <header className="flex items-start gap-3 p-5 border-b border-line">
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  "text-[11px] font-bold px-2 py-0.5 rounded-full border",
                  CORES_TOM[st.tom],
                )}
              >
                {tx(st.rotulo)}
              </span>
              <div className="text-[15px] font-semibold text-ink mt-2 capitalize">
                {quando.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                {tx(", às")} {hora(p.quando)}
              </div>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="h-9 w-9 grid place-items-center rounded-full border border-line text-ink-mute hover:text-ink shrink-0"
              aria-label={tx("Fechar")}
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <div
            className={cn(
              "flex-1 min-h-0 overflow-y-auto p-5 grid content-start gap-4",
              semBarra,
            )}
          >
            <div className="grid gap-2.5">
              {p.redes.map((r) => {
                const erro = !p.links?.[r] ? p.erros?.[r] : null;
                return (
                  <div key={r} className="grid gap-1.5 text-[13px] min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink min-w-0 inline-flex items-center gap-2">
                        <IconeRede rede={r} className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {INFO_REDES[r]?.nome ?? r}
                        </span>
                      </span>
                      {p.links?.[r] ? (
                        <a
                          href={p.links[r]!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-accent hover:underline shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />{" "}
                          {tx("Ver post")}
                        </a>
                      ) : (
                        <span
                          className={cn(
                            "shrink-0",
                            erro ? "font-semibold text-pink" : "text-ink-dim",
                          )}
                        >
                          {tx(erro ? STATUS_POST.ERROR.rotulo : st.rotulo)}
                        </span>
                      )}
                    </div>
                    {erro ? (
                      <p className="rounded-lg border border-pink/40 bg-pink/10 px-3 py-2 text-[12px] leading-relaxed text-pink break-words">
                        {erro}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {p.titulo ? (
              <div className="text-[14px] font-semibold text-ink">
                {p.titulo}
              </div>
            ) : null}
            <p className="text-[14px] text-ink-mute whitespace-pre-wrap leading-relaxed">
              {p.texto || "—"}
            </p>
          </div>

          <footer className="flex items-center gap-2 p-4 border-t border-line">
            {p.texto && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(p.texto);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 1500);
                  } catch {
                    /* sem permissão de área de transferência */
                  }
                }}
                className="h-9 px-4 rounded-full border border-line text-[13px] font-semibold text-ink-mute hover:text-ink"
              >
                {copiado ? tx("Copiada!") : tx("Copiar legenda")}
              </button>
            )}
            {podeCancelar && (
              <button
                type="button"
                onClick={() => onCancelar(p.id)}
                className="ml-auto h-9 px-4 rounded-full border border-pink/40 text-[13px] font-semibold text-pink hover:bg-pink/10 inline-flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> {tx("Cancelar agendamento")}
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}
