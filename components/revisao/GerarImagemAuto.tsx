"use client";

import { useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import {
  Check,
  Download,
  ImagePlus,
  Loader2,
  Lock,
  Maximize2,
  Sparkles,
  Star,
  Trash2,
  UserSquare,
  X,
} from "lucide-react";
import { CapaImagem } from "@/components/ui/CapaImagem";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { bloqueioImagem, creditosImagem } from "@/lib/planos";
import type { Character, ImagemGerada } from "@/lib/types";
import type { TipoImagem } from "@/lib/prompts/gerar-imagem";
import { stripMetadata } from "@/lib/ai/strip";
import { shrinkDataUrl } from "@/lib/image-resize";
import { downloadUrl, fileUrl, refSrc } from "@/lib/storage/client";
import { useCharacters } from "@/lib/store";
import { useDuravel } from "@/lib/duravel";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useRecursos } from "@/components/RecursosProvider";
import { usePersona } from "@/lib/persona/usePersona";
import { MODELOS_IMAGEM, type ModeloImagem } from "@/lib/ai/modelos-imagem";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";
import { dinheiro } from "@/lib/moeda";

const MAX_REFS = 4;
/** Tamanho máximo da galeria; as mais antigas saem (o arquivo é limpo pelo cron). */
const MAX_GALERIA = 30;

type Qualidade = "padrao" | "pro";

interface Resultado {
  id: string;
  /** Imagem no S3 (modo logado) ou base64 (modo anônimo). */
  key?: string;
  dataUrl?: string;
  size: number;
  tipo: TipoImagem;
  /** true = está na galeria do personagem (S3); false = só nesta sessão. */
  persistida: boolean;
}

const srcDe = (r: Resultado) => (r.key ? fileUrl(r.key) : r.dataUrl!);
/** Link de download: arquivo no S3 baixa com o nome certo (sem abrir na aba); base64 baixa direto. */
const baixarDe = (r: Resultado, nome: string) =>
  r.key ? downloadUrl(r.key, nome) : r.dataUrl!;

interface Props {
  character: Character;
  tipo: TipoImagem;
}

/**
 * Geração automática da imagem (rota /api/gerar-imagem) com o modelo escolhido:
 * Nano Banana (Gemini), Seedream 4.5 / Flux.2 Pro (fal.ai) ou GPT Image
 * (OpenAI direto; pelo fal.ai quando não há OPENAI_API_KEY).
 * Usa o mesmo prompt "Neutro" das abas de copiar, mais as referências
 * selecionadas. O resultado pode ser baixado ou salvo nas referências —
 * é assim que o card gerado vira base pro retrato.
 */
