"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ExternalLink,
  Flame,
  Loader2,
  Newspaper,
  PenLine,
  Radar as IconeRadar,
  RefreshCw,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useCharacters } from "@/lib/store";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import { TagInput } from "@/components/ui/TagInput";
import { IconeRede } from "@/components/ui/IconeRede";
import { CREDITOS_RADAR, creditosRadar } from "@/lib/planos";
import {
  diaDeHoje,
  MAX_TEMAS,
  NOTA_DESTAQUE,
  temasDoPersonagem,
  type ItemRadar,
  type Radar as RadarDoDia,
} from "@/lib/radar/tipos";
import { idiomaAtual, tx } from "@/lib/i18n/tx";

/** Avisa a barra do topo que os radares deste personagem foram vistos. */
export const EVENTO_RADAR_VISTO = "nido:radar-visto";
/** Dias mais recentes que viram aba; o resto do histórico (até 30) fica num seletor. */
const DIAS_EM_ABAS = 7;

const dataCurta = (dia: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  const texto = new Date(a, m - 1, d).toLocaleDateString(
    idiomaAtual() === "en" ? "en-US" : "pt-BR",
    {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    },
  );
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/**
 * Estúdio → Radar: o que está acontecendo hoje nos temas do personagem
 * (notícias e, se ligado, o X), com nota de relevância e ideia de post.
 * O radar diário é opcional e gasta créditos — por isso vem desligado.
 */
export function Radar({ character }: { character: Character }) {
  const recursos = useRecursos();
  const router = useRouter();
  const pathname = usePathname();
  const update = useCharacters((s) => s.update);
  const { conta } = useCreditos();
  const cfg = character.radar ?? { ativo: false, comX: false, temas: [] };
  const comX = cfg.comX && recursos.radarX;
  const temas = temasDoPersonagem(character);
  const custo = creditosRadar(comX);

  const [radares, setRadares] = useState<RadarDoDia[] | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<{ msg: string; code?: string } | null>(null);

  function configurar(mudanca: Partial<NonNullable<Character["radar"]>>) {
    const novo = {
      ativo: false,
      comX: false,
      temas: [] as string[],
      ...character.radar,
      ...mudanca,
      idioma: idiomaAtual(),
    };
    update(character.id, (c) => {
      c.radar = novo;
    });
    // Além da sincronia normal da ficha, grava direto no servidor: é de lá que a
    // tarefa diária lê, e isto chega mesmo se a aba for fechada em seguida.
    fetch(`/api/radar/${character.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(novo),
      keepalive: true,
    }).catch(() => {});
  }

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/radar/${character.id}`, {
      cache: "no-store",
    }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as {
      radares?: RadarDoDia[];
    } | null;
    setRadares(b?.radares ?? []);
    // Abrir a aba conta como "visto": o aviso some do sino.
    if (b?.radares?.some((r) => !r.vistoEm)) {
      fetch(`/api/radar/${character.id}`, { method: "PATCH" })
        .then(() => window.dispatchEvent(new Event(EVENTO_RADAR_VISTO)))
        .catch(() => {});
    }
  }, [character.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function atualizar() {
    setErro(null);
    setGerando(true);
    try {
      const res = await fetch(`/api/radar/${character.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comX, temas }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        radar?: RadarDoDia;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !b.radar)
        return setErro({
          msg: b.error ?? `Falha (HTTP ${res.status}).`,
          code: b.code,
        });
      setRadares((r) => [
        b.radar!,
        ...(r ?? []).filter((x) => x.dia !== b.radar!.dia),
      ]);
      setDia(b.radar.dia);
    } catch (e) {
      setErro({ msg: (e as Error).message });
    } finally {
      setGerando(false);
    }
  }

  function escreverSobre(i: ItemRadar) {
    const tema = [i.titulo, i.ideia].filter(Boolean).join(" — ").slice(0, 400);
    router.push(
      `${pathname}?${new URLSearchParams({ aba: "estudio", secao: "textos", tema })}`,
    );
  }

  if (!recursos.ia)
    return (
      <p className="text-[13px] text-ink-dim">
        {tx(
          "O radar precisa da IA de texto configurada neste deploy (ANTHROPIC_API_KEY).",
        )}
      </p>
    );

  const hoje = diaDeHoje();
  const atual =
    radares?.find((r) => r.dia === (dia ?? radares[0]?.dia)) ?? null;
  const temHoje = !!radares?.some((r) => r.dia === hoje && r.status === "ok");
  const antigoSelecionado =
    !!atual &&
    (radares ?? []).findIndex((r) => r.dia === atual.dia) >= DIAS_EM_ABAS;

  return (
    <div className="grid gap-6">
      {/* Configuração */}
      <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5 grid gap-4">
        <div className="grid gap-2">
          <div className="text-[13px] font-semibold text-ink">
            {tx("Temas acompanhados")}
          </div>
          <TagInput
            value={cfg.temas}
            onChange={(t) => configurar({ temas: t.slice(0, MAX_TEMAS) })}
            placeholder={tx(
              "Ex.: inteligência artificial, bancos, fofoca de famosos",
            )}
            max={MAX_TEMAS}
          />
          <p className="text-[12px] text-ink-dim">
            {temas.length
              ? `${tx("O radar de hoje vai procurar por:")} ${temas.join(" · ")}`
              : tx(
                  "Adicione um tema ou preencha o nicho na ficha — o radar usa os dois.",
                )}
          </p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="flex items-start gap-2.5 rounded-xl border border-line bg-bg px-3.5 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.ativo}
              onChange={(e) => configurar({ ativo: e.target.checked })}
              className="accent-accent h-4 w-4 mt-0.5 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-ink">
                {tx("Radar diário")}
              </span>
              <span className="block text-[12px] text-ink-mute">
                {tx("Todo dia de manhã, sozinho. Gasta")} {custo}{" "}
                {tx("créditos por dia; sem saldo, ele pula o dia.")}
              </span>
            </span>
          </label>
          <label
            className={cn(
              "flex items-start gap-2.5 rounded-xl border border-line bg-bg px-3.5 py-3",
              recursos.radarX ? "cursor-pointer" : "opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={comX}
              disabled={!recursos.radarX}
              onChange={(e) => configurar({ comX: e.target.checked })}
              className="accent-accent h-4 w-4 mt-0.5 shrink-0"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                <IconeRede rede="TWITTER" />{" "}
                {tx("Incluir o que está em alta no X")}
              </span>
              <span className="block text-[12px] text-ink-mute">
                {recursos.radarX
                  ? `+${CREDITOS_RADAR.x} ${tx("créditos por radar.")}`
                  : tx("Não configurado neste deploy (XAI_API_KEY).")}
              </span>
            </span>
          </label>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="accent"
            onClick={atualizar}
            disabled={gerando || !temas.length}
          >
            {gerando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {gerando
              ? tx("Pesquisando… (até 1 min)")
              : `${temHoje ? tx("Refazer o radar de hoje") : tx("Montar o radar de hoje")}${conta ? ` · ${custo} ${tx("créditos")}` : ""}`}
          </Button>
          {gerando && (
            <span className="text-[12px] text-ink-dim">
              {tx("Pode continuar usando o app nesta aba.")}
            </span>
          )}
        </div>
        {erro ? <ErroGeracao mensagem={erro.msg} code={erro.code} /> : null}
      </section>

      {/* Resultado */}
      {radares === null ? (
        <div className="card p-10 grid place-items-center text-ink-mute">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !radares.length ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 grid justify-items-center gap-3 text-center">
          <span className="h-12 w-12 rounded-full bg-accent/15 text-accent grid place-items-center">
            <IconeRadar className="w-6 h-6" />
          </span>
          <span className="text-[15px] font-semibold text-ink">
            {tx("Nenhum radar ainda")}
          </span>
          <span className="text-[13px] text-ink-mute max-w-md">
            {tx(
              "O radar pesquisa o que aconteceu hoje nos temas do personagem, dá uma nota de relevância e sugere um post para cada assunto.",
            )}
          </span>
        </div>
      ) : (
        <section className="grid gap-4">
          {radares.length > 1 && (
            <div className="flex gap-1 flex-wrap items-center">
              <div
                role="tablist"
                aria-label={tx("Dia do radar")}
                className="flex gap-1 flex-wrap"
              >
                {radares.slice(0, DIAS_EM_ABAS).map((r) => (
                  <button
                    key={r.dia}
                    type="button"
                    role="tab"
                    aria-selected={atual?.dia === r.dia}
                    onClick={() => setDia(r.dia)}
                    className={cn(
                      "h-8 px-3 rounded-full text-[12px] font-semibold border transition capitalize",
                      atual?.dia === r.dia
                        ? "bg-card text-ink border-line-strong"
                        : "border-line text-ink-mute hover:text-ink",
                    )}
                  >
                    {r.dia === hoje ? tx("Hoje") : dataCurta(r.dia)}
                  </button>
                ))}
              </div>
              {/* Os dias mais antigos (até 30) ficam num seletor, para não encher a tela de abas. */}
              {radares.length > DIAS_EM_ABAS && (
                <select
                  aria-label={tx("Radares mais antigos")}
                  value={antigoSelecionado ? atual!.dia : ""}
                  onChange={(e) => e.target.value && setDia(e.target.value)}
                  className={cn(
                    "h-8 rounded-full border bg-panel px-3 text-[12px] font-semibold",
                    antigoSelecionado
                      ? "border-line-strong text-ink"
                      : "border-line text-ink-mute",
                  )}
                >
                  <option value="">{tx("Mais antigos")}</option>
                  {radares.slice(DIAS_EM_ABAS).map((r) => (
                    <option key={r.dia} value={r.dia}>
                      {dataCurta(r.dia)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {atual?.status === "sem_creditos" && (
            <ErroGeracao
              mensagem={tx(
                "O radar deste dia não rodou porque faltaram créditos.",
              )}
              code="SEM_CREDITOS"
            />
          )}
          {atual?.status === "erro" && (
            <p className="text-[13px] text-pink">
              {tx(
                "O radar deste dia falhou e os créditos foram devolvidos. Tente montar de novo.",
              )}
            </p>
          )}

          {atual?.status === "ok" && (
            <>
              {atual.resumo ? (
                <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 sm:p-5">
                  <div className="label-cap !text-accent mb-1.5">
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
              </p>
              {atual.itens.length === 0 ? (
                <p className="text-[13px] text-ink-mute">
                  {tx("Nada relevante apareceu nesses temas hoje.")}
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {atual.itens.map((i, n) => (
                    <CartaoItem
                      key={n}
                      item={i}
                      onEscrever={() => escreverSobre(i)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function CartaoItem({
  item: i,
  onEscrever,
}: {
  item: ItemRadar;
  onEscrever: () => void;
}) {
  const destaque = i.nota >= NOTA_DESTAQUE;
  return (
    <article
      className={cn(
        "card p-4 grid gap-2.5 content-start",
        destaque && "border-accent/50",
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
            destaque
              ? "bg-accent text-bg"
              : "bg-panel border border-line text-ink-mute",
          )}
          title={tx("Relevância para este personagem, de 1 a 10")}
        >
          {destaque ? <Flame className="w-3 h-3" /> : null}
          {i.nota}/10
        </span>
        <span className="inline-flex items-center gap-1 text-ink-dim min-w-0">
          {i.fonte === "x" ? (
            <IconeRede rede="TWITTER" className="h-3 w-3" />
          ) : (
            <Newspaper className="w-3 h-3 shrink-0" />
          )}
          <span className="truncate">
            {i.origem ?? (i.fonte === "x" ? "X" : tx("Notícia"))}
          </span>
        </span>
      </div>
      {i.promocional ? (
        <span
          className="justify-self-start rounded-full border border-pink/40 bg-pink/10 px-2 py-0.5 text-[11px] font-semibold text-pink"
          title={tx(
            "Comunicado, conteúdo patrocinado ou texto de empresa — não é notícia independente.",
          )}
        >
          {tx("Conteúdo promocional")}
        </span>
      ) : null}
      <h3 className="text-[15px] font-bold text-ink leading-snug">
        {i.titulo}
      </h3>
      {i.resumo ? (
        <p className="text-[13px] text-ink-mute leading-relaxed">{i.resumo}</p>
      ) : null}
      {i.porque ? (
        <p className="text-[12px] text-ink-dim leading-relaxed">
          <strong className="text-ink-mute">{tx("Por que importa:")}</strong>{" "}
          {i.porque}
        </p>
      ) : null}
      {i.ideia ? (
        <p className="rounded-xl bg-panel border border-line px-3 py-2 text-[13px] text-ink leading-relaxed">
          <strong className="text-accent">{tx("Ideia de post:")}</strong>{" "}
          {i.ideia}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
        <Button size="sm" onClick={onEscrever}>
          <PenLine className="w-3.5 h-3.5" /> {tx("Escrever post sobre isso")}
        </Button>
        {i.url ? (
          <a
            href={i.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-mute hover:text-ink"
          >
            {tx("Ver a fonte")} <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
      </div>
    </article>
  );
}
