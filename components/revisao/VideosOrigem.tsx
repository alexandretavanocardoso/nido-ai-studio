"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import {
  AlertTriangle,
  Captions,
  CircleCheck,
  CircleX,
  Clock3,
  Download,
  Ellipsis,
  Clapperboard,
  Link2,
  Loader2,
  Mic,
  Scissors,
  Send,
  Sparkles,
  Undo2,
  Upload,
  UserRound,
  X,
  type LucideIcon,
  ChevronsLeftRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { AplicarFalaModal } from "@/components/revisao/AplicarFalaModal";
import { CortarVideoModal } from "@/components/revisao/CortarVideoModal";
import { PedirReembolsoModal } from "@/components/revisao/PedirReembolsoModal";
import type { ReembolsoDoVideo } from "@/lib/video/reembolso";
import { LinkVideoModal } from "@/components/revisao/LinkVideoModal";
import type { VideoLink } from "@/components/revisao/SubstituirPessoaModal";
import type { Character, VideoArquivo } from "@/lib/types";
import { useCharacters } from "@/lib/store";
import { useDuravel } from "@/lib/duravel";
import { downloadUrl, fileUrl, uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";
import { useStorageReady } from "@/lib/storage/useStorage";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { LegendaEditor } from "@/components/revisao/LegendaEditor";
import { SubstituirPessoaModal } from "@/components/revisao/SubstituirPessoaModal";
import { CriarVideoModal } from "@/components/revisao/CriarVideoModal";
import { AntesDepois } from "@/components/revisao/AntesDepois";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

const MAX_MB = STORAGE_KINDS.videos.maxBytes / 1024 / 1024;

/** Selo de cada tipo de vídeo (fica sobre o vídeo, no canto). */
const TIPOS: Record<
  NonNullable<VideoArquivo["origem"]>,
  { rotulo: string; icon: LucideIcon; selo: string }
> = {
  upload: {
    rotulo: "Original",
    icon: Upload,
    selo: "bg-black/75 text-ink border border-line-strong",
  },
  substituicao: {
    rotulo: "Com o personagem",
    icon: Sparkles,
    selo: "bg-accent text-bg",
  },
  criado: {
    rotulo: "Criado com IA",
    icon: Clapperboard,
    selo: "bg-violet-500 text-white",
  },
  legenda: {
    rotulo: "Legenda editada",
    icon: Captions,
    selo: "bg-sky-500 text-white",
  },
  audio: { rotulo: "Com fala", icon: Mic, selo: "bg-ok text-bg" },
  corte: {
    rotulo: "Cortado",
    icon: Scissors,
    selo: "bg-orange-500 text-white",
  },
};

/** Ação secundária do cartão: só o ícone (o nome fica na dica). */
/** Estúdio → Publicar do personagem, com esta mídia já escolhida. */
const linkPublicar = (characterId: string, key: string) =>
  `/app/personagem/${characterId}?aba=estudio&secao=publicar&midia=${encodeURIComponent(key)}`;

const acaoIcone =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition hover:bg-panel hover:border-ink/50";

/** A lista é separada em dois blocos: o que a pessoa enviou e o que o app gerou. */
const GRUPOS: Array<{
  originais: boolean;
  titulo: string;
  dica: string;
  icon: LucideIcon;
}> = [
  {
    originais: true,
    titulo: "Vídeos de origem",
    dica: "O que você enviou. Use como base para trocar a pessoa, editar a legenda ou pôr uma fala.",
    icon: Upload,
  },
  {
    originais: false,
    titulo: "Feitos com IA",
    dica: "O que o Estúdio gerou a partir dos seus vídeos ou do zero. Prontos para baixar e publicar.",
    icon: Sparkles,
  },
];

/**
 * Vídeos do personagem no S3: upload direto do navegador (com progresso),
 * edição de legenda (ffmpeg no servidor), troca da pessoa pelo personagem
 * (Kling O3 ou Seedance 2.5, no fal.ai) e criação de vídeo novo (Runway). Troca e
 * criação são assíncronas — quem acompanha os jobs é o TarefasEmAndamento (app inteiro).
 */
export function VideosOrigem({ character }: { character: Character }) {
  const update = useCharacters((s) => s.update);
  const pronto = useStorageReady();
  const recursos = useRecursos();
  /** Algum serviço de troca de pessoa ligado (Kling O3 ou Seedance 2.5, no fal.ai). */
  const trocaLigada = recursos.fal;
  /** Criar vídeo: Runway ou Sapiens. */
  const criarLigado = recursos.runway || recursos.sapiens;
  const audios = character.audios ?? [];
  const [falaEm, setFalaEm] = useState<VideoArquivo | null>(null);
  /** Trocar pessoa por link: busca o vídeo (sem salvar a origem) e segue pra troca. */
  const [linkAberto, setLinkAberto] = useState(false);
  const [linkEncontrado, setLinkEncontrado] = useState<VideoLink | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useDuravel<number | null>(
    `videos:${character.id}:envio`,
    null,
    "Enviando vídeo",
  );
  const [erro, setErro] = useState<string | null>(null);
  const [legendaDe, setLegendaDe] = useState<VideoArquivo | null>(null);
  const [cortarDe, setCortarDe] = useState<VideoArquivo | null>(null);
  const [reembolsoDe, setReembolsoDe] = useState<VideoArquivo | null>(null);
  /** Pedidos de reembolso da conta, pelo job do vídeo. */
  const [reembolsos, setReembolsos] = useState<
    Record<string, ReembolsoDoVideo>
  >({});
  const temGerado = (character.videos ?? []).some(
    (v) => v.jobId || ehEdicao(v),
  );
  /** Cartão com os três pontinhos aberto. */
  const [menuDe, setMenuDe] = useState<string | null>(null);
  /** Vídeo pronto que custou créditos (gerado ou editado): dá para pedir reembolso. */
  const temReembolso = (v: VideoArquivo) =>
    !v.status && !!v.key && pronto && (!!v.jobId || ehEdicao(v));
  /** O pedido do vídeo: pelo job ou, em edição antiga (sem job), pelo arquivo. */
  const pedidoDe = (v: VideoArquivo) =>
    (v.jobId ? reembolsos[v.jobId] : undefined) ?? reembolsosPorKey[v.key];
  const [reembolsosPorKey, setReembolsosPorKey] = useState<
    Record<string, ReembolsoDoVideo>
  >({});
  useEffect(() => {
    if (!pronto || !temGerado) return;
    let vivo = true;
    fetch("/api/videos/reembolso", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { itens?: ReembolsoDoVideo[] } | null) => {
        if (vivo && b?.itens)
          setReembolsos(Object.fromEntries(b.itens.map((p) => [p.jobId, p])));
        if (vivo && b?.itens)
          setReembolsosPorKey(
            Object.fromEntries(
              b.itens.filter((p) => p.key).map((p) => [p.key!, p]),
            ),
          );
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [pronto, temGerado]);
  const [trocarDe, setTrocarDe] = useState<VideoArquivo | null>(null);
  /** Vídeo trocado aberto no "antes e depois". */
  const [comparar, setComparar] = useState<VideoArquivo | null>(null);
  const [buscandoOriginal, setBuscandoOriginal] = useState<string | null>(null);
  /**
   * Abre o "antes e depois". Troca antiga por link não tinha o original
   * guardado: o servidor recupera da cópia do vídeo buscado e guarda na conta.
   */
  async function abrirComparacao(v: VideoArquivo) {
    if (originalDe(v)) return setComparar(v);
    if (!v.jobId) return;
    setErro(null);
    setBuscandoOriginal(v.id);
    try {
      const res = await fetch(
        `/api/videos/jobs/${encodeURIComponent(v.jobId)}/antes`,
        { method: "POST" },
      );
      const b = (await res.json().catch(() => ({}))) as {
        antesKey?: string;
        error?: string;
      };
      if (!res.ok || !b.antesKey)
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      update(character.id, (c) => {
        const alvo = c.videos?.find((x) => x.id === v.id);
        if (alvo) alvo.antesKey = b.antesKey;
      });
      setComparar({ ...v, antesKey: b.antesKey });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBuscandoOriginal(null);
    }
  }
  /** Original de um vídeo trocado: o guardado na troca ou, nas antigas, o vídeo de onde ele veio. */
  const originalDe = (v: VideoArquivo): string | null =>
    v.origem !== "substituicao"
      ? null
      : (v.antesKey ??
          (character.videos ?? []).find((x) => x.id === v.origemId)?.key ??
          null) ||
        null;
  const [criarAberto, setCriarAberto] = useState(false);

  const videos = character.videos ?? [];

  if (!recursos.armazenamento) return null;

  /** Com `outros`, o vídeo entra também no estúdio desses personagens (troca com várias pessoas). */
  function adicionarVideo(
    v: Omit<VideoArquivo, "id" | "createdAt">,
    outros: string[] = [],
  ) {
    const createdAt = Date.now();
    update(character.id, (c) => {
      c.videos = [{ ...v, id: nanoid(8), createdAt }, ...(c.videos ?? [])];
    });
    // O vídeo de origem só existe na lista deste personagem.
    const copia = { ...v, origemId: undefined };
    for (const id of outros)
      update(id, (c) => {
        c.videos = [
          { ...copia, id: nanoid(8), createdAt },
          ...(c.videos ?? []),
        ];
      });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErro(null);
    if (
      !(STORAGE_KINDS.videos.types as readonly string[]).includes(file.type)
    ) {
      setErro("Formato não aceito. Use MP4, MOV ou WebM.");
      return;
    }
    if (file.size > STORAGE_KINDS.videos.maxBytes) {
      setErro(`Vídeo maior que ${MAX_MB} MB.`);
      return;
    }
    setProgresso(0);
    try {
      const key = await uploadFile(file, "videos", setProgresso);
      adicionarVideo({
        name: file.name,
        key,
        size: file.size,
        contentType: file.type,
        origem: "upload",
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setProgresso(null);
    }
  }

  function remover(id: string) {
    update(character.id, (c) => {
      c.videos = (c.videos ?? []).filter((v) => v.id !== id);
    });
  }

  const base = (v: VideoArquivo) =>
    v.name
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/ \((legenda editada|com o personagem|cortado)\)$/, "");

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-line bg-panel px-4 py-3">
        <div>
          <p className="text-[13px] text-ink-mute">
            {tx("MP4, MOV ou WebM até")} {MAX_MB}{" "}
            {tx("MB. Corte, edite a legenda, troque a pessoa pelo personagem")}
            {criarLigado ? tx(" ou crie um vídeo novo") : ""}.
          </p>
        </div>
        {pronto ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={STORAGE_KINDS.videos.types.join(",")}
              className="sr-only"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="flex gap-2 flex-wrap">
              {trocaLigada && recursos.fal && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLinkAberto(true)}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {tx("Colar link")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => inputRef.current?.click()}
                disabled={progresso !== null}
              >
                <Upload className="w-3.5 h-3.5" />
                {progresso !== null
                  ? `Enviando ${Math.round(progresso * 100)}%`
                  : tx("Enviar vídeo")}
              </Button>
              {/* Trazer um vídeo pronto (link ou arquivo) vem primeiro; criar do zero é a ação principal, no fim. */}
              {criarLigado && (
                <Button
                  size="sm"
                  variant="accent"
                  onClick={() => setCriarAberto(true)}
                >
                  <Clapperboard className="w-3.5 h-3.5" />
                  {tx("Criar vídeo")}
                </Button>
              )}
            </div>
          </>
        ) : (
          <Link
            href="/auth/login"
            className="text-[12px] font-semibold text-accent hover:underline"
          >
            {tx("Entre para enviar vídeos")}
          </Link>
        )}
      </div>

      {progresso !== null && (
        <div className="h-1.5 rounded-full bg-line overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${Math.round(progresso * 100)}%` }}
          />
        </div>
      )}

      {erro ? <div className="text-[12px] text-pink">{erro}</div> : null}

      {videos.length > 0 && (
        <div className="grid gap-7 pt-2">
          {GRUPOS.map((g) => {
            const lista = videos.filter(
              (v) => ((v.origem ?? "upload") === "upload") === g.originais,
            );
            if (!lista.length) return null;
            return (
              <section key={g.titulo} className="grid gap-3">
                <header className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      g.originais
                        ? "bg-panel text-ink-mute"
                        : "bg-accent text-bg",
                    )}
                  >
                    <g.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-ink">
                      {tx(g.titulo)}
                      <span className="ml-1.5 font-normal text-ink-dim">
                        · {lista.length}
                      </span>
                    </h3>
                    <p className="text-[12px] text-ink-dim">{tx(g.dica)}</p>
                  </div>
                </header>
                {/* O cartão precisa de ~260px para a linha de ações (botão + 5 ícones). Colunas pela largura que sobra, no máximo 3: com `xl:grid-cols-3` e o menu do app aberto, em 1280px cada cartão ficava com 220px e os ícones saíam dele. */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,max(260px,calc((100%_-_1.5rem)_/_3))),1fr))] gap-3">
                  {lista.map((v) => {
                    const tipo = TIPOS[v.origem ?? "upload"];
                    const de = v.origemId
                      ? videos.find((x) => x.id === v.origemId)
                      : undefined;
                    const podeTrocar =
                      trocaLigada &&
                      v.origem !== "substituicao" &&
                      v.origem !== "criado";
                    const versoes = videos.filter(
                      (x) => x.origemId === v.id,
                    ).length;
                    return (
                      <figure
                        key={v.id}
                        className={cn(
                          "group relative flex flex-col overflow-hidden rounded-xl border bg-bg",
                          g.originais ? "border-line" : "border-accent/30",
                        )}
                      >
                        <div className="relative bg-black">
                          {v.status === "processando" ? (
                            <div className="flex h-72 w-full flex-col items-center justify-center gap-2 text-ink-mute">
                              <Loader2 className="h-6 w-6 animate-spin" />
                              <span className="text-[12px]">
                                {v.origem === "criado"
                                  ? tx("Criando o vídeo…")
                                  : v.origem === "legenda"
                                    ? tx("Removendo a legenda com IA…")
                                    : tx("Gerando com o personagem…")}
                              </span>
                              <span className="text-[11px] text-ink-dim">
                                {v.origem === "criado"
                                  ? tx("Costuma levar de 1 a 5 min")
                                  : tx("Costuma levar de 3 a 15 min")}
                              </span>
                              <TempoDecorrido desde={v.createdAt} />
                            </div>
                          ) : v.status === "erro" ? (
                            <div className="flex h-72 w-full flex-col items-center justify-center gap-2 px-4 text-center">
                              <AlertTriangle className="h-6 w-6 text-pink" />
                              <span className="text-[12px] text-pink">
                                {txErro(v.erro ?? "O processamento falhou.")}
                              </span>
                            </div>
                          ) : (
                            <video
                              src={fileUrl(v.key)}
                              controls
                              preload="metadata"
                              className="h-72 w-full bg-black object-contain"
                            />
                          )}
                          {/* Selo do tipo, sempre visível sobre o vídeo */}
                          <span
                            className={cn(
                              "pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.5)]",
                              tipo.selo,
                            )}
                          >
                            <tipo.icon className="h-3 w-3" />
                            {tx(tipo.rotulo)}
                          </span>
                          <button
                            type="button"
                            onClick={() => remover(v.id)}
                            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white opacity-0 transition focus:opacity-100 group-hover:opacity-100"
                            aria-label={`Remover ${v.name}`}
                            title={tx("Remover")}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <figcaption className="grid flex-1 content-start gap-2 px-3 py-2.5">
                          <div
                            className={cn(
                              "relative min-w-0",
                              temReembolso(v) && "pr-8",
                            )}
                          >
                            {/* Mais opções (os três pontinhos): o reembolso fica aqui, fora da vista do cartão. */}
                            {temReembolso(v) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setMenuDe(menuDe === v.id ? null : v.id)
                                  }
                                  aria-haspopup="menu"
                                  aria-expanded={menuDe === v.id}
                                  aria-label={tx("Mais opções")}
                                  title={tx("Mais opções")}
                                  className="absolute -right-1 -top-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-mute transition hover:bg-panel hover:text-ink"
                                >
                                  <Ellipsis className="h-4 w-4" />
                                </button>
                                {menuDe === v.id ? (
                                  <>
                                    <button
                                      type="button"
                                      aria-label={tx("Fechar")}
                                      onClick={() => setMenuDe(null)}
                                      className="fixed inset-0 z-20 cursor-default"
                                    />
                                    <div
                                      role="menu"
                                      className="absolute bottom-full right-0 z-30 mb-2 w-64 overflow-hidden rounded-2xl border border-line-strong bg-card shadow-[0_12px_32px_rgba(0,0,0,0.7)]"
                                    >
                                      {pedidoDe(v) ? (
                                        <SituacaoReembolso
                                          pedido={pedidoDe(v)!}
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            setMenuDe(null);
                                            setReembolsoDe(v);
                                          }}
                                          className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-panel"
                                        >
                                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-panel text-ink-mute">
                                            <Undo2 className="h-4 w-4" />
                                          </span>
                                          <span className="min-w-0">
                                            <span className="block text-[13px] font-semibold leading-tight text-ink">
                                              {tx("Pedir reembolso")}
                                            </span>
                                            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-dim">
                                              {tx("Dos créditos deste vídeo")}
                                            </span>
                                          </span>
                                        </button>
                                      )}
                                    </div>
                                  </>
                                ) : null}
                              </>
                            ) : null}
                            <div
                              className="truncate text-[13px] font-semibold text-ink"
                              title={v.name}
                            >
                              {v.name}
                            </div>
                            <div className="truncate text-[11.5px] text-ink-dim">
                              {g.originais ? (
                                <>
                                  {v.size
                                    ? `${(v.size / 1024 / 1024).toFixed(1)} MB · `
                                    : ""}
                                  {versoes
                                    ? `${versoes} ${tx(versoes === 1 ? "versão com IA" : "versões com IA")}`
                                    : tx("ainda sem versão com IA")}
                                </>
                              ) : de ? (
                                <>
                                  {tx("A partir de:")} {de.name}
                                </>
                              ) : v.fonte ? (
                                <>
                                  {tx("A partir de:")}{" "}
                                  <a
                                    href={v.fonte}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent hover:underline"
                                  >
                                    {tx("link")}
                                  </a>
                                </>
                              ) : v.origemId ? (
                                tx("O vídeo de origem foi removido")
                              ) : (
                                tx("Criado do zero com o personagem")
                              )}
                            </div>
                          </div>
                          {!v.status && pronto && (
                            // Uma linha só: a ação principal com texto, as outras só com ícone.
                            <div className="flex items-center gap-1.5">
                              {podeTrocar ? (
                                <Button
                                  size="sm"
                                  variant="accent"
                                  className="min-w-0 flex-1 px-3"
                                  onClick={() => setTrocarDe(v)}
                                >
                                  <UserRound className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {tx("Sombra")}
                                  </span>
                                </Button>
                              ) : v.key ? (
                                <a
                                  href={downloadUrl(v.key, nomeDownload(v))}
                                  download={nomeDownload(v)}
                                  className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-3 text-[13px] font-bold text-bg transition hover:bg-accent-strong"
                                >
                                  <Download className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">
                                    {tx("Baixar")}
                                  </span>
                                </a>
                              ) : null}
                              {/* Leva o vídeo pronto para Estúdio → Publicar, já escolhido como mídia do post. */}
                              {recursos.social && v.key ? (
                                podeTrocar ? (
                                  <Link
                                    href={linkPublicar(character.id, v.key)}
                                    title={tx("Publicar")}
                                    aria-label={tx("Publicar")}
                                    className={acaoIcone}
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                  </Link>
                                ) : (
                                  <Link
                                    href={linkPublicar(character.id, v.key)}
                                    className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] font-bold text-ink transition hover:border-accent hover:text-accent"
                                  >
                                    <Send className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">
                                      {tx("Publicar")}
                                    </span>
                                  </Link>
                                )
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setCortarDe(v)}
                                title={tx("Cortar")}
                                aria-label={tx("Cortar")}
                                className={acaoIcone}
                              >
                                <Scissors className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setLegendaDe(v)}
                                title={tx("Legenda")}
                                aria-label={tx("Legenda")}
                                className={acaoIcone}
                              >
                                <Captions className="h-3.5 w-3.5" />
                              </button>
                              {audios.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setFalaEm(v)}
                                  title={tx("Adicionar fala")}
                                  aria-label={tx("Adicionar fala")}
                                  className={acaoIcone}
                                >
                                  <Mic className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {podeTrocar && v.key && (
                                <a
                                  href={downloadUrl(v.key, nomeDownload(v))}
                                  download={nomeDownload(v)}
                                  title={tx("Baixar")}
                                  aria-label={tx("Baixar")}
                                  className={acaoIcone}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          )}
                          {/* Antes e depois: uma linha própria, discreta, embaixo das ações. */}
                          {!v.status &&
                          v.key &&
                          (originalDe(v) || (v.fonte && v.jobId)) ? (
                            <button
                              type="button"
                              onClick={() => abrirComparacao(v)}
                              disabled={buscandoOriginal === v.id}
                              className="mt-1.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border border-line text-[12.5px] font-semibold text-ink-mute transition hover:border-accent hover:text-ink disabled:opacity-70"
                            >
                              {buscandoOriginal === v.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ChevronsLeftRight className="h-3.5 w-3.5" />
                              )}
                              {tx("Ver antes e depois")}
                            </button>
                          ) : null}
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {comparar && originalDe(comparar) ? (
        <AntesDepois
          antes={fileUrl(originalDe(comparar)!)}
          depois={fileUrl(comparar.key)}
          titulo={comparar.name}
          onClose={() => setComparar(null)}
        />
      ) : null}

      {legendaDe && (
        <LegendaEditor
          video={legendaDe}
          characterId={character.id}
          onClose={() => setLegendaDe(null)}
          onJob={({ jobId, duracao }) => {
            adicionarVideo({
              name: `${base(legendaDe)} (legenda editada).mp4`,
              key: "",
              size: 0,
              duracao,
              contentType: "video/mp4",
              origem: "legenda",
              origemId: legendaDe.id,
              jobId,
              status: "processando",
            });
            setLegendaDe(null);
          }}
          onPronto={({ key, size, duracao, jobId }) => {
            adicionarVideo({
              name: `${base(legendaDe)} (legenda editada).mp4`,
              key,
              size,
              duracao,
              jobId,
              contentType: "video/mp4",
              origem: "legenda",
              origemId: legendaDe.id,
            });
            setLegendaDe(null);
          }}
        />
      )}

      {reembolsoDe && (
        <PedirReembolsoModal
          video={reembolsoDe}
          onClose={() => setReembolsoDe(null)}
          onPedido={(pedido) => {
            setReembolsos((r) => ({ ...r, [pedido.jobId]: pedido }));
            setReembolsosPorKey((r) => ({ ...r, [reembolsoDe.key]: pedido }));
            setReembolsoDe(null);
          }}
        />
      )}

      {cortarDe && (
        <CortarVideoModal
          video={cortarDe}
          onClose={() => setCortarDe(null)}
          onPronto={({ key, size, duracao, jobId }) => {
            // Corte de um vídeo enviado continua sendo vídeo de origem; o de um vídeo gerado fica com os gerados.
            const enviado = (cortarDe.origem ?? "upload") === "upload";
            adicionarVideo({
              name: `${base(cortarDe)} (cortado).mp4`,
              key,
              size,
              duracao,
              jobId,
              contentType: "video/mp4",
              origem: enviado ? "upload" : "corte",
              origemId: enviado ? undefined : cortarDe.id,
            });
            setCortarDe(null);
          }}
        />
      )}

      {falaEm && (
        <AplicarFalaModal
          video={falaEm}
          audios={audios}
          onClose={() => setFalaEm(null)}
          onPronto={({ key, size, duracao, jobId }) => {
            adicionarVideo({
              name: `${base(falaEm)} (com fala).mp4`,
              key,
              size,
              duracao,
              jobId,
              contentType: "video/mp4",
              origem: "audio",
              origemId: falaEm.id,
            });
            setFalaEm(null);
          }}
        />
      )}

      {criarAberto && (
        <CriarVideoModal
          character={character}
          onClose={() => setCriarAberto(false)}
          onEnviado={({ jobId, duracao, rotulo }) => {
            adicionarVideo({
              name: `${character.identidade.nome || "personagem"} · ${rotulo}.mp4`,
              key: "",
              size: 0,
              duracao,
              contentType: "video/mp4",
              origem: "criado",
              jobId,
              status: "processando",
            });
            setCriarAberto(false);
          }}
        />
      )}

      {linkAberto && (
        <LinkVideoModal
          onClose={() => setLinkAberto(false)}
          onEncontrado={(link) => {
            setLinkAberto(false);
            setLinkEncontrado(link);
          }}
        />
      )}

      {linkEncontrado && (
        <SubstituirPessoaModal
          character={character}
          link={linkEncontrado}
          onClose={() => setLinkEncontrado(null)}
          onEnviado={({ jobId, duracao, antesKey, outros }) => {
            adicionarVideo(
              {
                antesKey,
                name: `${(linkEncontrado.titulo || `Vídeo do ${linkEncontrado.plataforma}`).slice(0, 60)} (com o personagem).mp4`,
                key: "",
                size: 0,
                duracao,
                contentType: "video/mp4",
                origem: "substituicao",
                fonte: linkEncontrado.url,
                jobId,
                status: "processando",
              },
              outros,
            );
            setLinkEncontrado(null);
          }}
        />
      )}

      {trocarDe && (
        <SubstituirPessoaModal
          character={character}
          video={trocarDe}
          onClose={() => setTrocarDe(null)}
          onEnviado={({ jobId, duracao, antesKey, outros }) => {
            adicionarVideo(
              {
                antesKey,
                name: `${base(trocarDe)} (com o personagem).mp4`,
                key: "",
                size: 0,
                duracao,
                contentType: "video/mp4",
                origem: "substituicao",
                origemId: trocarDe.id,
                jobId,
                status: "processando",
              },
              outros,
            );
            setTrocarDe(null);
          }}
        />
      )}
    </div>
  );
}

/** Edição feita na hora (corte, legenda rápida, fala): também dá para pedir reembolso. */
const ehEdicao = (v: VideoArquivo) =>
  v.origem === "legenda" || v.origem === "audio" || v.origem === "corte";

/** Em que pé está o pedido de reembolso do vídeo; recusado, mostra o porquê. */
function SituacaoReembolso({ pedido }: { pedido: ReembolsoDoVideo }) {
  const s = {
    pendente: {
      icon: Clock3,
      selo: "bg-panel text-ink-mute",
      titulo: tx("Reembolso em análise"),
      detalhe: tx("Você recebe um aviso quando sair a resposta."),
    },
    aprovado: {
      icon: CircleCheck,
      selo: "bg-ok/15 text-ok",
      titulo: tx("Reembolso aprovado"),
      detalhe: `${pedido.creditos} ${tx("créditos devolvidos")}`,
    },
    recusado: {
      icon: CircleX,
      selo: "bg-pink/15 text-pink",
      titulo: tx("Reembolso recusado"),
      detalhe: pedido.resposta ?? "",
    },
  }[pedido.status];
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full",
          s.selo,
        )}
      >
        <s.icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 pt-px">
        <div className="text-[13px] font-semibold leading-tight text-ink">
          {s.titulo}
        </div>
        {s.detalhe ? (
          <p className="mt-0.5 break-words text-[11.5px] leading-snug text-ink-mute">
            {s.detalhe}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Há quanto tempo o vídeo está sendo gerado (conta a partir do envio), atualizado a cada segundo. */
export function TempoDecorrido({ desde }: { desde: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor((agora - desde) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const seg = String(total % 60).padStart(2, "0");
  return (
    <span className="mono text-[12px] tabular-nums text-ink-mute">
      {tx("Gerando há")}{" "}
      {h ? `${h}:${String(m).padStart(2, "0")}:${seg}` : `${m}:${seg}`}
    </span>
  );
}

/** Nome do arquivo baixado: o nome do vídeo, sem acentos e com .mp4. */
function nomeDownload(v: VideoArquivo): string {
  const base = v.name
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w() -]+/g, "-")
    .trim();
  return `${base || "video"}.mp4`;
}