export function GerarImagemAuto({ character, tipo }: Props) {
  const update = useCharacters((s) => s.update);
  const { user } = useAuth();
  const recursos = useRecursos();
  /** Modelos com o serviço configurado neste deploy (Gemini, fal.ai e/ou OpenAI). */
  const { pronta, status: persona } = usePersona(character.id);
  const MODELOS_DISPONIVEIS = (
    Object.keys(MODELOS_IMAGEM) as ModeloImagem[]
  ).filter((m) =>
    m === "persona"
      ? recursos.fal && pronta.imagem
      : MODELOS_IMAGEM[m].provedor === "gemini"
        ? recursos.gemini
        : // GPT Image também roda direto na OpenAI.
          recursos.fal || (m === "gpt-image" && recursos.openai),
  );
  const [qualidade, setQualidade] = useState<Qualidade>("padrao");
  const [modelo, setModelo] = useState<ModeloImagem>(
    MODELOS_DISPONIVEIS[0] ?? "nano-banana",
  );
  const [textoNaImagem, setTextoNaImagem] = useState("");
  const info = MODELOS_IMAGEM[modelo];
  const { conta } = useCreditos();
  const plano = conta?.plano;
  const qualidadeEfetiva = info.temQualidade ? qualidade : "padrao";
  const creditos = creditosImagem(modelo, qualidadeEfetiva);
  const bloqueio = plano
    ? bloqueioImagem(plano, modelo, qualidadeEfetiva)
    : null;
  // A imagem principal (1ª referência) já vem marcada: as próximas gerações mantêm o mesmo personagem.
  const [selecionadas, setSelecionadas] = useState<string[]>(() => {
    const principal = character.visual.referencias.find(
      (r) => r.dataUrl || r.key,
    );
    return principal ? [principal.id] : [];
  });
  /** Persona Rápida (FLUX.1) gera só pelo texto: o rosto vem do treino, as referências não entram. */
  const semRefs = modelo === "persona" && persona?.treinador === "rapido";
  const [loading, setLoading] = useDuravel<boolean>(
    `img:${character.id}:${tipo}:loading`,
    false,
    "Gerando imagem",
  );
  const [erro, setErro] = useDuravel<string | null>(
    `img:${character.id}:${tipo}:erro`,
    null,
  );
  const [erroCode, setErroCode] = useDuravel<string | null>(
    `img:${character.id}:${tipo}:erroCode`,
    null,
  );
  /** Resultados do modo anônimo (base64): não persistem, somem ao recarregar. */
  const [locais, setLocais] = useDuravel<Resultado[]>(
    `img:${character.id}:locais`,
    [],
  );

  const refs = character.visual.referencias.filter((r) => r.dataUrl || r.key);
  const isRetrato = tipo === "retrato";
  const precisaLogin = recursos.login && !user;

  const resultados: Resultado[] = [
    ...locais,
    ...(character.geradas ?? [])
      .filter((g) => g.tipo !== "troca")
      .map((g) => ({
        id: g.id,
        key: g.key,
        size: g.size,
        tipo: g.tipo as TipoImagem,
        persistida: true,
      })),
  ];
  const salvoNasRefs = (r: Resultado) =>
    character.visual.referencias.some((ref) =>
      r.key ? ref.key === r.key : ref.dataUrl === r.dataUrl,
    );

  function toggleRef(id: string) {
    setSelecionadas((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : s.length >= MAX_REFS
          ? s
          : [...s, id],
    );
  }

  async function gerar() {
    setErro(null);
    setErroCode(null);
    if (isRetrato && !semRefs && selecionadas.length === 0) {
      setErro("Selecione a imagem do card de referência abaixo.");
      return;
    }
    setLoading(true);
    try {
      const referencias = await Promise.all(
        refs
          .filter((r) => !semRefs && selecionadas.includes(r.id))
          .map((r) => (r.key ? { key: r.key } : shrinkDataUrl(r.dataUrl))),
      );
      const res = await fetch("/api/gerar-imagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: stripMetadata(character),
          tipo,
          qualidade,
          modelo,
          textoNaImagem:
            info.aceitaTexto && textoNaImagem.trim()
              ? textoNaImagem.trim()
              : undefined,
          referencias,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        image?: string;
        key?: string;
        size?: number;
        error?: string;
        code?: string;
      };
      avisarCreditos(); // gastou (ou foi estornado): atualiza o saldo
      if (!res.ok || !(body.image || body.key)) {
        setErro(txErro(body.error ?? `Falha ao gerar (HTTP ${res.status}).`));
        setErroCode(body.code ?? null);
        return;
      }
      if (body.key) {
        const nova: ImagemGerada = {
          id: nanoid(8),
          key: body.key,
          tipo,
          estilo: character.visual.estilo ?? "realista",
          qualidade,
          modelo,
          size: body.size ?? 0,
          createdAt: Date.now(),
        };
        update(character.id, (c) => {
          c.geradas = [nova, ...(c.geradas ?? [])].slice(0, MAX_GALERIA);
        });
      } else {
        setLocais((r) => [
          {
            id: nanoid(8),
            dataUrl: body.image,
            size: body.size ?? 0,
            tipo,
            persistida: false,
          },
          ...r,
        ]);
      }
    } catch (e) {
      setErro((e as Error).message || "Falha ao gerar a imagem.");
    } finally {
      setLoading(false);
    }
  }

  function salvar(r: Resultado) {
    const nome = `${r.tipo === "retrato" ? "retrato" : "card"}-${r.id}.jpg`;
    update(character.id, (c) => {
      c.visual.referencias = [
        ...c.visual.referencias,
        {
          id: nanoid(8),
          name: nome,
          dataUrl: r.dataUrl ?? "",
          key: r.key,
          size: r.size,
        },
      ];
    });
  }

  function remover(r: Resultado) {
    if (!r.persistida) {
      setLocais((all) => all.filter((x) => x.id !== r.id));
      return;
    }
    update(character.id, (c) => {
      c.geradas = (c.geradas ?? []).filter((g) => g.id !== r.id);
      if (r.key && c.visual.capaKey === r.key) c.visual.capaKey = undefined;
    });
  }

  function usarComoCapa(r: Resultado) {
    if (!r.key) return;
    update(character.id, (c) => {
      c.visual.capaKey = r.key;
    });
  }

  const [filtro, setFiltro] = useState<"todos" | TipoImagem>("todos");
  const [aberta, setAberta] = useState<Resultado | null>(null);
  const visiveis = resultados.filter(
    (r) => filtro === "todos" || r.tipo === filtro,
  );
  const ehCapa = (r: Resultado) =>
    !!r.key && character.visual.capaKey === r.key;

  return (
    <div className="grid gap-6">
      {/* Gerador */}
      <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5 grid gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[13px] font-semibold text-ink">
            {tx("Modelo")}
          </span>
          {info.temQualidade && (
            <div className="flex gap-1 border border-line rounded-full p-0.5 bg-bg">
              {(["padrao", "pro"] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQualidade(q)}
                  className={cn(
                    "px-3 h-7 rounded-full text-[12px] font-semibold transition inline-flex items-center gap-1",
                    qualidade === q
                      ? "bg-accent text-bg"
                      : "text-ink-mute hover:text-ink",
                  )}
                  title={
                    modelo === "gpt-image"
                      ? q === "pro"
                        ? tx("Qualidade alta · mais caro")
                        : tx("Qualidade média")
                      : q === "pro"
                        ? tx("Nano Banana Pro · 2K · mais caro e mais lento")
                        : tx("Nano Banana 2 · 1K")
                  }
                >
                  {q === "pro" ? tx("Pro") : tx("Padrão")}
                  {q === "pro" &&
                  plano &&
                  bloqueioImagem(plano, modelo, "pro") ? (
                    <Lock className="w-3 h-3" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {MODELOS_DISPONIVEIS.length > 1 && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 -mt-1">
            {MODELOS_DISPONIVEIS.map((m) => {
              const mm = MODELOS_IMAGEM[m];
              const travado = !!plano && !!bloqueioImagem(plano, m, "padrao");
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModelo(m)}
                  aria-pressed={modelo === m}
                  title={mm.rotulo}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left transition",
                    modelo === m
                      ? "border-accent bg-accent/10"
                      : "border-line bg-bg hover:border-line-strong",
                  )}
                >
                  <div className="text-[13px] font-semibold text-ink inline-flex items-center gap-1">
                    {travado && <Lock className="w-3 h-3" />}
                    {mm.label}
                  </div>
                  <div className="text-[11px] text-ink-dim truncate">
                    {conta
                      ? `${creditosImagem(m, mm.temQualidade ? qualidade : "padrao")} créditos`
                      : `~${dinheiro(mm.custo[mm.temQualidade ? qualidade : "padrao"], { de: "USD" })}`}{" "}
                    · {mm.rotulo}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {info.aceitaTexto && (
          <Input
            maxLength={200}
            placeholder={tx(
              'Texto na imagem (ex.: "PROMO DE SEXTA" na placa atrás dela)',
            )}
            value={textoNaImagem}
            onChange={(e) => setTextoNaImagem(e.target.value)}
          />
        )}

        {semRefs ? (
          <p className="text-[12px] text-ink-dim">
            {tx(
              "A persona Rápida gera só pelo texto — o rosto vem do treino; a base não é usada.",
            )}
          </p>
        ) : refs.length > 0 ? (
          <div className="grid gap-2">
            <div className="text-[13px] font-semibold text-ink">
              {isRetrato ? tx("Card de referência") : tx("Base do personagem")}{" "}
              <span className="font-normal text-ink-dim">
                ·{" "}
                {selecionadas.length
                  ? tx("a nova imagem mantém este personagem")
                  : tx("sem base, a IA cria um visual novo a cada vez")}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {refs.map((r) => {
                const on = selecionadas.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRef(r.id)}
                    className={cn(
                      "relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border-2 transition bg-bg",
                      on
                        ? "border-accent"
                        : "border-line opacity-50 hover:opacity-100",
                    )}
                    aria-pressed={on}
                    title={r.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={refSrc(r)}
                      alt={r.name}
                      className="w-full h-full object-cover object-top"
                    />
                    {on && (
                      <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-accent text-bg inline-flex items-center justify-center">
                        <Check className="w-3 h-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : isRetrato ? (
          <p className="text-[13px] text-ink-mute">
            {tx(
              "Gere o card de referência primeiro e clique em “Usar como referência” na galeria.",
            )}
          </p>
        ) : null}

        <div className="flex items-center gap-3 flex-wrap">
          {precisaLogin ? (
            <Link
              href="/auth/login"
              className="inline-flex w-fit items-center justify-center gap-2 font-bold rounded-full h-10 px-5 text-sm bg-accent text-bg hover:bg-accent-strong"
            >
              {tx("Entre para gerar imagens")}
            </Link>
          ) : (
            <Button
              variant="accent"
              onClick={gerar}
              disabled={loading || !!bloqueio}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loading
                ? tx("Gerando… (até 1 min)")
                : `${isRetrato ? tx("Gerar retrato") : tx("Gerar card de referência")}${conta ? ` · ${creditos} créditos` : ""}`}
            </Button>
          )}
        </div>
        {bloqueio && !loading ? (
          <ErroGeracao mensagem={bloqueio} code="PLANO" />
        ) : null}
        {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}
      </section>

      {/* Galeria */}
      {resultados.length > 0 && (
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[15px] font-semibold text-ink">
              {tx("Galeria")}{" "}
              <span className="text-ink-dim font-normal">
                · {resultados.length}
              </span>
            </div>
            <div className="flex gap-1 border border-line rounded-full p-0.5 bg-panel">
              {(
                [
                  ["todos", "Todas"],
                  ["referencia", "Cards"],
                  ["retrato", "Retratos"],
                ] as const
              ).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  className={cn(
                    "px-3 h-7 rounded-full text-[12px] font-semibold transition",
                    filtro === id
                      ? "bg-card text-ink"
                      : "text-ink-mute hover:text-ink",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
          {locais.length > 0 && (
            <p className="text-[12px] text-ink-dim">
              {tx("Sem login, as imagens somem ao recarregar a página.")}
            </p>
          )}
          {/* No celular, 2 colunas só se cada imagem tiver 150px (o que as 5 ações precisam); num celular estreito fica 1 por linha. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] sm:grid-cols-3 gap-3">
            {visiveis.map((r) => {
              const salvo = salvoNasRefs(r);
              return (
                <figure
                  key={r.id}
                  // Contêiner: os botões de ação encolhem quando a imagem tem menos de 200px, senão os últimos eram cortados.
                  className="group relative aspect-[4/5] rounded-xl overflow-hidden border border-line bg-bg [container-type:inline-size]"
                >
                  <button
                    type="button"
                    onClick={() => setAberta(r)}
                    className="absolute inset-0"
                    aria-label={tx("Ver imagem grande")}
                  >
                    <CapaImagem
                      src={srcDe(r)}
                      alt={tx("Imagem gerada")}
                      zoomNoHover
                    />
                  </button>
                  <div className="pointer-events-none absolute top-2 left-2 flex gap-1">
                    <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      {r.tipo === "retrato" ? tx("Retrato") : tx("Card")}
                    </span>
                    {ehCapa(r) && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-bg inline-flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" /> {tx("Capa")}
                      </span>
                    )}
                  </div>
                  {/* Ações (aparecem ao passar o mouse; no celular, sempre visíveis) */}
                  {/* pointer-events-none: tocar no degradê (fora dos botões) abre a imagem, em vez de não fazer nada. */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-[3px] bg-gradient-to-t from-black/80 to-transparent pt-8 pb-2 opacity-100 transition [&>*]:pointer-events-auto sm:opacity-0 sm:group-hover:opacity-100 [@container(min-width:200px)]:gap-1.5">
                    <AcaoIcone
                      titulo={tx("Ver grande")}
                      onClick={() => setAberta(r)}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </AcaoIcone>
                    {r.key && (
                      <AcaoIcone
                        titulo={
                          ehCapa(r)
                            ? tx("É a capa do personagem")
                            : tx("Usar como capa")
                        }
                        onClick={() => usarComoCapa(r)}
                        ativo={ehCapa(r)}
                      >
                        <UserSquare className="w-3.5 h-3.5" />
                      </AcaoIcone>
                    )}
                    <AcaoIcone
                      titulo={
                        salvo
                          ? tx("Já está nas referências")
                          : tx("Usar como referência (base)")
                      }
                      onClick={() => !salvo && salvar(r)}
                      ativo={salvo}
                    >
                      {salvo ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <ImagePlus className="w-3.5 h-3.5" />
                      )}
                    </AcaoIcone>
                    <a
                      href={baixarDe(
                        r,
                        nomeArquivo(character.identidade.nome, r),
                      )}
                      download={nomeArquivo(character.identidade.nome, r)}
                      title={tx("Baixar")}
                      className={cn(
                        TAMANHO_ACAO,
                        "grid place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/30",
                      )}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <AcaoIcone
                      titulo={tx("Remover da galeria")}
                      onClick={() => remover(r)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </AcaoIcone>
                  </div>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {/* Visualizar grande */}
      {aberta && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setAberta(null)}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
            <span className="text-[13px] text-white/80">
              {aberta.tipo === "retrato"
                ? tx("Retrato")
                : tx("Card de referência")}
              {ehCapa(aberta) ? tx(" · capa do personagem") : ""}
            </span>
            {/* flex-wrap: no celular os botões com texto não cabem numa linha só. */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {aberta.key && !ehCapa(aberta) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => usarComoCapa(aberta)}
                >
                  <UserSquare className="w-3.5 h-3.5" /> {tx("Usar como capa")}
                </Button>
              )}
              {!salvoNasRefs(aberta) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => salvar(aberta)}
                >
                  <ImagePlus className="w-3.5 h-3.5" />{" "}
                  {tx("Usar como referência")}
                </Button>
              )}
              <a
                href={baixarDe(
                  aberta,
                  nomeArquivo(character.identidade.nome, aberta),
                )}
                download={nomeArquivo(character.identidade.nome, aberta)}
                className="inline-flex items-center gap-1.5 rounded-full h-8 px-3.5 text-[13px] font-bold bg-accent text-bg"
              >
                <Download className="w-3.5 h-3.5" /> {tx("Baixar")}
              </a>
              <button
                type="button"
                onClick={() => setAberta(null)}
                className="h-9 w-9 grid place-items-center rounded-full border border-white/20 text-white/80 hover:text-white"
                aria-label={tx("Fechar")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div
            // grid-rows-[minmax(0,1fr)]: prende a linha à altura da área; sem isso o `max-h-full` da imagem não vale e uma imagem em pé passava da tela deitada.
            className="flex-1 min-h-0 p-4 pt-0 grid grid-rows-[minmax(0,1fr)] place-items-center"
            onClick={() => setAberta(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={srcDe(aberta)}
              alt=""
              className="max-h-full max-w-full object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Botão de ação sobre a imagem: 26px, ou 32px quando a imagem (o contêiner) tem 200px ou mais. */
const TAMANHO_ACAO =
  "h-[26px] w-[26px] [@container(min-width:200px)]:h-8 [@container(min-width:200px)]:w-8";

function AcaoIcone({
  titulo,
  onClick,
  ativo,
  children,
}: {
  titulo: string;
  onClick: () => void;
  ativo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={cn(
        TAMANHO_ACAO,
        "grid place-items-center rounded-full backdrop-blur transition",
        ativo
          ? "bg-accent text-bg"
          : "bg-white/15 text-white hover:bg-white/30",
      )}
    >
      {children}
    </button>
  );
}

function nomeArquivo(nome: string, r: Resultado): string {
  const base = (nome || "personagem")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "-")
    .toLowerCase();
  return `${base}-${r.tipo === "retrato" ? "retrato" : "card"}-${r.id}.jpg`;
}
