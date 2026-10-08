"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  Eye,
  FileDown,
  Heart,
  Loader2,
  MessageCircle,
  Quote,
  Repeat2,
} from "lucide-react";
import type { DashboardAdmin, MetricasAdmin } from "@/lib/admin/consultas";
import { IconeRede } from "@/components/ui/IconeRede";
import { cn } from "@/lib/cn";
import type { PostMetricas } from "@/lib/social/metricas";
import { resumir, type Periodo } from "@/lib/social/painel";
import { INFO_REDES, REDES, type Rede } from "@/lib/social/redes";
import {
  Avatar,
  Busca,
  dia,
  diaHora,
  Estado,
  Filtros,
  Kpi,
  num,
  Secao,
  Selo,
  Tabela,
  useAdmin,
} from "./partes";

type Dias = "7" | "30" | "90";
type Quais = "todos" | "comPost";

const METRICAS: Array<{
  campo: Exclude<keyof MetricasAdmin, "posts">;
  rotulo: string;
  icone: React.ComponentType<{ className?: string }>;
}> = [
  { campo: "views", rotulo: "Visualizações", icone: Eye },
  { campo: "curtidas", rotulo: "Curtidas", icone: Heart },
  { campo: "comentarios", rotulo: "Comentários", icone: MessageCircle },
  { campo: "reposts", rotulo: "Reposts", icone: Repeat2 },
  { campo: "quotes", rotulo: "Quotes", icone: Quote },
  { campo: "salvos", rotulo: "Salvamentos", icone: Bookmark },
];

const compacto = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const nomeRede = (r: string) => INFO_REDES[r as Rede]?.nome ?? r;
const ehRede = (r: string): r is Rede => (REDES as readonly string[]).includes(r);

