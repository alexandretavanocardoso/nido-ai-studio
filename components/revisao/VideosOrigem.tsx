"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import {
  AlertTriangle,
  Captions,
  Download,
  Clapperboard,
  Link2,
  Loader2,
  Mic,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { AplicarFalaModal } from "@/components/revisao/AplicarFalaModal";
import { LinkVideoModal } from "@/components/revisao/LinkVideoModal";
import type { VideoLink } from "@/components/revisao/SubstituirPessoaModal";
import type { Character, VideoArquivo } from "@/lib/types";
import { useCharacters } from "@/lib/store";
import { downloadUrl, fileUrl, uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";
import { useStorageReady } from "@/lib/storage/useStorage";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { LegendaEditor } from "@/components/revisao/LegendaEditor";
import { SubstituirPessoaModal } from "@/components/revisao/SubstituirPessoaModal";
import { CriarVideoModal } from "@/components/revisao/CriarVideoModal";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { MODELOS_CRIAR } from "@/lib/video/precos";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

const MAX_MB = STORAGE_KINDS.videos.maxBytes / 1024 / 1024;
const POLL_MS = 10_000;

const ORIGEM_LABEL: Record<NonNullable<VideoArquivo["origem"]>, string> = {
  upload: "Original",
  legenda: "Legenda editada",
  substituicao: "Com o personagem",
  criado: "Criado",
  audio: "Com fala",
};

/**
 * Vídeos do personagem no S3: upload direto do navegador (com progresso),
 * edição de legenda (ffmpeg no servidor), troca da pessoa pelo personagem
 * (Kling O1 ou Seedance 2.5, no fal.ai) e criação de vídeo novo (Runway). Troca e
 * criação são assíncronas — os jobs em andamento são consultados a cada 10s.
 */
export function VideosOrigem({ character }: { character: Character }) {
  const update = useCharacters((s) => s.update);
  const pronto = useStorageReady();
  const recursos = useRecursos();
  /** Algum serviço de troca de pessoa ligado (Kling O1 ou Seedance 2.5, no fal.ai). */
  const trocaLigada = recursos.fal;
  /** Criar vídeo: Runway. */
  const criarLigado = recursos.runway;
  const audios = character.audios ?? [];
  const [falaEm, setFalaEm] = useState<VideoArquivo | null>(null);
  /** Trocar pessoa por link: busca o vídeo (sem salvar a origem) e segue pra troca. */
  const [linkAberto, setLinkAberto] = useState(false);
  const [linkEncontrado, setLinkEncontrado] = useState<VideoLink | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [legendaDe, setLegendaDe] = useState<VideoArquivo | null>(null);
  const [trocarDe, setTrocarDe] = useState<VideoArquivo | null>(null);
  const [criarAberto, setCriarAberto] = useState(false);

  const videos = character.videos ?? [];
  const pendentes = videos.filter((v) => v.status === "processando" && v.jobId);
  const pendentesKey = pendentes.map((v) => v.id).join(",");

  // Acompanha os jobs de troca de pessoa enquanto houver algum em andamento.
  useEffect(() => {
    if (!pronto || !pendentesKey) return;
    let ativo = true;
    async function consultar() {
      const atual = useCharacters
        .getState()
        .characters.find((c) => c.id === character.id);
      for (const v of (atual?.videos ?? []).filter(
        (x) => x.status === "processando" && x.jobId,
      )) {
        try {
          const res = await fetch(`/api/videos/jobs/${v.jobId}`, {
            cache: "no-store",
          });
          const job = (await res.json()) as {
            status?: string;
            key?: string;
            erro?: string;
            duracao?: number;
          };
          if (!ativo) return;
          if (job.status === "concluido" && job.key) {
            atualizarVideo(v.id, {
              key: job.key,
              status: undefined,
              duracao: job.duracao,
            });
          } else if (job.status === "erro" || res.status === 404) {
            atualizarVideo(v.id, {
              status: "erro",
              erro: job.erro ?? "O processamento falhou.",
            });
            avisarCreditos(); // créditos devolvidos
          }
        } catch {
          // rede instável: tenta de novo na próxima volta
        }
      }
    }
    void consultar();
    const t = setInterval(consultar, POLL_MS);
    return () => {
      ativo = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, pendentesKey, character.id]);

  if (!recursos.armazenamento) return null;

  function atualizarVideo(id: string, patch: Partial<VideoArquivo>) {
    update(character.id, (c) => {
      c.videos = (c.videos ?? []).map((v) =>
        v.id === id ? { ...v, ...patch } : v,
      );
    });
  }

  function adicionarVideo(v: Omit<VideoArquivo, "id" | "createdAt">) {
    update(character.id, (c) => {
      c.videos = [
        { ...v, id: nanoid(8), createdAt: Date.now() },
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
      .replace(/ \((legenda editada|com o personagem)\)$/, "");

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-line bg-panel px-4 py-3">
        <div>
          <p className="text-[13px] text-ink-mute">
            {tx("MP4, MOV ou WebM até")} {MAX_MB}{" "}
            {tx("MB. Edite a legenda, troque a pessoa pelo personagem")}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {videos.map((v) => (
            <figure
              key={v.id}
              className="rounded-lg overflow-hidden border border-line bg-bg relative group"
            >
              {v.status === "processando" ? (
                <div className="w-full aspect-[9/16] max-h-80 flex flex-col items-center justify-center gap-2 text-ink-mute">
                  <Loader2 className="w-6 h-6 animate-spin" />
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
                </div>
              ) : v.status === "erro" ? (
                <div className="w-full aspect-[9/16] max-h-80 flex flex-col items-center justify-center gap-2 px-4 text-center">
                  <AlertTriangle className="w-6 h-6 text-pink" />
                  <span className="text-[12px] text-pink">
                    {txErro(v.erro ?? "O processamento falhou.")}
                  </span>
                </div>
              ) : (
                <video
                  src={fileUrl(v.key)}
                  controls
                  preload="metadata"
                  className="w-full max-h-80 bg-black"
                />
              )}

              <figcaption className="px-2.5 py-2 grid gap-2">
                <div className="text-[11px] text-ink-mute truncate">
                  <span className="label-cap !text-[10px] mr-1.5">
                    {ORIGEM_LABEL[v.origem ?? "upload"]}
                  </span>
                  {v.name}
                  {v.size ? ` · ${(v.size / 1024 / 1024).toFixed(1)} MB` : ""}
                </div>
                {!v.status && pronto && (
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setLegendaDe(v)}
                    >
                      <Captions className="w-3.5 h-3.5" />
                      {tx("Legenda")}
                    </Button>
                    {audios.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setFalaEm(v)}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        {tx("Adicionar fala")}
                      </Button>
                    )}
                    {trocaLigada &&
                      v.origem !== "substituicao" &&
                      v.origem !== "criado" && (
                        <Button
                          size="sm"
                          variant="accent"
                          onClick={() => setTrocarDe(v)}
                        >
                          <UserRound className="w-3.5 h-3.5" />
                          {tx("Trocar pessoa")}
                        </Button>
                      )}
                    {v.key && (
                      <a
                        href={downloadUrl(v.key, nomeDownload(v))}
                        download={nomeDownload(v)}
                        className="inline-flex items-center justify-center gap-1.5 font-bold rounded-full h-8 px-3.5 text-[13px] text-ink border border-line-strong hover:bg-panel transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {tx("Baixar")}
                      </a>
                    )}
                  </div>
                )}
              </figcaption>

              <button
                type="button"
                onClick={() => remover(v.id)}
                className="absolute top-1.5 right-1.5 h-7 w-7 inline-flex items-center justify-center rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                aria-label={`Remover ${v.name}`}
              >
                <X className="w-4 h-4" />
              </button>
            </figure>
          ))}
        </div>
      )}

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
          onPronto={({ key, size, duracao }) => {
            adicionarVideo({
              name: `${base(legendaDe)} (legenda editada).mp4`,
              key,
              size,
              duracao,
              contentType: "video/mp4",
              origem: "legenda",
              origemId: legendaDe.id,
            });
            setLegendaDe(null);
          }}
        />
      )}

      {falaEm && (
        <AplicarFalaModal
          video={falaEm}
          audios={audios}
          onClose={() => setFalaEm(null)}
          onPronto={({ key, size, duracao }) => {
            adicionarVideo({
              name: `${base(falaEm)} (com fala).mp4`,
              key,
              size,
              duracao,
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
          onEnviado={({ jobId, duracao, modelo }) => {
            adicionarVideo({
              name: `${character.identidade.nome || "personagem"} · ${MODELOS_CRIAR[modelo].label}.mp4`,
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
          onEnviado={({ jobId, duracao }) => {
            adicionarVideo({
              name: `${(linkEncontrado.titulo || `Vídeo do ${linkEncontrado.plataforma}`).slice(0, 60)} (com o personagem).mp4`,
              key: "",
              size: 0,
              duracao,
              contentType: "video/mp4",
              origem: "substituicao",
              fonte: linkEncontrado.url,
              jobId,
              status: "processando",
            });
            setLinkEncontrado(null);
          }}
        />
      )}

      {trocarDe && (
        <SubstituirPessoaModal
          character={character}
          video={trocarDe}
          onClose={() => setTrocarDe(null)}
          onEnviado={({ jobId, duracao }) => {
            adicionarVideo({
              name: `${base(trocarDe)} (com o personagem).mp4`,
              key: "",
              size: 0,
              duracao,
              contentType: "video/mp4",
              origem: "substituicao",
              origemId: trocarDe.id,
              jobId,
              status: "processando",
            });
            setTrocarDe(null);
          }}
        />
      )}
    </div>
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
