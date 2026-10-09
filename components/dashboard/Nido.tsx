"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  CircleDollarSign,
  Link2,
  Loader2,
  Lock,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { capaSrc } from "@/lib/storage/client";
import { useCharacters } from "@/lib/store";

const cartao = "rounded-[18px] border border-white/[0.07] bg-nido-panel";
const mono = "font-geist-mono";

export interface CampanhaNido {
  id: string;
  tipo: "campaign" | "clip_campaign";
  titulo: string;
  status: string;
  posts: number;
  views: number;
  ganho: number;
  links: string[];
  url: string | null;
  characterId: string | null;
  /** Como a campanha foi ligada ao personagem. */
  vinculo: "manual" | "link" | null;
}

export interface ExclusivaNido {
  id: string;
  tipo: "campaign" | "clip_campaign";
  titulo: string;
  descricao: string;
  banner: string | null;
  fim: string;
  premio: number;
  token: string;
  url: string | null;
}

export interface DadosNido {
  configurado: boolean;
  temConta?: boolean;
  site?: string | null;
  usuario?: string | null;
  ganhos?: number;
  views?: number;
  mensal?: Array<{ month: string; gain: number }>;
  campanhas?: CampanhaNido[];
  exclusivas?: ExclusivaNido[];
  erro?: string | null;
}

const dolar = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: v >= 100 ? 0 : 2,
  });
