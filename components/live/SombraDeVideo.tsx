"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Film, Link2, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import type { VideoLink } from "@/components/revisao/SubstituirPessoaModal";
import { EnviarOrigem, type ImagemEnviada } from "@/components/sombra/comum";
import { Button } from "@/components/ui/Button";
import { confirmar } from "@/components/ui/Confirmacao";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { DECLARACAO_VIDEO_LINK } from "@/lib/declaracoes";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import type { CenaLive } from "@/lib/live/tipos";
import {
  CREDITOS_LINK,
  creditosSombraVideo,
  SOMBRA_VIDEO_DIRETO_MAX_SEGUNDOS,
  SOMBRA_VIDEO_MAX_SEGUNDOS,
} from "@/lib/planos";
import { fileUrl, uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";
import type { Character } from "@/lib/types";
import { ehLinkVod, type InfoVod } from "@/worker/sombra/vod";
import { EscolherCena } from "./Cena";
import { QuemAparece, VozDaSombra, type Quem } from "./NovaSombra";
import { Colunas, pilula } from "./Preparar";
import type { VozEscolhida } from "./VozBiblioteca";

/** De onde vem o vídeo: arquivo enviado, link buscado (YouTube, TikTok…) ou live da Twitch/Kick. */
type Fonte =
  | { tipo: "arquivo"; key: string; src: string }
  | { tipo: "link"; link: VideoLink }
  | { tipo: "vod"; url: string; info: InfoVod };

type EstadoJob = { status: string; key?: string; erro?: string; progresso?: number };

const NOME_PLATAFORMA: Record<InfoVod["plataforma"], string> = { twitch: "Twitch", kick: "Kick" };

/** Número dentro da pílula (como a duração da live). */
const CAMPO_NUMERO =
  "w-12 bg-transparent text-center text-ink outline-none focus-visible:outline-none [appearance:textfield] placeholder:text-ink-dim [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** "45" ou "45,5" → minutos (NaN se não for número). */
const minutos = (t: string) => (t.trim() ? Number(t.replace(",", ".")) : NaN);

/**
 * Sombra de vídeo gravado: uma live gravada (arquivo de até 5 GB, ou o link
 * da Twitch ou do Kick — a live inteira, até 12 h) ou um trecho dela, com a
 * pessoa trocada pelo influencer, a voz original ou trocada, e o fundo novo se
 * quiser. Lives longas vão em partes pelo processo da Sombra (worker/sombra);
 * o vídeo pronto aparece aqui e na Sombra.
 */
export function FormSombraVideo({ personagens }: { personagens: Character[] }) {
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [enviandoVideo, setEnviandoVideo] = useState<number | null>(null);
  const [textoLink, setTextoLink] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [duracaoArquivo, setDuracaoArquivo] = useState(0);
  const [soTrecho, setSoTrecho] = useState(false);
  const [comecar, setComecar] = useState("0");
  const [usar, setUsar] = useState("");
  const [quem, setQuem] = useState<Quem>({ characterId: personagens[0]?.id ?? null, imageKey: null });
  const [foto, setFoto] = useState<ImagemEnviada | null>(null);
  const [voz, setVoz] = useState<VozEscolhida | null>(null);
  const [cena, setCena] = useState<CenaLive | null>(null);
  const [declarou, setDeclarou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [job, setJob] = useState<{ id: string; emPartes: boolean; estado: EstadoJob } | null>(null);
  const character = personagens.find((c) => c.id === quem.characterId) ?? null;

  // Acompanha o vídeo até ficar pronto.
  const jobId = job?.id;
  const terminou = job?.estado.status === "concluido" || job?.estado.status === "erro";
  useEffect(() => {
    if (!jobId || terminou) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/videos/jobs/${jobId}`, { cache: "no-store" }).catch(() => null);
      const b = (await r?.json().catch(() => null)) as EstadoJob | null;
      if (r?.ok && b?.status) setJob((j) => (j && j.id === jobId ? { ...j, estado: b } : j));
      if (b?.status === "erro") avisarCreditos();
    }, 5000);
    return () => clearInterval(t);
  }, [jobId, terminou]);

  // Duração e trecho (o servidor mede de novo e cobra pelo trecho).
  const total = fonte?.tipo === "vod" ? fonte.info.duracao : fonte?.tipo === "link" ? fonte.link.duracao : duracaoArquivo;
  const inicio = soTrecho ? Math.min(Math.max(0, (minutos(comecar) || 0) * 60), total) : 0;
  const fim = soTrecho && usar.trim() ? Math.min(total, inicio + minutos(usar) * 60) : total;
  const duracao = Math.max(0, fim - inicio);
  const trechoInvalido = soTrecho && (Number.isNaN(minutos(comecar) || 0) || (usar.trim() && !(minutos(usar) > 0)) || duracao < 1);
  const longo = duracao > SOMBRA_VIDEO_MAX_SEGUNDOS + 1;
  const emPartes = fonte?.tipo === "vod" || soTrecho || total > SOMBRA_VIDEO_DIRETO_MAX_SEGUNDOS;

  function novaFonte(f: Fonte | null) {
    setFonte(f);
    setDuracaoArquivo(0);
    setSoTrecho(false);
    setComecar("0");
    setUsar("");
    setDeclarou(false);
    setErro(null);
  }

  async function escolherVideo(file: File) {
    const regras = STORAGE_KINDS.lives;
    if (!(regras.types as readonly string[]).includes(file.type)) return setErro(tx("Envie um vídeo MP4, MOV ou WebM."));
    if (file.size > regras.maxBytes) return setErro(tx("O vídeo passa de 5 GB. Use o link da Twitch ou do Kick, ou envie um trecho."));
    setErro(null);
    setEnviandoVideo(0);
    try {
      const key = await uploadFile(file, "lives", (p) => setEnviandoVideo(p));
      novaFonte({ tipo: "arquivo", key, src: URL.createObjectURL(file) });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviandoVideo(null);
    }
  }

  /** Twitch/Kick: só confere (a live inteira, sem baixar). Outras redes: o buscador de vídeos (até 3 min). */
  async function buscarLink() {
    const url = textoLink.trim();
    if (!url) return;
    setErro(null);
    setBuscando(true);
    try {
      if (ehLinkVod(url)) {
        const res = await fetch("/api/live/sombra-video/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const b = (await res.json().catch(() => ({}))) as Partial<InfoVod> & { error?: string };
        if (!res.ok || !b.duracao) return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
        return novaFonte({ tipo: "vod", url, info: b as InfoVod });
      }
      const res = await fetch("/api/videos/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const b = (await res.json().catch(() => ({}))) as Partial<VideoLink> & { error?: string };
      avisarCreditos();
      if (!res.ok || !b.linkId) return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      novaFonte({
        tipo: "link",
        link: {
          linkId: b.linkId,
          url,
          plataforma: b.plataforma ?? "link",
          titulo: b.titulo ?? null,
          autor: b.autor ?? null,
          thumb: b.thumb ?? null,
          videoUrl: b.videoUrl ?? null,
          duracao: b.duracao ?? 0,
        },
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  const creditos = creditosSombraVideo(duracao);
  const falta = !quem.imageKey
    ? tx("Falta escolher quem entra no lugar.")
    : !total
      ? tx("Lendo o vídeo…")
      : trechoInvalido
        ? tx("Confira o trecho: o começo tem que estar dentro do vídeo.")
        : longo
          ? tx("O trecho pode ter até 12 horas.")
          : !declarou
            ? tx("Falta marcar a declaração.")
            : null;

  async function gerar() {
    if (falta || !fonte) return;
    if (emPartes) {
      const ok = await confirmar({
        titulo: tx("Gerar o vídeo?"),
        mensagem: `${tx("Serão cobrados")} ${creditos} ${tx("créditos")} (${relogio(duracao)}). ${tx("O vídeo é feito em partes de 5 minutos: lives longas levam horas. Se a troca falhar, os créditos voltam.")}`,
        confirmar: tx("Gerar o vídeo"),
      });
      if (!ok) return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/live/sombra-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(fonte.tipo === "vod"
            ? { link: fonte.url }
            : fonte.tipo === "link"
              ? { linkId: fonte.link.linkId }
              : { videoKey: fonte.key }),
          trecho: soTrecho ? { inicio, fim } : undefined,
          imageKey: quem.imageKey,
          voiceId: voz?.voiceId ?? null,
          cenario: cena && "prompt" in cena ? cena.prompt : undefined,
          declaracao: DECLARACAO_VIDEO_LINK,
        }),
      });
      const b = (await res.json().catch(() => ({}))) as { jobId?: string; emPartes?: boolean; error?: string };
      avisarCreditos();
      if (!res.ok || !b.jobId) return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      setJob({ id: b.jobId, emPartes: !!b.emPartes, estado: { status: "na_fila" } });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (job) {
    const p = job.estado.progresso;
    return (
      <div className="grid gap-4">
        {job.estado.status === "concluido" && job.estado.key ? (
          <>
            <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              {tx("Pronto! O vídeo também está na Sombra.")}
            </p>
            <video src={fileUrl(job.estado.key)} controls playsInline className="max-h-[480px] w-full rounded-2xl border border-line bg-black" />
          </>
        ) : job.estado.status === "erro" ? (
          <p className="text-[14px] text-pink">
            {job.estado.erro ? txErro(job.estado.erro) : tx("A troca falhou. Os créditos foram devolvidos.")}
          </p>
        ) : (
          <div className="card grid justify-items-center gap-2 p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <p className="text-[14px] text-ink">
              {job.estado.status === "finalizando"
                ? tx("Pondo o áudio de volta no vídeo…")
                : job.emPartes && job.estado.status === "na_fila"
                  ? tx("Na fila do processo da Sombra…")
                  : tx("A IA está trocando a pessoa no vídeo…")}
            </p>
            {job.emPartes && p !== undefined ? (
              <div className="grid w-full max-w-sm gap-1">
                <div className="h-2 overflow-hidden rounded-full bg-panel">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(p * 100)}%` }} />
                </div>
                <span className="mono text-[12px] text-ink-mute">{Math.round(p * 100)}%</span>
              </div>
            ) : null}
            <p className="text-[12px] text-ink-mute">
              {job.emPartes
                ? tx("O vídeo é feito em partes de 5 minutos. Pode fechar esta página: ele aparece na Sombra quando ficar pronto.")
                : tx("Leva alguns minutos (mais nos vídeos longos). Pode sair desta página: o vídeo aparece na Sombra quando ficar pronto.")}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/app/sombra" className="text-[13px] font-semibold text-accent hover:underline">
            {tx("Abrir a Sombra")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setJob(null);
              novaFonte(null);
            }}
            className="text-[13px] font-semibold text-ink-mute hover:text-ink cursor-pointer"
          >
            {tx("Fazer outro")}
          </button>
        </div>
      </div>
    );
  }

  if (!fonte)
    return (
      <div className="grid gap-3">
        <EnviarOrigem
          titulo={tx("Envie a live gravada")}
          texto={tx(
            "Clique ou arraste o vídeo (MP4, MOV ou WebM, até 5 GB). A pessoa vira o influencer com os mesmos movimentos, expressões e boca; o áudio continua o do vídeo, ou com a voz trocada.",
          )}
          accept="video/mp4,video/quicktime,video/webm"
          enviando={enviandoVideo}
          onArquivo={escolherVideo}
          icone={<Film className="h-6 w-6" />}
        />
        <div className="grid gap-1.5">
          <span className="label-cap">{tx("Ou cole o link")}</span>
          <div className="flex gap-2">
            <Input
              value={textoLink}
              onChange={(e) => setTextoLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void buscarLink()}
              placeholder={tx("Link da live na Twitch ou no Kick (ou de um vídeo do YouTube, TikTok…)")}
            />
            <Button variant="ghost" onClick={() => void buscarLink()} disabled={buscando || !textoLink.trim()}>
              {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {tx("Buscar")}
            </Button>
          </div>
          <span className="text-[12px] text-ink-dim">
            {tx("Twitch e Kick: a live gravada inteira (VOD) ou um clipe, sem custo para buscar.")}{" "}
            {tx("YouTube, TikTok, Instagram e X: vídeos de até 3 min,")} {CREDITOS_LINK} {tx("créditos para buscar.")}
          </span>
        </div>
        {erro ? <p className="text-[13px] text-pink">{erro}</p> : null}
      </div>
    );

  return (
    <>
      <Colunas
        imagem={
          <>
            <div className="grid gap-1.5">
              <span className="label-cap">{tx("Vídeo")}</span>
              {fonte.tipo === "vod" ? (
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
                  {fonte.info.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fonte.info.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : null}
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white">
                    {NOME_PLATAFORMA[fonte.info.plataforma]} · {fonte.info.tipo === "vod" ? tx("Live gravada") : tx("Clipe")}
                  </span>
                </div>
              ) : (
                <video
                  src={fonte.tipo === "arquivo" ? fonte.src : (fonte.link.videoUrl ?? undefined)}
                  poster={fonte.tipo === "link" ? (fonte.link.thumb ?? undefined) : undefined}
                  controls
                  playsInline
                  onLoadedMetadata={(e) => {
                    if (fonte.tipo !== "arquivo") return;
                    // WebM gravado pelo navegador vem sem duração: pede um MP4.
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0) setDuracaoArquivo(d);
                    else setErro(tx("Não consegui ler a duração deste vídeo. Converta para MP4 e envie de novo."));
                  }}
                  className="aspect-video w-full rounded-xl border border-line bg-black object-contain"
                />
              )}
              <div className="flex items-center gap-2 text-[12px] text-ink-mute">
                {total ? <span className="mono shrink-0">{relogio(total)}</span> : null}
                <span className="truncate">
                  {fonte.tipo === "vod"
                    ? [fonte.info.canal, fonte.info.titulo].filter(Boolean).join(" — ")
                    : fonte.tipo === "link"
                      ? fonte.link.titulo
                      : null}
                </span>
                <button
                  type="button"
                  onClick={() => novaFonte(null)}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" /> {tx("Trocar vídeo")}
                </button>
              </div>
            </div>

            {/* Quanto usar: o vídeo inteiro ou um trecho (começa no minuto X e usa Y minutos). */}
            <div className="grid gap-2">
              <span className="label-cap">{tx("Quanto usar")}</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setSoTrecho(false)} className={cn(pilula(!soTrecho), "h-8 px-3 cursor-pointer")}>
                  {tx("Vídeo inteiro")}
                </button>
                <button type="button" onClick={() => setSoTrecho(true)} className={cn(pilula(soTrecho), "h-8 px-3 cursor-pointer")}>
                  {tx("Só um trecho")}
                </button>
              </div>
              {soTrecho ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={cn(pilula(false), "gap-2 cursor-text focus-within:border-accent")}>
                      {tx("Começar no minuto")}
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={comecar}
                        onChange={(e) => setComecar(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        aria-label={tx("Começar no minuto")}
                        className={CAMPO_NUMERO}
                      />
                    </label>
                    <label className={cn(pilula(false), "gap-2 cursor-text focus-within:border-accent")}>
                      {tx("Usar")}
                      <input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        value={usar}
                        onChange={(e) => setUsar(e.target.value)}
                        placeholder={tx("tudo")}
                        aria-label={tx("Minutos a usar")}
                        className={CAMPO_NUMERO}
                      />
                      min
                    </label>
                  </div>
                  <span className="text-[12px] text-ink-dim">
                    {total && !trechoInvalido
                      ? `${tx("Do")} ${relogio(inicio)} ${tx("ao")} ${relogio(fim)} (${relogio(duracao)}). `
                      : ""}
                    {tx("Ex.: numa live de 120 min, começar no minuto 45 e usar 30. Vazio: até o fim.")}
                  </span>
                </>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <span className="label-cap">{tx("Quem entra no lugar")}</span>
              <QuemAparece personagens={personagens} valor={quem} onChange={setQuem} foto={foto} onFoto={setFoto} />
            </div>
          </>
        }
        resto={
          <>
            <VozDaSombra
              character={character}
              valor={voz}
              onChange={setVoz}
              propria="Voz original"
              nota={
                voz
                  ? "A fala é trocada pela voz escolhida, com o mesmo ritmo e emoção. O som de fundo (jogo, música) sai do vídeo: fica só a voz."
                  : "O áudio do vídeo continua como está."
              }
            />
            <EscolherCena valor={cena} onChange={setCena} sombra="video" />
            <label className="flex items-start gap-2 text-[12px] text-ink-mute cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={declarou} onChange={(e) => setDeclarou(e.target.checked)} />
              <span>{tx(DECLARACAO_VIDEO_LINK)}</span>
            </label>
          </>
        }
      />

      <div className="-mx-4 -mb-4 mt-1 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-4 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
        <div className="mr-auto grid gap-0.5">
          <span className="text-[15px] font-bold text-ink">
            {total && !trechoInvalido && !longo ? `${relogio(duracao)} · ${creditos} ${tx("créditos")}` : "—"}
          </span>
          {falta ? <span className="text-[13px] font-semibold text-pink">{falta}</span> : null}
          <span className="max-w-xl text-[12px] text-ink-dim">
            {emPartes
              ? tx("Cobrado pelo trecho escolhido. Lives longas são feitas em partes e levam horas; se a troca falhar, os créditos voltam.")
              : tx("Cobrado pela duração do vídeo; se a troca falhar, os créditos voltam.")}
          </span>
        </div>
        <Button variant="accent" onClick={gerar} disabled={enviando || !!falta}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {tx("Gerar o vídeo")}
        </Button>
        {erro ? <p className="basis-full text-[13px] text-pink">{erro}</p> : null}
      </div>
    </>
  );
}

/** 4:05, ou 1:04:05 com horas. */
function relogio(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
