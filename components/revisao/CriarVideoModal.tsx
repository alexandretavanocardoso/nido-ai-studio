"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Mic,
  Pause,
  Play,
  X,
} from "lucide-react";
import { useCharacters } from "@/lib/store";
import type { VozDaBiblioteca } from "@/lib/voz/elevenlabs";
import type { Character } from "@/lib/types";
import {
  cenasDoVideo,
  custoCriar,
  cenasDaFala,
  CORPO_CUSTO_POR_SEGUNDO,
  CORPO_MAX_SEGUNDOS,
  DURACOES_CRIAR,
  DURACOES_FALADO,
  FALA_MAX_CARACTERES,
  MAX_CENAS_FALADAS,
  ROTEIRO_INTEIRO,
  FALADO_CUSTO_POR_SEGUNDO,
  FALADO_ROTULO,
  MODELOS_CRIAR,
  segundosDaCenaInteira,
  segundosDaFala,
  type Enquadramento,
  type ModeloCriar,
} from "@/lib/video/precos";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import {
  bloqueioCriarVideo,
  bloqueioVideoFalado,
  CORPO_INTEIRO_POR_SEGUNDO,
  CREDITOS_CENARIO,
  FALADO_POR_SEGUNDO,
  CREDITOS_CRIAR_VOZ,
  CREDITOS_TEXTO,
  creditosCriarVideo,
  creditosVideoFalado,
} from "@/lib/planos";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import { useRecursos } from "@/components/RecursosProvider";
import { descricaoInicial } from "@/components/voz/VozIA";
import { fileUrl } from "@/lib/storage/client";
import { tx } from "@/lib/i18n/tx";
import { useDuravel } from "@/lib/duravel";
import { txErro } from "@/lib/i18n/erros";

interface Props {
  character: Character;
  onClose: () => void;
  onEnviado: (job: {
    jobId: string;
    duracao: number;
    /** Nome do modelo, para o título do vídeo na lista. */
    rotulo: string;
  }) => void;
}

interface Voz {
  voiceId: string;
  nome: string;
  origem: "design" | "clone" | "biblioteca";
  amostraKey: string | null;
  /** Prévia pública (vozes da biblioteca). */
  previewUrl?: string;
}

const GENEROS = [
  ["", "Todas"],
  ["female", "Femininas"],
  ["male", "Masculinas"],
] as const;

/** Falado: o personagem diz o texto com a voz dele. Cena: só imagem em movimento. */
type Modo = "falado" | "cena";

/** Texto inicial: a primeira ideia de conteúdo da ficha, se houver. */
function cenaInicial(c: Character): string {
  const ideia = c.nicho.ideiasConteudo[0];
  const nome = c.identidade.nome || "O personagem";
  if (!ideia) return "";
  return `${nome} — ${ideia.titulo}${ideia.descricao ? `. ${ideia.descricao}` : ""}`.slice(
    0,
    1000,
  );
}

/** Limite do texto da cena (o que o serviço de vídeo aceita). */
const MAX_CENA = 1000;

/**
 * Cria um vídeo novo do personagem a partir de uma imagem dele.
 * Falado: a fala é gerada com a voz do personagem (ElevenLabs) e um modelo de
 * avatar anima a imagem falando, com os lábios sincronizados.
 * Cena: o Runway anima a imagem a partir de uma descrição (sem fala).
 */