/** Interações (curtidas, comentários, reposts, quotes e salvamentos) ÷ views. */
function engajamento(m: MetricasAdmin): string {
  if (!m.views) return "—";
  const interacoes =
    m.curtidas + m.comentarios + m.reposts + m.quotes + m.salvos;
  return `${((interacoes / m.views) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function variacao(atual: number, anterior: number, dias: Dias): string {
  if (!anterior) return `sem base nos ${dias}d anteriores`;
  const d = Math.round(((atual - anterior) / anterior) * 100);
  return `${d < 0 ? "−" : "+"}${Math.abs(d)}% vs ${dias}d anteriores`;
}

/**
 * Dashboard do admin: alcance e engajamento de todos os influencers criados na
 * plataforma, pelos posts publicados no período (pelo app ou cadastrados por link).
 */
export function DashboardInfluencers({
  abrirUsuario,
}: {
  abrirUsuario: (id: string) => void;
}) {
  const [dias, setDias] = useState<Dias>("30");
  const [quais, setQuais] = useState<Quais>("todos");
  const [busca, setBusca] = useState("");
  const { dados, erro, carregando } = useAdmin<DashboardAdmin>(
    `/api/admin/dashboard?dias=${dias}`,
  );

  const comPosts = dados?.personagens.filter((p) => p.posts > 0) ?? [];
  const comPost = comPosts.length;

  // Relatório em PDF (o mesmo do Dashboard do usuário): de todos ou de um influencer (`alvo`).
  const [menuPdf, setMenuPdf] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState<string | null>(null);
  async function baixarPdf(alvo: string | null) {
    if (!dados) return;
    setMenuPdf(false);
    setErroPdf(null);
    setGerandoPdf(true);
    try {
      const r = await fetch(`/api/admin/dashboard/posts?dias=${dias}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { posts } = (await r.json()) as { posts: PostMetricas[] };
      const doAlvo = posts.filter((p) => !alvo || p.characterId === alvo);
      const periodo = Number(dias) as Periodo;
      const resumo = resumir(doAlvo, periodo);
      const { baixarRelatorioPdf, capaParaPdf } = await import(
        "@/lib/social/relatorio-pdf"
      );
      // Fotos só de quem aparece no relatório (as do admin são links assinados).
      const noRelatorio = new Set(doAlvo.map((p) => p.characterId));
      const fotos = await Promise.all(
        dados.personagens
          .filter((p) => p.capa && noRelatorio.has(p.id))
          .map(
            async (p) =>
              [p.id, await capaParaPdf(p.capa!, alvo ? 240 : 128)] as const,
          ),
      );
      await baixarRelatorioPdf({
        personagem: alvo
          ? (dados.personagens.find((p) => p.id === alvo)?.nome ?? "Influencer")
          : null,
        personagemId: alvo,
        tituloTodos: "Todos os influencers",
        periodo,
        resumo,
        posts: doAlvo,
        nomes: new Map(dados.personagens.map((p) => [p.id, p.nome])),
        avatares: new Map(
          fotos.filter((f): f is readonly [string, string] => !!f[1]),
        ),
      });
    } catch (e) {
      console.error("[admin/dashboard] pdf", e);
      setErroPdf("Não consegui gerar o PDF. Tente de novo.");
    } finally {
      setGerandoPdf(false);
    }
  }
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.personagens ?? []).filter(
      (p) =>
        (quais === "todos" || p.posts > 0) &&
        (!q ||
          p.nome.toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q)),
    );
  }, [dados, quais, busca]);
  const maxDia = Math.max(...(dados?.porDia.map((d) => d.views) ?? []), 1);
  const totalRedes = dados?.redes.reduce((t, r) => t + r.views, 0) ?? 0;

  return (
    <div className="grid gap-8">
      <Secao
        titulo="Dashboard dos influencers"
        descricao="Alcance e engajamento de todos os influencers da plataforma, pelos posts publicados no período."
        acoes={
          <div className="flex items-center gap-2 flex-wrap">
            {dados?.atual.posts ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuPdf((v) => !v)}
                  disabled={gerandoPdf}
                  aria-haspopup="menu"
                  aria-expanded={menuPdf}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-panel px-3.5 text-[12px] font-semibold text-ink-mute transition hover:text-ink disabled:opacity-60"
                >
                  {gerandoPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileDown className="w-3.5 h-3.5" />
                  )}
                  Baixar PDF
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 transition",
                      menuPdf && "rotate-180",
                    )}
                  />
                </button>
                {menuPdf ? (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setMenuPdf(false)}
                      aria-hidden
                    />
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-40 mt-1.5 max-h-80 w-72 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] [scrollbar-width:thin]"
                    >
                      <div className="label-cap px-2.5 pb-1.5 pt-2">
                        Relatório de · {dias}d
                      </div>
                      {[null, ...comPosts].map((p) => (
                        <button
                          key={p?.id ?? "todos"}
                          type="button"
                          role="menuitem"
                          onClick={() => baixarPdf(p?.id ?? null)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-mute transition hover:bg-panel hover:text-ink"
                        >
                          {p ? (
                            <Avatar
                              nome={p.nome}
                              imagem={p.capa}
                              tamanho="h-7 w-7"
                            />
                          ) : (
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                              <FileDown className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">
                              {p ? p.nome : "Todos os influencers"}
                            </span>
                            {p ? (
                              <span className="block truncate text-[11px] text-ink-dim">
                                {p.email ?? "usuário removido"}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-[11px] text-ink-dim tabular-nums">
                            {num(p ? p.posts : dados.atual.posts)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            <Filtros<Dias>
              rotulo="Período"
              valor={dias}
              onChange={setDias}
              opcoes={[
                { id: "7", rotulo: "7 dias" },
                { id: "30", rotulo: "30 dias" },
                { id: "90", rotulo: "90 dias" },
              ]}
            />
          </div>
        }
      >
        {erroPdf ? (
          <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
            {erroPdf}
          </div>
        ) : null}
        <Estado
          carregando={carregando}
          erro={erro}
          vazio={!dados}
          textoVazio=""
        />
        {dados ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi
                rotulo="Influencers"
                valor={num(dados.influencers.total)}
                detalhe={`${num(dados.influencers.novos)} criados no período`}
              />
              <Kpi
                rotulo="Publicaram no período"
                valor={num(dados.influencers.comPost)}
                detalhe={`de ${num(dados.influencers.contas)} ${dados.influencers.contas === 1 ? "conta" : "contas"}`}
              />
              <Kpi
                rotulo="Posts publicados"
                valor={num(dados.atual.posts)}
                detalhe={variacao(dados.atual.posts, dados.anterior.posts, dias)}
              />
              <Kpi
                rotulo="Engajamento médio"
                valor={engajamento(dados.atual)}
                detalhe="interações ÷ visualizações"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {METRICAS.map((m) => (
                <Kpi
                  key={m.campo}
                  rotulo={m.rotulo}
                  icone={m.icone}
                  valor={num(dados.atual[m.campo])}
                  detalhe={variacao(
                    dados.atual[m.campo],
                    dados.anterior[m.campo],
                    dias,
                  )}
                  destaque={m.campo === "views"}
                />
              ))}
            </div>
          </>
        ) : null}
      </Secao>

      {dados ? (
        <>
          <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6">
            <Secao
              titulo="Visualizações por dia"
              descricao="Pela data de publicação do post."
            >
              <div className="card p-4 sm:p-5">
                <div
                  className="grid items-end gap-[3px] h-44"
                  style={{
                    gridTemplateColumns: `repeat(${dados.porDia.length}, minmax(0, 1fr))`,
                  }}
                >
                  {dados.porDia.map((d) => (
                    <div
                      key={d.dia}
                      className="h-full flex flex-col justify-end"
                      title={`${dia(d.dia)} · ${num(d.views)} views · ${num(d.posts)} ${d.posts === 1 ? "post" : "posts"}`}
                    >
                      <div
                        className={
                          d.views
                            ? "rounded-t-[3px] bg-accent"
                            : "rounded-t-[3px] bg-line"
                        }
                        style={{
                          height: d.views
                            ? `${Math.max(3, (d.views / maxDia) * 100)}%`
                            : "2px",
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-ink-dim tabular-nums">
                  <span>{dia(dados.porDia[0]?.dia ?? null)}</span>
                  <span>pico: {compacto.format(maxDia === 1 ? 0 : maxDia)}</span>
                  <span>{dia(dados.porDia.at(-1)?.dia ?? null)}</span>
                </div>
              </div>
            </Secao>

            <Secao titulo="Por rede" descricao="% das visualizações.">
              <div className="card divide-y divide-line">
                {dados.redes.length ? (
                  dados.redes.map((r) => {
                    const pct = totalRedes ? (r.views / totalRedes) * 100 : 0;
                    return (
                      <div key={r.rede} className="px-4 py-3 grid gap-2">
                        <div className="flex items-center gap-2 text-[13px]">
                          {ehRede(r.rede) ? (
                            <IconeRede rede={r.rede} className="text-ink-mute" />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                            {nomeRede(r.rede)}
                          </span>
                          <span className="text-[12px] text-ink-mute whitespace-nowrap">
                            {num(r.posts)} {r.posts === 1 ? "post" : "posts"}
                          </span>
                          <span className="w-24 text-right font-bold text-ink tabular-nums whitespace-nowrap">
                            {compacto.format(r.views)} · {Math.round(pct)}%
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-line overflow-hidden">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-[13px] text-ink-mute">
                    Nenhum post publicado no período.
                  </div>
                )}
              </div>
            </Secao>
          </div>

          <Secao
            titulo="Por influencer"
            descricao="Ordenado por visualizações. Clique para abrir a conta do dono."
            acoes={
              <div className="flex items-center gap-2 flex-wrap">
                <Filtros<Quais>
                  rotulo="Quais influencers"
                  valor={quais}
                  onChange={setQuais}
                  opcoes={[
                    {
                      id: "todos",
                      rotulo: "Todos",
                      n: dados.personagens.length,
                    },
                    { id: "comPost", rotulo: "Com posts", n: comPost },
                  ]}
                />
                <Busca
                  valor={busca}
                  onChange={setBusca}
                  placeholder="Buscar por influencer ou e-mail"
                />
              </div>
            }
          >
            {lista.length ? (
              <Tabela
                colunas={[
                  "Influencer",
                  "Posts",
                  "Views",
                  "Curtidas",
                  "Coment.",
                  "Reposts",
                  "Quotes",
                  "Salvos",
                  "Eng.",
                ]}
                larguras={["", 64, 84, 80, 76, 76, 70, 70, 72]}
                minimo={900}
              >
                {lista.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => abrirUsuario(p.userId)}
                    className="hover:bg-panel/60 transition cursor-pointer"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar nome={p.nome} imagem={p.capa} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="truncate font-semibold text-ink"
                              title={p.nome}
                            >
                              {p.nome}
                            </span>
                            {p.melhor ? (
                              <Selo>{nomeRede(p.melhor)}</Selo>
                            ) : null}
                          </div>
                          <div
                            className="truncate text-[12px] text-ink-mute"
                            title={p.email ?? undefined}
                          >
                            {p.email ?? "usuário removido"} · criado em{" "}
                            {dia(p.criadoEm)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-mute tabular-nums">
                      {num(p.posts)}
                      {p.porLink ? (
                        <span
                          className="text-ink-dim"
                          title={`${num(p.porLink)} cadastrado(s) por link`}
                        >
                          {" "}
                          ({num(p.porLink)}↗)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-ink font-semibold tabular-nums">
                      {num(p.views)}
                    </td>
                    <td className="px-3 py-2.5 text-ink-mute tabular-nums">
                      {num(p.curtidas)}
                    </td>
                    <td className="px-3 py-2.5 text-ink-mute tabular-nums">
                      {num(p.comentarios)}
                    </td>
                    <td className="px-3 py-2.5 text-ink-mute tabular-nums">
                      {num(p.reposts)}
                    </td>
                    <td className="px-3 py-2.5 text-ink-mute tabular-nums">
                      {num(p.quotes)}
                    </td>
                    <td className="px-3 py-2.5 text-ink-mute tabular-nums">
                      {num(p.salvos)}
                    </td>
                    <td className="px-3 py-2.5 text-ink-mute tabular-nums whitespace-nowrap">
                      {engajamento(p)}
                    </td>
                  </tr>
                ))}
              </Tabela>
            ) : (
              <div className="card p-10 text-center text-[13px] text-ink-mute">
                Nenhum influencer encontrado.
              </div>
            )}
            <p className="text-[12px] text-ink-dim leading-relaxed">
              Os números são os já gravados: cada conta atualiza as próprias
              métricas ao abrir o Dashboard dela; esta tela não consulta as
              redes.{" "}
              {dados.atualizadoEm
                ? `Leitura mais recente: ${diaHora(dados.atualizadoEm)}.`
                : "Ainda não há leitura no período."}{" "}
              Posts com “↗” foram cadastrados por link. A lista mostra até 300
              influencers.
            </p>
          </Secao>
        </>
      ) : null}
    </div>
  );
}
