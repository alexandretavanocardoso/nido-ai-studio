"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Radar as IconeRadar,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import {
  CartaoItem,
  dataCurta,
  SeletorDeDia,
} from "@/components/estudio/Radar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { idiomaAtual, tx } from "@/lib/i18n/tx";
import { NICHOS_GLOBAIS, type RadarGlobal as Radar } from "@/lib/radar/global";
import { diaDeHoje, type ItemRadar } from "@/lib/radar/tipos";
import { useCharacters } from "@/lib/store";
import { useDuravel } from "@/lib/duravel";
import { txErro } from "@/lib/i18n/erros";

/**
 * Radar global (/app/radar): os assuntos do dia por nicho, iguais para todos.
 * A plataforma monta uma vez por dia; ver não gasta créditos.
 */
export function RadarGlobal() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const { conta } = useCreditos();
  const personagens = useCharacters((s) => s.characters);
  const idioma = idiomaAtual();

  const nicho =
    NICHOS_GLOBAIS.find((n) => n.id === params?.get("nicho")) ??
    NICHOS_GLOBAIS[0];
  const [radares, setRadares] = useState<Radar[] | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [escreverComo, setEscreverComo] = useState("");
  const [montando, setMontando] = useDuravel<boolean>(
    "radar-global:montando",
    false,
    "Montando o radar",
  );
  const [erro, setErro] = useDuravel<string | null>(
    "radar-global:erro",
    null,
  );

  const carregar = useCallback(async () => {
    const res = await fetch("/api/radar/global", { cache: "no-store" }).catch(
      () => null,
    );
    const b = (await res?.json().catch(() => null)) as {
      radares?: Radar[];
    } | null;
    setRadares(b?.radares ?? []);
  }, []);

  useEffect(() => {
    if (user) carregar();
  }, [user, carregar]);

  function escolherNicho(id: string) {
    setDia(null);
    setErro(null);
    router.replace(`${pathname}?nicho=${id}`, { scroll: false });
  }

  async function montar() {
    setErro(null);
    setMontando(true);
    try {
      const res = await fetch("/api/radar/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicho: nicho.id }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        radar?: Radar;
        error?: string;
      };
      if (!res.ok || !b.radar)
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      setRadares((r) => [
        b.radar!,
        ...(r ?? []).filter(
          (x) => !(x.nicho === b.radar!.nicho && x.dia === b.radar!.dia),
        ),
      ]);
      setDia(b.radar.dia);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setMontando(false);
    }
  }

  const autor =
    personagens.find((c) => c.id === escreverComo) ?? personagens[0] ?? null;
  function escreverSobre(i: ItemRadar) {
    if (!autor) return;
    const tema = [i.titulo, i.ideia].filter(Boolean).join(" — ").slice(0, 400);
    router.push(
      `/app/personagem/${autor.id}?${new URLSearchParams({ aba: "estudio", secao: "textos", tema })}`,
    );
  }

  const hoje = diaDeHoje();
  const doNicho = (radares ?? []).filter((r) => r.nicho === nicho.id);
  const atual = doNicho.find((r) => r.dia === (dia ?? doNicho[0]?.dia)) ?? null;
  const temHoje = doNicho.some((r) => r.dia === hoje);

  return (
    <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-[minmax(0,1fr)] gap-6">
      <header className="flex items-start gap-3">
        <Link
          href="/app"
          aria-label={tx("Voltar")}
          className="h-10 w-10 shrink-0 rounded-full border border-line grid place-items-center text-ink-mute hover:text-ink hover:border-line-strong transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
            {tx("Radar global")}
          </h1>
          <p className="text-[15px] text-ink-mute mt-1 max-w-3xl">
            {tx(
              "O que está em alta hoje em cada nicho, com nota de relevância e ideia de post. Atualizado todo dia de manhã, igual para todo mundo — não gasta créditos.",
            )}
          </p>
        </div>
      </header>

      <div
        role="tablist"
        aria-label={tx("Nicho")}
        className="flex gap-1 border-b border-line overflow-x-auto"
      >
        {NICHOS_GLOBAIS.map((n) => (
          <button
            key={n.id}
            type="button"
            role="tab"
            aria-selected={n.id === nicho.id}
            onClick={() => escolherNicho(n.id)}
            className={cn(
              "relative shrink-0 px-4 h-11 text-[14px] font-semibold transition cursor-pointer",
              n.id === nicho.id ? "text-ink" : "text-ink-mute hover:text-ink",
            )}
          >
            {n.nome[idioma]}
            {n.id === nicho.id && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      {!user ? (
        <p className="text-[14px] text-ink-mute">
          {tx("Entre na sua conta para ver o radar.")}
        </p>
      ) : radares === null ? (
        <div className="card p-10 grid place-items-center text-ink-mute">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <section className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SeletorDeDia
              dias={doNicho.map((r) => r.dia)}
              atual={atual?.dia ?? null}
              onPick={setDia}
            />
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              {personagens.length > 1 && (
                <label className="flex items-center gap-2 text-[12px] font-semibold text-ink-mute">
                  {tx("Escrever como")}
                  <select
                    value={autor?.id ?? ""}
                    onChange={(e) => setEscreverComo(e.target.value)}
                    className="h-8 max-w-[200px] rounded-full border border-line bg-panel px-3 text-[12px] font-semibold text-ink cursor-pointer"
                  >
                    {personagens.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.identidade.nome || tx("Sem nome")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {conta?.admin && (
                <Button
                  size="sm"
                  onClick={montar}
                  disabled={montando}
                  title={tx(
                    "Só admins veem este botão. A pesquisa é paga pela plataforma.",
                  )}
                >
                  {montando ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {montando
                    ? tx("Montando… (até 1 min)")
                    : temHoje
                      ? tx("Refazer o de hoje")
                      : tx("Montar agora")}
                </Button>
              )}
            </div>
          </div>
          {erro ? <p className="text-[13px] text-pink">{erro}</p> : null}

          {!atual ? (
            <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 grid justify-items-center gap-3 text-center">
              <span className="h-12 w-12 rounded-full bg-accent/15 text-accent grid place-items-center">
                <IconeRadar className="w-6 h-6" />
              </span>
              <span className="text-[15px] font-semibold text-ink">
                {tx("O radar deste nicho ainda não foi montado.")}
              </span>
              <span className="text-[13px] text-ink-mute max-w-md">
                {tx("Ele é atualizado todo dia de manhã. Volte mais tarde.")}
              </span>
            </div>
          ) : (
            <>
              {atual.resumo ? (
                <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 sm:p-5">
                  <div className="label-cap !text-accent mb-1.5">
                    {nicho.nome[idioma]} ·{" "}
                    {atual.dia === hoje ? tx("Hoje") : dataCurta(atual.dia)}
                    {atual.comX
                      ? ` · ${tx("notícias + X")}`
                      : ` · ${tx("notícias")}`}
                  </div>
                  <p className="text-[14px] text-ink leading-relaxed">
                    {atual.resumo}
                  </p>
                </div>
              ) : null}
              <p className="text-[12px] text-ink-dim">
                {tx(
                  "Os assuntos vêm de uma pesquisa feita por IA: abra a fonte e confira antes de postar.",
                )}
                {!personagens.length
                  ? ` ${tx("Crie um personagem para transformar um assunto em post.")}`
                  : ""}
              </p>
              {atual.itens.length === 0 ? (
                <p className="text-[13px] text-ink-mute">
                  {tx("Nada relevante apareceu neste nicho hoje.")}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {atual.itens.map((i, n) => (
                    <CartaoItem
                      key={n}
                      item={i}
                      dicaNota={tx(
                        "Relevância para quem cobre este nicho, de 1 a 10",
                      )}
                      onEscrever={autor ? () => escreverSobre(i) : undefined}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