export function CriarVideoModal({ character, onClose, onEnviado }: Props) {
  const recursos = useRecursos();
  const faladoLigado = recursos.runway && recursos.voz;
  const opcoes = useImagensPersonagem(character);
  const disponiveis = Object.keys(MODELOS_CRIAR) as ModeloCriar[];
  const [imagem, setImagem] = useState<string | null>(opcoes[0]?.key ?? null);
  const [modo, setModo] = useState<Modo>(faladoLigado ? "falado" : "cena");
  const [modelo, setModelo] = useState<ModeloCriar>("gen4.5");
  // Falado começa no roteiro inteiro: é o que o usuário escreveu para ser dito.
  const [duracao, setDuracao] = useState<number>(
    faladoLigado ? ROTEIRO_INTEIRO : DURACOES_CRIAR[0],
  );
  const [vertical, setVertical] = useState(true);
  const [audio, setAudio] = useState(false);
  /** Descrição visual: a cena (modo cena) ou a direção do avatar (modo falado). */
  const [texto, setTexto] = useState(() => cenaInicial(character));
  /** O que o personagem fala (modo falado). */
  const [fala, setFala] = useState("");
  /** Close (avatar, cabeça e ombros) ou o personagem de corpo inteiro. */
  const [enquadramento, setEnquadramento] = useState<Enquadramento>("close");
  /** Cenário de cada cena da fala (cada parágrafo é uma cena). Vazio: fundo da imagem. */
  const [cenarios, setCenarios] = useState<string[]>([]);
  const [vozes, setVozes] = useState<Voz[] | null>(null);
  const [voz, setVoz] = useState<string | null>(null);
  // Roteiros salvos em Estúdio → Textos: cada opção escrita vira uma escolha.
  const roteiros = (character.textos ?? [])
    .filter((t) => t.tipo === "roteiro")
    .flatMap((t) =>
      t.opcoes.map((opcao, i) => ({
        id: `${t.id}:${i}`,
        titulo: t.tema || tx("Roteiro de vídeo"),
        opcao: t.opcoes.length > 1 ? i + 1 : 0,
        texto: opcao,
      })),
    );
  const [roteiro, setRoteiro] = useState<string | null>(null);
  /** O modal tem duas partes, para caber na tela sem rolagem. */
  const [etapa, setEtapa] = useState<1 | 2>(1);
  /** Roteiro sendo preparado agora, e os já preparados (não cobra 2x). */
  const [convertendo, setConvertendo] = useState<string | null>(null);
  const [prontos, setProntos] = useState<
    Record<string, { cena: string; fala?: string; cenarios?: string[] }>
  >({});
  const [enviando, setEnviando] = useDuravel<boolean>(
    `criar-video:${character.id}:enviando`,
    false,
    "Enviando o vídeo para criação",
  );
  const [erro, setErro] = useDuravel<string | null>(
    `criar-video:${character.id}:erro`,
    null,
  );

  const m = MODELOS_CRIAR[modelo];
  const { conta } = useCreditos();
  const [erroCode, setErroCode] = useDuravel<string | null>(
    `criar-video:${character.id}:erroCode`,
    null,
  );
  const comAudio = m.audio && audio;
  const falado = modo === "falado";

  // Vozes do personagem (ElevenLabs), para o vídeo falado.
  const carregarVozes = useCallback(
    () =>
      fetch(`/api/voz/${encodeURIComponent(character.id)}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : { vozes: [] }))
        .then((b: { vozes?: Voz[] }) => {
          setVozes(b.vozes ?? []);
          setVoz(
            (v) =>
              v ??
              character.vozBiblioteca?.voiceId ??
              b.vozes?.[0]?.voiceId ??
              null,
          );
        })
        .catch(() => setVozes([])),
    [character.id, character.vozBiblioteca?.voiceId],
  );
  useEffect(() => {
    if (faladoLigado) void carregarVozes();
  }, [carregarVozes, faladoLigado]);

  // Vozes prontas da ElevenLabs (pt-BR, gravadas por pessoas): mais naturais
  // que a voz criada pela descrição. A escolhida fica salva no personagem.
  const atualizar = useCharacters((s) => s.update);
  const [biblioteca, setBiblioteca] = useState(false);
  const [genero, setGenero] = useState<"" | "female" | "male">("");
  const [pagina, setPagina] = useState(0);
  const [prontas, setProntas] = useState<{
    vozes: VozDaBiblioteca[];
    temMais: boolean;
  } | null>(null);
  const [adotando, setAdotando] = useState<string | null>(null);
  const [tocando, setTocando] = useState<string | null>(null);
  const somRef = useRef<HTMLAudioElement | null>(null);
  const ouvir = (id: string, url: string | null | undefined) => {
    somRef.current?.pause();
    if (!url || tocando === id) return setTocando(null);
    const som = new Audio(url);
    somRef.current = som;
    som.onended = () => setTocando(null);
    void som.play().catch(() => setTocando(null));
    setTocando(id);
  };
  useEffect(() => () => somRef.current?.pause(), []);
  useEffect(() => {
    if (!biblioteca) return;
    let vivo = true;
    setProntas(null);
    fetch(`/api/voz/biblioteca?genero=${genero}&pagina=${pagina}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) {
          setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
          return setProntas({ vozes: [], temMais: false });
        }
        setProntas(b);
      })
      .catch(() => vivo && setProntas({ vozes: [], temMais: false }));
    return () => {
      vivo = false;
    };
  }, [biblioteca, genero, pagina, setErro]);

  async function usarVozPronta(v: VozDaBiblioteca) {
    setErro(null);
    setErroCode(null);
    setAdotando(v.voiceId);
    try {
      const res = await fetch("/api/voz/biblioteca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceId: v.voiceId,
          publicOwnerId: v.publicOwnerId,
          nome: v.nome,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        voiceId?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok || !b.voiceId) {
        setErroCode(b.code ?? null);
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      }
      const escolhida = {
        voiceId: b.voiceId,
        nome: v.nome,
        previewUrl: v.previewUrl ?? undefined,
      };
      atualizar(character.id, (c) => {
        c.vozBiblioteca = escolhida;
      });
      setVoz(b.voiceId);
      somRef.current?.pause();
      setTocando(null);
      setBiblioteca(false);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAdotando(null);
    }
  }
  /** Vozes para escolher: a pronta da biblioteca (se houver) e as do personagem. */
  const vozesDoPersonagem: Voz[] | null =
    vozes === null
      ? null
      : [
          ...(character.vozBiblioteca
            ? [
                {
                  ...character.vozBiblioteca,
                  origem: "biblioteca" as const,
                  amostraKey: null,
                },
              ]
            : []),
          ...vozes,
        ];
  const vozEscolhida = vozesDoPersonagem?.find((v) => v.voiceId === voz);

  // Sem voz ainda: dá para criar aqui mesmo, pela descrição (a mesma do Estúdio).
  const [descricaoVoz, setDescricaoVoz] = useState(() =>
    descricaoInicial(character),
  );
  const [criandoVoz, setCriandoVoz] = useDuravel<boolean>(
    `criar-video:${character.id}:voz`,
    false,
    "Criando a voz",
  );
  async function criarVoz() {
    setErro(null);
    setErroCode(null);
    setCriandoVoz(true);
    try {
      const res = await fetch("/api/voz/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          modo: "design",
          descricao: descricaoVoz,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok) {
        setErroCode(b.code ?? null);
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      }
      await carregarVozes();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCriandoVoz(false);
    }
  }

  // As durações são as mesmas em todos os modelos; o que muda é em quantas
  // cenas o modelo gera (e quantos segundos isso soma, que é o que se cobra).
  const cenas = cenasDoVideo(modelo, duracao);
  const gerados = cenas.reduce((t, n) => t + n, 0);
  // Falado: o vídeo dura o que a fala durar (estimada pelo tamanho do texto).
  const segundosFala = segundosDaFala(fala);
  const falaPassa = falado && segundosFala > duracao * 1.15 + 1;
  // Cada parágrafo da fala é uma cena, com o seu cenário (o Gemini gera o fundo).
  const cenasFala = cenasDaFala(fala);
  const cenariosLigados = recursos.gemini;
  const cenariosUsados = cenariosLigados
    ? cenasFala.map((_, i) => (cenarios[i] ?? "").trim())
    : [];
  const inteiro = falado && enquadramento === "inteiro";
  // Corpo inteiro: o modelo gera segundos inteiros (mínimo 5) e até 15s por cena.
  const segundosInteiro = cenasFala.reduce(
    (t, f) => t + segundosDaCenaInteira(segundosDaFala(f)),
    0,
  );
  const cenaLonga =
    inteiro && cenasFala.some((f) => segundosDaFala(f) > CORPO_MAX_SEGUNDOS);

  /**
   * O roteiro salvo é texto de fala misturado com marcações (gancho, cenas,
   * legenda, hashtags). No falado a IA separa a fala (no tempo escolhido) e a
   * direção visual; na cena, só a descrição do que aparece.
   */
  async function usarRoteiro(r: { id: string; texto: string }) {
    if (convertendo) return;
    setRoteiro(r.id);
    setErro(null);
    setErroCode(null);
    const chave = `${r.id}:${modo}:${duracao}`;
    const aplicar = (p: {
      cena: string;
      fala?: string;
      cenarios?: string[];
    }) => {
      if (p.cena) setTexto(p.cena);
      if (p.fala) setFala(p.fala);
      if (p.cenarios) setCenarios(p.cenarios);
    };
    if (prontos[chave]) return aplicar(prontos[chave]);
    setConvertendo(r.id);
    try {
      const res = await fetch("/api/videos/cena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roteiro: r.texto.slice(0, 8000),
          duracao,
          modo,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        cena?: string;
        fala?: string;
        cenarios?: string[];
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || (falado ? !body.fala : !body.cena)) {
        setRoteiro(null);
        setErroCode(body.code ?? null);
        return setErro(txErro(body.error ?? `Falha (HTTP ${res.status}).`));
      }
      const pronto = {
        cena: (body.cena ?? "").slice(0, MAX_CENA),
        fala: body.fala?.slice(0, FALA_MAX_CARACTERES),
        cenarios: body.cenarios,
      };
      setProntos((c) => ({ ...c, [chave]: pronto }));
      aplicar(pronto);
    } catch (e) {
      setRoteiro(null);
      setErro((e as Error).message);
    } finally {
      setConvertendo(null);
    }
  }

  async function enviar() {
    if (!imagem) return setErro("Escolha a imagem do personagem.");
    if (falado) {
      if (fala.trim().length < 2)
        return setErro("Escreva o que o personagem vai falar.");
      if (!voz) return setErro("Escolha a voz do personagem.");
    } else if (texto.trim().length < 3) return setErro("Descreva a cena.");
    setErro(null);
    setErroCode(null);
    setEnviando(true);
    try {
      const res = await fetch(
        falado ? "/api/videos/falado" : "/api/videos/criar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            falado
              ? {
                  characterId: character.id,
                  imageKey: imagem,
                  voiceId: voz,
                  fala,
                  cenarios: cenariosUsados,
                  duracao,
                  enquadramento,
                }
              : {
                  characterId: character.id,
                  imageKey: imagem,
                  modelo,
                  promptText: texto,
                  duracao,
                  vertical,
                  audio: comAudio,
                },
          ),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        duracao?: number;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !body.jobId) {
        setErroCode(body.code ?? null);
        return setErro(txErro(body.error ?? `Falha ao enviar (HTTP ${res.status}).`));
      }
      onEnviado({
        jobId: body.jobId,
        duracao: body.duracao ?? duracao,
        rotulo: falado
          ? `${tx("Falado")} · ${inteiro ? tx("Corpo inteiro") : FALADO_ROTULO}`
          : MODELOS_CRIAR[modelo].label,
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const bloqueio = !conta
    ? null
    : falado
      ? bloqueioVideoFalado(conta.plano)
      : bloqueioCriarVideo(conta.plano, modelo, comAudio);
  /** Preço de `segundos` gerados no modelo, em créditos (com conta) ou dólar. */
  const preco = (id: ModeloCriar, segundos: number, comSom: boolean) =>
    conta
      ? `${creditosCriarVideo(id, segundos, comSom)} ${tx("créditos")}`
      : `~US$ ${custoCriar(id, segundos, comSom).toFixed(2)}`;
  const precoFalado = (segundos: number) =>
    conta
      ? `${creditosVideoFalado(segundos, enquadramento) + cenariosUsados.filter(Boolean).length * CREDITOS_CENARIO} ${tx("créditos")}`
      : `~US$ ${(segundos * (inteiro ? CORPO_CUSTO_POR_SEGUNDO : FALADO_CUSTO_POR_SEGUNDO) + cenariosUsados.filter(Boolean).length * 0.04).toFixed(2)}`;
  const podeAvancar =
    !!imagem &&
    !convertendo &&
    (falado ? fala.trim().length >= 2 && !falaPassa : texto.trim().length >= 3);
  const podeCriar =
    podeAvancar && !bloqueio && (!falado || (!!voz && !cenaLonga));
  const rotulo = "text-[13px] font-semibold text-ink mb-2";
  const cartao = (ativo: boolean) =>
    cn(
      "rounded-xl border px-3 py-2 text-left transition",
      ativo
        ? "border-accent bg-accent/10"
        : "border-line hover:border-line-strong",
    );
  const pilula = (ativo: boolean) =>
    cn(
      // whitespace-nowrap: no celular a pílula desce para a linha de baixo (o grupo quebra em linhas), em vez de espremer o texto dentro dela.
      "px-3 h-7 whitespace-nowrap rounded-full text-[11px] font-bold mono transition",
      ativo ? "bg-accent text-bg" : "text-ink-mute hover:text-ink",
    );
  /** Caixa de um grupo de pílulas: uma linha vira pílula; se quebrar em duas, vira cartão arredondado. */
  const grupoDePilulas =
    "flex max-w-full flex-wrap gap-1 rounded-[18px] border border-line bg-panel p-1";
  const duracoes = (
    <div className="grid grid-cols-3 gap-2">
      {DURACOES_CRIAR.map((d) => {
        const partes = cenasDoVideo(modelo, d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => setDuracao(d)}
            aria-pressed={duracao === d}
            className={cartao(duracao === d)}
          >
            <div className="text-[13px] font-bold text-ink">{d}s</div>
            <div className="truncate text-[11px] text-ink-dim">
              {partes.length === 1
                ? tx("1 cena")
                : `${partes.length} ${tx("cenas")}`}
            </div>
            <div className="mono mt-1 text-[11px] text-ink-mute">
              {preco(
                modelo,
                partes.reduce((t, n) => t + n, 0),
                comAudio,
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !enviando) onClose();
      }}
    >
      <div className="card flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line p-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="display text-xl text-ink uppercase">
              {tx("Criar vídeo do personagem")}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(
                [
                  [1, "Imagem e roteiro"],
                  [2, falado ? "Voz" : "Modelo e formato"],
                ] as const
              ).map(([n, nome]) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEtapa(n)}
                  disabled={n === 2 && !podeAvancar}
                  aria-current={etapa === n ? "step" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-full border pl-1.5 pr-3 text-[12px] font-bold transition disabled:opacity-50",
                    etapa === n
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-line text-ink-mute hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "mono grid h-5 w-5 place-items-center rounded-full text-[11px]",
                      etapa === n ? "bg-accent text-bg" : "bg-line text-ink",
                    )}
                  >
                    {n}
                  </span>
                  {tx(nome)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
            aria-label={tx("Fechar")}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-5 sm:px-6 [&>*]:min-w-0">
          {/* ---------- Parte 1: imagem e roteiro ---------- */}
          <section hidden={etapa !== 1}>
            <div className={rotulo}>{tx("Imagem do personagem")}</div>
            <EscolherImagemPersonagem
              opcoes={opcoes}
              valor={imagem}
              onChange={setImagem}
              dica={tx(
                "É o primeiro quadro do vídeo: use um retrato já no cenário e enquadramento que você quer.",
              )}
            />
          </section>

          <section hidden={etapa !== 1}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              {faladoLigado ? (
                <div className={grupoDePilulas}>
                  {(
                    [
                      ["falado", "Falado · voz do personagem"],
                      ["cena", "Só cena · sem fala"],
                    ] as const
                  ).map(([id, nome]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setModo(id);
                        setRoteiro(null);
                        // "Roteiro inteiro" só existe no falado.
                        if (id === "cena" && duracao === ROTEIRO_INTEIRO)
                          setDuracao(DURACOES_CRIAR[0]);
                        if (id === "falado") setDuracao(ROTEIRO_INTEIRO);
                      }}
                      disabled={!!convertendo}
                      aria-pressed={modo === id}
                      className={pilula(modo === id)}
                    >
                      {tx(nome)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[13px] font-semibold text-ink">
                  {tx("Cena")}
                </span>
              )}
              {falado ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-dim">
                    {tx("Duração")}
                  </span>
                  <div className={grupoDePilulas}>
                    {DURACOES_FALADO.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setDuracao(d);
                          // A fala foi tirada para outro tempo: escolher o roteiro de novo refaz.
                          setRoteiro(null);
                        }}
                        disabled={!!convertendo}
                        aria-pressed={duracao === d}
                        className={pilula(duracao === d)}
                      >
                        {d === ROTEIRO_INTEIRO ? tx("Roteiro inteiro") : `${d}s`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {roteiros.length > 0 ? (
              <div className="mb-2">
                <div className="mb-1.5 text-[11px] text-ink-dim">
                  {tx("Usar um roteiro salvo")} ·{" "}
                  {falado
                    ? duracao === ROTEIRO_INTEIRO
                      ? tx("a IA separa todas as falas do roteiro")
                      : tx("a IA resume as falas do roteiro no tempo escolhido")
                    : tx("a IA transforma a fala em descrição de cena")}
                  {conta
                    ? ` (${CREDITOS_TEXTO.cenaDoRoteiro} ${tx("crédito")})`
                    : ""}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {roteiros.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => usarRoteiro(r)}
                      disabled={!!convertendo}
                      aria-pressed={roteiro === r.id}
                      title={r.texto}
                      className={cn(
                        cartao(roteiro === r.id),
                        "w-[190px] shrink-0 disabled:opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-1.5 truncate text-[12.5px] font-bold text-ink">
                        {convertendo === r.id ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                        ) : null}
                        <span className="truncate">{r.titulo}</span>
                      </div>
                      <div className="truncate text-[11px] text-ink-dim">
                        {r.opcao ? `${tx("Opção")} ${r.opcao} · ` : ""}
                        {r.texto.replace(/\s+/g, " ")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {falado ? (
              <Textarea
                rows={4}
                className="!resize-none"
                maxLength={FALA_MAX_CARACTERES}
                placeholder={tx(
                  "O que o personagem fala no vídeo. Ex.: Gente, eu preciso contar como foi o meu primeiro dia de treino…",
                )}
                value={fala}
                disabled={!!convertendo}
                onChange={(e) => setFala(e.target.value)}
              />
            ) : (
              <Textarea
                rows={3}
                spellCheck={false}
                className="!resize-none"
                maxLength={MAX_CENA}
                placeholder={tx(
                  "Ex.: Lila caminha pela feira de domingo, para numa barraca de pastel, morde e faz uma careta de satisfação olhando pra câmera. Câmera na mão, luz de fim de tarde.",
                )}
                value={texto}
                disabled={!!convertendo}
                onChange={(e) => setTexto(e.target.value)}
              />
            )}
            <div className="mt-1 flex items-start justify-between gap-3 text-[11px] text-ink-dim">
              <p className={cn(falaPassa && "text-pink")}>
                {convertendo
                  ? tx("Preparando o roteiro…")
                  : falaPassa
                    ? `${tx("A fala tem cerca de")} ${segundosFala}s ${tx("e passa da duração escolhida: encurte o texto ou aumente a duração.")}`
                    : falado
                      ? tx(
                          "O personagem fala exatamente este texto, com a voz dele. Uma linha em branco separa as cenas (até 4): cada uma pode ter o seu cenário.",
                        )
                      : tx(
                          "Descreva ação, câmera e luz: o modelo anima a imagem, não fala o texto.",
                        )}
                {roteiros.length === 0 && !convertendo
                  ? ` ${tx("Os roteiros que você escrever em Estúdio → Textos aparecem aqui para escolher.")}`
                  : ""}
              </p>
              <span className="mono shrink-0">
                {falado
                  ? `~${segundosFala}s · ${fala.length}/${FALA_MAX_CARACTERES}`
                  : `${texto.length}/${MAX_CENA}`}
              </span>
            </div>
          </section>

          {/* ---------- Parte 2 (falado): a voz ---------- */}
          {/* ---------- Biblioteca de vozes prontas (toma o lugar da parte 2) ---------- */}
          <section hidden={etapa !== 2 || !falado || !biblioteca}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  somRef.current?.pause();
                  setTocando(null);
                  setBiblioteca(false);
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink hover:text-accent"
              >
                <ArrowLeft className="h-4 w-4" />
                {tx("Vozes naturais da ElevenLabs")}
              </button>
              <div className={grupoDePilulas}>
                {GENEROS.map(([id, nome]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setGenero(id);
                      setPagina(0);
                    }}
                    aria-pressed={genero === id}
                    className={pilula(genero === id)}
                  >
                    {tx(nome)}
                  </button>
                ))}
              </div>
            </div>
            <p className="mb-2 text-[11px] text-ink-dim">
              {tx(
                "Gravadas por pessoas de verdade, em português do Brasil. Ouça e escolha: ela vira a voz deste personagem.",
              )}
            </p>
            {prontas === null ? (
              <div className="grid h-40 place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
              </div>
            ) : prontas.vozes.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-mute">
                {tx("Nenhuma voz encontrada.")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {prontas.vozes.map((v) => (
                  <div
                    key={v.voiceId}
                    className={cn(
                      cartao(voz === v.voiceId),
                      "flex items-center gap-2.5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => ouvir(v.voiceId, v.previewUrl)}
                      disabled={!v.previewUrl}
                      aria-label={tx("Ouvir")}
                      title={tx("Ouvir")}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink transition hover:border-accent disabled:opacity-40"
                    >
                      {tocando === v.voiceId ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-ink">
                        {v.nome}
                      </div>
                      <div className="truncate text-[11px] text-ink-dim">
                        {[
                          v.genero === "female"
                            ? tx("feminina")
                            : v.genero === "male"
                              ? tx("masculina")
                              : "",
                          v.uso.replace(/_/g, " "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <Button
                      variant="accent"
                      onClick={() => usarVozPronta(v)}
                      disabled={!!adotando}
                    >
                      {adotando === v.voiceId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {tx("Usar")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
                disabled={pagina === 0 || prontas === null}
              >
                <ArrowLeft className="h-4 w-4" /> {tx("Anteriores")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPagina((p) => p + 1)}
                disabled={!prontas?.temMais}
              >
                {tx("Mais vozes")} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <section hidden={etapa !== 2 || !falado || biblioteca}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-ink">
                {tx("Voz do personagem")}
              </span>
              <button
                type="button"
                onClick={() => setBiblioteca(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-accent px-3 text-[12px] font-bold text-ink transition hover:bg-accent/10"
              >
                <Mic className="h-3.5 w-3.5" />
                {tx("Escolher voz natural (ElevenLabs)")}
              </button>
            </div>
            {vozesDoPersonagem === null ? (
              <Loader2 className="h-4 w-4 animate-spin text-ink-mute" />
            ) : vozesDoPersonagem.length === 0 ? (
              <div className="rounded-xl border border-line bg-panel p-3">
                <p className="mb-2 text-[12px] text-ink-mute">
                  {tx(
                    "Este personagem ainda não tem voz. Escolha uma voz natural no botão acima (recomendado) ou crie uma pela descrição:",
                  )}
                </p>
                <Textarea
                  rows={2}
                  maxLength={1000}
                  value={descricaoVoz}
                  disabled={criandoVoz}
                  onChange={(e) => setDescricaoVoz(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-dim">
                    {tx(
                      "Para clonar uma voz a partir de áudios, use o bloco “Voz” do Estúdio.",
                    )}
                  </span>
                  <Button
                    variant="accent"
                    onClick={criarVoz}
                    disabled={criandoVoz || descricaoVoz.trim().length < 10}
                  >
                    {criandoVoz ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                    {criandoVoz
                      ? tx("Criando a voz…")
                      : `${tx("Criar voz")}${conta ? ` · ${CREDITOS_CRIAR_VOZ} ${tx("créditos")}` : ""}`}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {vozesDoPersonagem.map((v) => (
                  <button
                    key={v.voiceId}
                    type="button"
                    onClick={() => setVoz(v.voiceId)}
                    aria-pressed={voz === v.voiceId}
                    className={cartao(voz === v.voiceId)}
                  >
                    <div className="truncate text-[13px] font-bold text-ink">
                      {v.nome}
                    </div>
                    <div className="truncate text-[11px] text-ink-dim">
                      ElevenLabs ·{" "}
                      {v.origem === "biblioteca"
                        ? tx("voz natural")
                        : v.origem === "clone"
                          ? tx("voz clonada")
                          : tx("voz criada")}
                    </div>
                  </button>
                ))}
                {vozEscolhida?.amostraKey || vozEscolhida?.previewUrl ? (
                  <audio
                    key={voz}
                    src={
                      vozEscolhida.amostraKey
                        ? fileUrl(vozEscolhida.amostraKey)
                        : vozEscolhida.previewUrl
                    }
                    controls
                    preload="none"
                    className="col-span-full h-8 w-full"
                  />
                ) : null}
              </div>
            )}
          </section>

          <section
            hidden={
              etapa !== 2 || !falado || biblioteca || !cenariosLigados
            }
          >
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold text-ink">
                {tx("Cenário de cada cena")}
              </span>
              <span className="text-[11px] text-ink-dim">
                {conta
                  ? `${CREDITOS_CENARIO} ${tx("créditos por cenário")} · `
                  : ""}
                {tx("vazio = fundo da imagem")}
              </span>
            </div>
            <div className="grid gap-1.5">
              {cenasFala.map((f, i) => (
                <label key={i} className="flex items-center gap-2">
                  <span
                    title={f}
                    className="mono w-[92px] shrink-0 truncate text-[11px] text-ink-dim"
                  >
                    {i + 1} · {f}
                  </span>
                  <Input
                    spellCheck={false}
                    maxLength={400}
                    className="h-9 text-[12.5px]"
                    placeholder={tx(
                      "Onde ele está nesta cena. Ex.: quarto gamer à noite, luz de LED roxa",
                    )}
                    value={cenarios[i] ?? ""}
                    onChange={(e) =>
                      setCenarios((c) => {
                        const n = [...c];
                        n[i] = e.target.value;
                        return n;
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </section>

          <section hidden={etapa !== 2 || !falado || biblioteca}>
            <div className={rotulo}>{tx("Enquadramento")}</div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [
                    "close",
                    "Close",
                    "Cabeça e ombros · mais barato",
                    FALADO_POR_SEGUNDO,
                    FALADO_CUSTO_POR_SEGUNDO,
                  ],
                  [
                    "inteiro",
                    "Corpo inteiro",
                    "A imagem inteira, com gestos",
                    CORPO_INTEIRO_POR_SEGUNDO,
                    CORPO_CUSTO_POR_SEGUNDO,
                  ],
                ] as const
              ).map(([id, nome, nota, creditos, dolar]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEnquadramento(id)}
                  aria-pressed={enquadramento === id}
                  className={cartao(enquadramento === id)}
                >
                  <div className="text-[13px] font-bold text-ink">
                    {tx(nome)}
                  </div>
                  <div className="truncate text-[11px] text-ink-dim">
                    {tx(nota)}
                  </div>
                  <div className="mono mt-1 text-[11px] text-ink-mute">
                    {conta
                      ? `${creditos} ${tx("créditos/s")}`
                      : `US$ ${dolar.toFixed(2)}/s`}
                  </div>
                </button>
              ))}
            </div>
            <p
              className={cn(
                "mt-2 text-[11px] leading-relaxed text-ink-dim",
                cenaLonga && "text-pink",
              )}
            >
              {cenaLonga
                ? tx(
                    "No corpo inteiro cada cena pode ter até 15s de fala: separe a fala em mais cenas (linha em branco) na parte 1.",
                  )
                : inteiro
                  ? tx(
                      "O personagem aparece de corpo inteiro, como na imagem, falando com esta voz. Cada cena tem no mínimo 5s e até 15s; o resultado varia mais que no close.",
                    )
                  : tx(
                      "Close do personagem falando com esta voz, com os lábios sincronizados. Na primeira vez o Runway prepara o avatar antes (leva um pouco mais).",
                    )}
            </p>
          </section>

          {/* ---------- Parte 2 (cena): modelo, duração e formato ---------- */}
          <section hidden={etapa !== 2 || falado}>
            <div className={rotulo}>{tx("Modelo")}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {disponiveis.map((id) => {
                const mm = MODELOS_CRIAR[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setModelo(id)}
                    aria-pressed={modelo === id}
                    className={cartao(modelo === id)}
                  >
                    <div className="text-[13px] font-bold text-ink">
                      {mm.label}
                    </div>
                    <div className="truncate text-[11px] text-ink-dim">
                      {mm.nota}
                    </div>
                    <div className="mono mt-1 text-[11px] text-ink-mute">
                      {conta
                        ? `${creditosCriarVideo(id, 1, false)} ${tx("créditos/s")}`
                        : `US$ ${mm.porSegundo.toFixed(2)}/s`}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section hidden={etapa !== 2 || falado}>
            <div className={rotulo}>{tx("Duração")}</div>
            {duracoes}
            {cenas.length > 1 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-dim">
                {tx("Gerado em")} {cenas.length} {tx("cenas seguidas")} (
                {cenas.map((c) => `${c}s`).join(" + ")}){" "}
                {tx(
                  "e unido num vídeo só: cada cena continua do último quadro da anterior. Deixe a tela aberta até terminar.",
                )}
                {gerados > duracao
                  ? ` ${tx("Este modelo gera")} ${gerados}s ${tx("e o vídeo é cortado em")} ${duracao}s.`
                  : ""}
              </p>
            ) : null}
          </section>

          <section hidden={etapa !== 2 || falado}>
            <div className={rotulo}>{tx("Formato")}</div>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  [true, "Vertical", "9:16", "h-5 w-3"],
                  [false, "Horizontal", "16:9", "h-3 w-5"],
                ] as const
              ).map(([v, nome, proporcao, forma]) => (
                <button
                  key={nome}
                  type="button"
                  onClick={() => setVertical(v)}
                  aria-pressed={vertical === v}
                  className={cn(
                    cartao(vertical === v),
                    "flex items-center gap-2.5",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-[3px] border-[1.5px]",
                      forma,
                      vertical === v ? "border-accent" : "border-ink-mute",
                    )}
                  />
                  <span>
                    <span className="block text-[13px] font-bold text-ink">
                      {tx(nome)}
                    </span>
                    <span className="mono block text-[11px] text-ink-dim">
                      {proporcao}
                    </span>
                  </span>
                </button>
              ))}
              {m.audio && (
                <label className="ml-1 inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={audio}
                    onChange={(e) => setAudio(e.target.checked)}
                    className="accent-accent h-4 w-4"
                  />
                  {tx("Com áudio")}
                </label>
              )}
            </div>
          </section>

          {bloqueio && etapa === 2 ? (
            <ErroGeracao mensagem={bloqueio} code="PLANO" />
          ) : null}
          {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line p-5 sm:px-6">
          <div className="min-w-0">
            <div className="text-[12px] text-ink-mute">
              {falado
                ? `${tx("Falado")} · ${inteiro ? tx("Corpo inteiro") : FALADO_ROTULO} · ${duracao === ROTEIRO_INTEIRO ? tx("Roteiro inteiro") : `${tx("até")} ${duracao}s`}`
                : `${MODELOS_CRIAR[modelo].label} · ${duracao}s · ${vertical ? "9:16" : "16:9"}${comAudio ? ` · ${tx("Com áudio")}` : ""}`}
            </div>
            <div className="text-[15px] font-bold text-ink">
              {falado
                ? `${fala.trim() ? "~" : `${tx("até")} `}${precoFalado(
                    !fala.trim()
                      ? duracao
                      : inteiro
                        ? segundosInteiro
                        : Math.min(duracao, Math.max(1, segundosFala)),
                  )}`
                : preco(modelo, gerados, comAudio)}
              {conta ? null : (
                <span className="text-[11px] font-normal text-ink-dim">
                  {" "}
                  {falado
                    ? tx("· cobrança real no Runway e na ElevenLabs")
                    : tx("· cobrança real no painel do Runway")}
                </span>
              )}
            </div>
          </div>
          {etapa === 1 ? (
            <Button
              variant="accent"
              size="lg"
              onClick={() => setEtapa(2)}
              disabled={!podeAvancar}
            >
              {tx("Continuar")} <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setEtapa(1)}
                disabled={enviando}
              >
                <ArrowLeft className="w-4 h-4" /> {tx("Voltar")}
              </Button>
              <Button
                variant="accent"
                size="lg"
                onClick={enviar}
                disabled={enviando || !podeCriar}
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {enviando ? tx("Enviando…") : tx("Criar vídeo")}
              </Button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