const compacto = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** O que o Nido (plataforma de campanhas) tem desta conta. Null enquanto carrega. */
export function useNido() {
  const [dados, setDados] = useState<DadosNido | null>(null);
  const carregar = useCallback(() => {
    fetch("/api/nido/resumo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { configurado: false }))
      .then((b: DadosNido) => setDados(b))
      .catch(() => setDados({ configurado: false }));
  }, []);
  useEffect(() => carregar(), [carregar]);
  return { dados, recarregar: carregar };
}

/**
 * Faixa do Nido no topo do Dashboard: quanto o usuário já ganhou em campanhas
 * e as campanhas exclusivas do Studio que estão abertas (com o atalho para
 * participar lá).
 */
export function FaixaNido({ dados }: { dados: DadosNido }) {
  if (!dados.configurado) return null;
  const exclusivas = dados.exclusivas ?? [];
  const campanhas = dados.campanhas ?? [];
  if (!dados.temConta && !exclusivas.length && !dados.erro) return null;

  return (
    <div className="grid gap-3.5">
      {dados.erro ? (
        <div className="rounded-xl border border-white/10 px-4 py-3 text-[13px] text-nido-mute">
          {txErro(dados.erro)}
        </div>
      ) : null}

      {dados.temConta ? (
        <div
          className={cn(
            cartao,
            "grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] overflow-hidden",
          )}
        >
          {(
            [
              [CircleDollarSign, "Ganhos em campanhas", dolar(dados.ganhos ?? 0), true],
              [Trophy, "Campanhas que participou", String(campanhas.length), false],
            ] as const
          ).map(([Icone, rotulo, valor, destaque]) => (
            <div
              key={rotulo}
              className="flex flex-col gap-2.5 border-b border-r border-white/[0.06] px-6 py-[22px]"
            >
              <span
                className={cn(
                  mono,
                  "flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-nido-mute",
                )}
              >
                <Icone className="h-3.5 w-3.5" />
                {tx(rotulo)}
              </span>
              <span
                className={cn(
                  "font-archivo text-[38px] font-extrabold leading-none tracking-[-0.02em] [font-stretch:112%]",
                  destaque ? "text-nido-yellow" : "text-nido-paper",
                )}
              >
                {valor}
              </span>
              <span className={cn(mono, "text-[11px] text-nido-dim")}>
                {destaque
                  ? tx("pagamentos confirmados no Nido")
                  : tx("com esta conta do Google")}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {exclusivas.length ? (
        <section className={cn(cartao, "grid gap-3 p-5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <Lock className="h-4 w-4 text-nido-yellow" />
              {tx("Campanhas exclusivas do NIDO AI Studio")}
            </h3>
            <span className="text-[12px] text-nido-mute">
              {tx("Só para quem tem conta aqui. Entre no Nido com o mesmo Google.")}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3">
            {exclusivas.map((c) => (
              <article
                key={`${c.tipo}:${c.id}`}
                className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-white/[0.07] bg-nido-bg p-4"
              >
                {c.banner ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.banner}
                    alt=""
                    className="h-24 w-full rounded-xl object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-nido-ink">
                    {c.titulo}
                  </div>
                  <div className={cn(mono, "text-[11px] uppercase text-nido-dim")}>
                    {c.tipo === "clip_campaign"
                      ? tx("Campeonato de clipes")
                      : tx("Campanha")}{" "}
                    · {tx("até")} {new Date(c.fim).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                {c.descricao ? (
                  <p className="line-clamp-2 text-[12.5px] text-nido-mute">
                    {c.descricao}
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="font-archivo text-[18px] font-extrabold text-nido-yellow">
                    {compacto.format(c.premio)} {c.token}
                  </span>
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-nido-yellow px-3.5 text-[12.5px] font-bold text-nido-bg transition hover:opacity-90"
                    >
                      {tx("Participar")} <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Aba "Por campanha": as campanhas do Nido em que o usuário participou, cada
 * uma ligada a um personagem. O app liga sozinho pelo link do post registrado
 * aqui; o usuário pode escolher (ou corrigir) à mão — é o caso de quem enviou
 * o post direto no Nido.
 */
export function PorCampanha({
  dados,
  onMudou,
}: {
  dados: DadosNido | null;
  onMudou: () => void;
}) {
  const personagens = useCharacters((s) => s.characters);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(campanhaId: string, characterId: string | null) {
    setErro(null);
    setSalvando(campanhaId);
    try {
      const res = await fetch(
        `/api/nido/campanhas/${encodeURIComponent(campanhaId)}/personagem`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId }),
        },
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      }
      onMudou();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  const aviso = (texto: string) => (
    <div className="rounded-[18px] border border-dashed border-white/[0.14] px-4 py-14 text-center text-[14px] text-nido-mute">
      {texto}
    </div>
  );
  if (!dados)
    return (
      <div className="grid place-items-center py-20 text-nido-dim">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (!dados.configurado)
    return aviso(tx("A ligação com o Nido não está configurada neste deploy."));
  if (!dados.temConta)
    return aviso(
      tx(
        "Não achei uma conta de creator no Nido com o e-mail do Google desta conta. Entre no Nido com o mesmo Google e participe de uma campanha: ela aparece aqui.",
      ),
    );
  const campanhas = dados.campanhas ?? [];
  if (!campanhas.length)
    return aviso(tx("Você ainda não participou de nenhuma campanha no Nido."));

  // Totais por personagem (só campanhas já ligadas a um).
  const porPersonagem = new Map<string, { ganho: number; n: number }>();
  for (const c of campanhas)
    if (c.characterId) {
      const t = porPersonagem.get(c.characterId) ?? { ganho: 0, n: 0 };
      porPersonagem.set(c.characterId, { ganho: t.ganho + c.ganho, n: t.n + 1 });
    }

  return (
    <div className="grid gap-3.5">
      {erro ? (
        <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
          {erro}
        </div>
      ) : null}

      {porPersonagem.size ? (
        <div className="flex flex-wrap gap-2.5">
          {[...porPersonagem.entries()]
            .sort((a, b) => b[1].ganho - a[1].ganho)
            .map(([id, t]) => {
              const p = personagens.find((x) => x.id === id);
              const capa = p ? capaSrc(p) : undefined;
              return (
                <div
                  key={id}
                  className={cn(cartao, "flex items-center gap-3 py-2.5 pl-2.5 pr-4")}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white/[0.06] text-[13px] font-bold text-nido-soft">
                    {capa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={capa} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (p?.identidade.nome || "?").slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-nido-ink">
                      {p?.identidade.nome || tx("Sem nome")}
                    </span>
                    <span className={cn(mono, "block text-[11px] text-nido-dim")}>
                      {dolar(t.ganho)} · {t.n}{" "}
                      {t.n === 1 ? tx("campanha") : tx("campanhas")}
                    </span>
                  </span>
                </div>
              );
            })}
        </div>
      ) : null}

      <section className={cn(cartao, "overflow-hidden")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-5">
          <h3 className="text-[15px] font-semibold">{tx("Por campanha")}</h3>
          <span className="text-[12px] text-nido-mute">
            {tx("Campanhas do Nido em que você participou, e de qual influencer é cada uma.")}
          </span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {campanhas.map((c) => (
            <div
              key={`${c.tipo}:${c.id}`}
              className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_minmax(170px,220px)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-[14px] font-semibold text-nido-ink hover:text-nido-yellow"
                    >
                      {c.titulo}
                    </a>
                  ) : (
                    <span className="truncate text-[14px] font-semibold text-nido-ink">
                      {c.titulo}
                    </span>
                  )}
                </div>
                <div className={cn(mono, "truncate text-[11px] uppercase text-nido-dim")}>
                  {c.tipo === "clip_campaign" ? tx("Clipes") : tx("Campanha")} ·{" "}
                  {c.status} · {c.posts} {c.posts === 1 ? tx("post") : tx("posts")}
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className={cn(mono, "text-[10.5px] uppercase text-nido-dim")}>
                  {tx("Views")}
                </div>
                <div className="text-[14px] font-semibold text-nido-soft">
                  {compacto.format(c.views)}
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className={cn(mono, "text-[10.5px] uppercase text-nido-dim")}>
                  {tx("Ganho")}
                </div>
                <div className="text-[14px] font-bold text-nido-yellow">
                  {dolar(c.ganho)}
                </div>
              </div>
              <div className="min-w-0">
                <select
                  value={c.characterId ?? ""}
                  disabled={salvando === c.id}
                  onChange={(e) => escolher(c.id, e.target.value || null)}
                  aria-label={tx("Personagem desta campanha")}
                  className="h-9 w-full rounded-full border border-white/10 bg-nido-bg px-3 text-[13px] text-nido-ink outline-none transition focus:border-nido-yellow disabled:opacity-60"
                >
                  <option value="">{tx("Sem personagem")}</option>
                  {personagens.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.identidade.nome || tx("Sem nome")}
                    </option>
                  ))}
                </select>
                <div className={cn(mono, "mt-1 flex items-center gap-1 text-[10.5px] text-nido-dim")}>
                  {c.vinculo === "link" ? (
                    <>
                      <Link2 className="h-3 w-3" />
                      {tx("ligado pelo link do post")}
                    </>
                  ) : c.vinculo === "manual" ? (
                    tx("escolhido por você")
                  ) : (
                    tx("escolha o influencer desta campanha")
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
