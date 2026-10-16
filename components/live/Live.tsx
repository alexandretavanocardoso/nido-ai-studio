"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Crosshair,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Minus,
  Plus,
  Radio,
  Send,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { RemoteTrack } from "livekit-client";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import { Button } from "@/components/ui/Button";
import { confirmar } from "@/components/ui/Confirmacao";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import {
  ehSombra as ehSombraTipo,
  REDES_TRANSMISSAO,
  type CenaLive,
  type LiveResumo,
  type PersonaSalva,
} from "@/lib/live/tipos";
import { creditosLive, creditosSombra3d, creditosSombraAoVivo } from "@/lib/planos";
import type { TrocaLive } from "@/lib/prompts/live";
import { fileUrl, uploadFile } from "@/lib/storage/client";
import { useCharacters } from "@/lib/store";
import type { Character } from "@/lib/types";
import type { MensagemChat } from "./chat-twitch";
import { EscolherCena } from "./Cena";
import { GuiaDiscord } from "./GuiaDiscord";
import { ControlesDoJogo, type JogoNaTela } from "./Jogo";
import { LinkDoPalco } from "./LinkDoPalco";
import { FormSombra3D, FormSombraAoVivo } from "./NovaSombra";
import { FormSombraVideo } from "./SombraDeVideo";
import { Colunas, PrepararLive } from "./Preparar";
import { ConexoesChat, NOME_ORIGEM } from "./Chats";
import { SalaLive, type EstadoSala } from "./sala";
import {
  podeAtrasarVideo,
  SINCRONIA_3D_MS,
  SINCRONIA_MAX_MS,
  SINCRONIA_PADRAO_MS,
  SombraAoVivo,
  type EstadoSombra,
} from "./sombra";
// Só o tipo: o motor 3D (three.js e MediaPipe) é carregado quando a live é da Sombra 3D.
import type { Sombra3D } from "./sombra3d";
import { PainelTransmissao } from "./Transmissao";
import { VozBiblioteca, type VozEscolhida } from "./VozBiblioteca";

/**
 * Live (/app/live): o personagem ao vivo. Prepara o avatar a partir de uma
 * imagem, entra no ar (a duração é cobrada; o que não usar volta) e responde o
 * chat com a voz dele. Quem opera conduz por esta página; o palco (link para o
 * OBS) mostra só o avatar. Em teste: só admin (lib/em-teste.ts).
 */
export function Live() {
  const id = useSearchParams()?.get("id");
  return id ? <PainelLive id={id} /> : <NovaLive />;
}

const NOME_STATUS: Record<LiveResumo["status"], string> = {
  preparando: "Preparando",
  pronta: "Pronta",
  no_ar: "No ar",
  encerrada: "Encerrada",
  erro: "Erro",
};

function Cabecalho({ voltar, children }: { voltar: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-start gap-3">
      <Link
        href={voltar}
        aria-label={tx("Voltar")}
        className="h-10 w-10 shrink-0 rounded-full border border-line grid place-items-center text-ink-mute hover:text-ink hover:border-line-strong transition"
      >
        <ArrowLeft className="w-4 h-4" />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight flex items-center gap-2">
          <Radio className="w-6 h-6 text-accent" />
          {tx("Live")}
        </h1>
        {children}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Nova live                                                            */
/* ------------------------------------------------------------------ */

interface Voz {
  voiceId: string;
  nome: string;
}

type ModoNova = "personagem" | "foto" | "sombra" | "sombra3d" | "sombra_video";

function NovaLive() {
  const router = useRouter();
  const personagens = useCharacters((s) => s.characters);
  const ordenados = useMemo(
    () => [...personagens].sort((a, b) => b.updatedAt - a.updatedAt),
    [personagens],
  );
  const [characterId, setCharacterId] = useState<string>("");
  const character = ordenados.find((c) => c.id === characterId) ?? ordenados[0];
  const [modo, setModo] = useState<ModoNova | null>(null);
  const modoAtual: ModoNova = modo ?? (character ? "personagem" : "foto");
  const [lives, setLives] = useState<LiveResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/live", { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as { lives?: LiveResumo[]; error?: string };
        if (!r.ok) setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
        setLives(b.lives ?? []);
      })
      .catch(() => setLives([]));
  }, []);

  const aoCriar = (l: LiveResumo) => router.push(`/app/live?id=${l.id}`);

  return (
    <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-[minmax(0,1fr)] gap-6">
      <Cabecalho voltar="/app">
        <p className="text-[15px] text-ink-mute mt-1 max-w-3xl">
          {tx(
            "Ao vivo com avatar em tempo real: ele responde o chat com a voz escolhida e o NIDO transmite direto para as redes (ou pelo OBS).",
          )}
        </p>
      </Cabecalho>
      {erro ? <p className="text-[13px] text-pink">{erro}</p> : null}

      <section className="card p-4 sm:p-6 grid gap-5">
        <div role="tablist" className="-mx-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {(
            [
              ["personagem", "Personagem"],
              ["foto", "Foto avulsa"],
              ["sombra", "Sombra ao vivo"],
              ["sombra3d", "Sombra 3D"],
              ["sombra_video", "Sombra de vídeo"],
            ] as const
          ).map(([m, rotulo]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === modoAtual}
              onClick={() => setModo(m)}
              className={cn(
                "relative h-10 shrink-0 whitespace-nowrap px-4 text-[14px] font-semibold cursor-pointer",
                m === modoAtual ? "text-ink" : "text-ink-mute hover:text-ink",
              )}
            >
              {tx(rotulo)}
              {m === modoAtual && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </div>

        {modoAtual === "sombra" ? (
          <FormSombraAoVivo personagens={ordenados} onCriada={aoCriar} />
        ) : modoAtual === "sombra3d" ? (
          <FormSombra3D personagens={ordenados} onCriada={aoCriar} />
        ) : modoAtual === "sombra_video" ? (
          <FormSombraVideo personagens={ordenados} />
        ) : modoAtual === "foto" ? (
          <FormFotoAvulsa onCriada={aoCriar} />
        ) : !character ? (
          <p className="text-[14px] text-ink-mute">
            {tx("Você ainda não tem personagens. Use uma foto avulsa ou crie um personagem.")}
          </p>
        ) : (
          <FormPersonagem
            key={character.id}
            character={character}
            personagens={ordenados}
            onPersonagem={setCharacterId}
            onCriada={aoCriar}
          />
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="label-cap">{tx("Lives recentes")}</h2>
        {lives === null ? (
          <Loader2 className="w-4 h-4 animate-spin text-ink-mute" />
        ) : lives.length === 0 ? (
          <p className="text-[13px] text-ink-mute">{tx("Nenhuma live ainda.")}</p>
        ) : (
          <ul className="grid gap-2">
            {lives.map((l) => {
              const c = personagens.find((p) => p.id === l.characterId);
              return (
                <li key={l.id}>
                  <Link
                    href={`/app/live?id=${l.id}`}
                    className="card card-hover flex items-center gap-3 px-4 py-3 text-[13px]"
                  >
                    <span className="font-semibold text-ink truncate">
                      {c?.identidade.nome || l.persona?.nome || tx("Personagem")}
                    </span>
                    {ehSombraTipo(l.tipo) ? (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                        {tx(l.tipo === "sombra3d" ? "Sombra 3D" : "Sombra")}
                      </span>
                    ) : null}
                    <span className="text-ink-mute">
                      {new Date(l.createdAt).toLocaleString()} · {l.duracaoMin} min
                    </span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                        l.status === "no_ar"
                          ? "bg-pink/20 text-pink"
                          : l.status === "erro"
                            ? "bg-pink/10 text-pink"
                            : "bg-panel text-ink-mute",
                      )}
                    >
                      {tx(NOME_STATUS[l.status])}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

/** Live com personagem: imagem e voz dele (ou uma voz pronta, que fica salva nele). */
function FormPersonagem({
  character,
  personagens,
  onPersonagem,
  onCriada,
}: {
  character: Character;
  personagens: Character[];
  onPersonagem: (id: string) => void;
  onCriada: (l: LiveResumo) => void;
}) {
  const atualizar = useCharacters((s) => s.update);
  const opcoes = useImagensPersonagem(character);
  const [imagem, setImagem] = useState<string | null>(
    opcoes.find((o) => o.key === character.visual.capaKey)?.key ?? opcoes[0]?.key ?? null,
  );
  const [vozes, setVozes] = useState<Voz[] | null>(null);
  const [voz, setVoz] = useState<string | null>(null);
  const [biblioteca, setBiblioteca] = useState(false);
  const [cena, setCena] = useState<CenaLive | null>(null);

  useEffect(() => {
    fetch(`/api/voz/${encodeURIComponent(character.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { vozes: [] }))
      .then((b: { vozes?: Voz[] }) => {
        const lista = [
          ...(character.vozBiblioteca
            ? [{ voiceId: character.vozBiblioteca.voiceId, nome: character.vozBiblioteca.nome }]
            : []),
          ...(b.vozes ?? []).filter((v) => v.voiceId !== character.vozBiblioteca?.voiceId),
        ];
        setVozes(lista);
        setVoz((atual) => atual ?? lista[0]?.voiceId ?? null);
      })
      .catch(() => setVozes([]));
  }, [character.id, character.vozBiblioteca]);

  /** Voz pronta escolhida aqui: vira a voz do personagem (como no vídeo falado). */
  function usarVoz(v: VozEscolhida) {
    atualizar(character.id, (c) => {
      c.vozBiblioteca = v;
    });
    setVoz(v.voiceId);
    setBiblioteca(false);
  }

  return (
    <>
      <Colunas
        imagem={
          <>
            {personagens.length > 1 && (
              <label className="grid gap-1.5">
                <span className="label-cap">{tx("Personagem")}</span>
                <Select value={character.id} onChange={(e) => onPersonagem(e.target.value)}>
                  {personagens.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.identidade.nome || tx("Sem nome")}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <div className="grid gap-1.5">
              <span className="label-cap">{tx("Imagem do avatar")}</span>
              <EscolherImagemPersonagem
                opcoes={opcoes}
                valor={imagem}
                onChange={setImagem}
                compacto
                dica={tx("Um retrato de frente, do peito para cima, funciona melhor.")}
              />
            </div>
          </>
        }
        resto={
          <>
            <div className="grid gap-1.5">
              <span className="label-cap">{tx("Voz")}</span>
              {vozes === null ? (
                <Loader2 className="w-4 h-4 animate-spin text-ink-mute" />
              ) : (
                <div className="grid gap-2">
                  {vozes.length > 0 ? (
                    <Select value={voz ?? ""} onChange={(e) => setVoz(e.target.value)}>
                      {vozes.map((v) => (
                        <option key={v.voiceId} value={v.voiceId}>
                          {v.nome}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-[13px] text-ink-mute">
                      {tx("Este personagem ainda não tem voz: escolha uma pronta.")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setBiblioteca((b) => !b)}
                    className="justify-self-start text-[12px] font-semibold text-accent hover:underline cursor-pointer"
                  >
                    {biblioteca
                      ? tx("Fechar vozes prontas")
                      : vozes.length
                        ? tx("Escolher outra voz pronta")
                        : tx("Escolher voz pronta")}
                  </button>
                </div>
              )}
              {biblioteca ? (
                <>
                  <span className="text-[12px] text-ink-dim">
                    {tx("A voz escolhida fica salva como voz deste personagem.")}
                  </span>
                  <VozBiblioteca onEscolher={usarVoz} />
                </>
              ) : null}
            </div>
            <EscolherCena valor={cena} onChange={setCena} />
          </>
        }
      />

      <PrepararLive
        falta={
          !imagem
            ? tx("Falta escolher a imagem do avatar.")
            : !voz
              ? tx("Falta escolher a voz.")
              : null
        }
        comCena={!!cena}
        corpo={() => ({ characterId: character.id, imageKey: imagem, voiceId: voz, cena: cena ?? undefined })}
        onCriada={onCriada}
      />
    </>
  );
}

/** Live sem personagem: foto enviada agora, quem é e como fala, e uma voz pronta. */
function FormFotoAvulsa({ onCriada }: { onCriada: (l: LiveResumo) => void }) {
  const [imagem, setImagem] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [voz, setVoz] = useState<VozEscolhida | null>(null);
  const [salvas, setSalvas] = useState<PersonaSalva[] | null>(null);
  const [cena, setCena] = useState<CenaLive | null>(null);

  useEffect(() => {
    fetch("/api/live/personas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { personas: [] }))
      .then((b: { personas?: PersonaSalva[] }) => setSalvas(b.personas ?? []))
      .catch(() => setSalvas([]));
  }, []);

  /** Preenche tudo com uma persona de uma live anterior (o avatar é reaproveitado). */
  function usarSalva(p: PersonaSalva) {
    setImagem(p.imageKey);
    setNome(p.nome);
    setDescricao(p.descricao);
    setVoz({ voiceId: p.voiceId, nome: p.vozNome || tx("Voz da live anterior") });
    setCena(p.cena);
  }

  async function tirarDaLista(p: PersonaSalva) {
    const q = new URLSearchParams({ imageKey: p.imageKey, nome: p.nome });
    const res = await fetch(`/api/live/personas?${q}`, { method: "DELETE" }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { personas?: PersonaSalva[] } | null;
    if (b?.personas) setSalvas(b.personas);
  }

  async function enviarFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErroFoto(null);
    setEnviandoFoto(true);
    try {
      setImagem(await uploadFile(arquivo, "refs"));
    } catch (e) {
      setErroFoto((e as Error).message);
    } finally {
      setEnviandoFoto(false);
    }
  }

  return (
    <>
      {salvas && salvas.length > 0 ? (
        <div className="grid gap-1.5">
          <span className="label-cap">{tx("Salvas")}</span>
          <div className="flex flex-wrap gap-2">
            {salvas.map((p) => {
              const escolhida = imagem === p.imageKey && nome === p.nome;
              return (
                <div
                  key={`${p.imageKey}:${p.nome}`}
                  className={cn(
                    "flex items-center gap-2 rounded-full border py-1 pl-1 pr-2",
                    escolhida ? "border-accent bg-accent/15" : "border-line",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => usarSalva(p)}
                    className="flex items-center gap-2 text-[13px] font-semibold text-ink cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileUrl(p.imageKey)} alt="" className="h-7 w-7 rounded-full object-cover" />
                    {p.nome}
                  </button>
                  <button
                    type="button"
                    aria-label={tx("Tirar da lista")}
                    onClick={() => void tirarDaLista(p)}
                    className="p-0.5 text-ink-dim hover:text-pink cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <span className="text-[12px] text-ink-dim">
            {tx("Escolha uma para repetir a foto, a descrição e a voz. Toda live com foto avulsa fica salva aqui.")}
          </span>
        </div>
      ) : null}

      <Colunas
        imagem={
          <div className="grid gap-1.5">
            <span className="label-cap">{tx("Foto do avatar")}</span>
            <label
              className={cn(
                "relative grid aspect-square w-full max-w-[300px] cursor-pointer place-items-center overflow-hidden rounded-2xl border transition",
                imagem ? "border-line" : "border-dashed border-line-strong hover:border-accent hover:bg-accent/5",
              )}
            >
              {imagem ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(imagem)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm">
                    {enviandoFoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {tx("Trocar foto")}
                  </span>
                </>
              ) : (
                <span className="grid justify-items-center gap-2 p-6 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
                    {enviandoFoto ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  </span>
                  <span className="text-[14px] font-semibold text-ink">{tx("Enviar foto")}</span>
                  <span className="text-[12px] text-ink-dim">{tx("JPG, PNG ou WebP")}</span>
                </span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={enviandoFoto}
                onChange={(e) => void enviarFoto(e.target.files?.[0])}
              />
            </label>
            <span className="text-[12px] text-ink-dim">
              {tx("Um retrato de frente, do peito para cima, funciona melhor. Use só fotos que você tem direito de usar.")}
            </span>
            {erroFoto ? <span className="text-[12px] text-pink">{erroFoto}</span> : null}
          </div>
        }
        resto={
          <>
            <label className="grid gap-1.5">
              <span className="label-cap">{tx("Nome")}</span>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={60}
                placeholder={tx("Como ele(a) se chama na live")}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="label-cap">{tx("Quem é e como fala")}</span>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                maxLength={1500}
                placeholder={tx("Ex.: Barista de 30 anos, apaixonado por café especial. Fala de um jeito descontraído, com humor, e sempre puxa conversa sobre viagens.")}
              />
            </label>

            <div className="grid gap-1.5">
              <span className="label-cap">{tx("Voz")}</span>
              {voz ? (
                <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
                  <b className="text-ink">{voz.nome}</b>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setVoz(null)}>
                    {tx("Trocar")}
                  </Button>
                </div>
              ) : (
                <VozBiblioteca onEscolher={setVoz} />
              )}
            </div>

            <EscolherCena valor={cena} onChange={setCena} />
          </>
        }
      />

      <PrepararLive
        falta={
          !imagem
            ? tx("Falta enviar a foto do avatar.")
            : !nome.trim()
              ? tx("Falta o nome.")
              : descricao.trim().length < 10
                ? tx("Falta descrever quem é e como fala (pelo menos uma frase).")
                : !voz
                  ? tx("Falta escolher a voz.")
                  : null
        }
        comCena={!!cena}
        corpo={() => ({
          persona: { nome, descricao, vozNome: voz?.nome },
          imageKey: imagem,
          voiceId: voz?.voiceId,
          cena: cena ?? undefined,
        })}
        onCriada={onCriada}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Painel da live                                                       */
/* ------------------------------------------------------------------ */

interface ItemFila extends MensagemChat {
  id: number;
}

const MAX_FILA = 50;

/** Modo apresentador: quanto silêncio esperar antes de falar por conta própria. */
type Ritmo = "calmo" | "normal" | "agitado";
const SILENCIO_MS: Record<Ritmo, number> = { calmo: 15_000, normal: 7_000, agitado: 2_500 };
const NOME_RITMO: Record<Ritmo, string> = { calmo: "Calmo", normal: "Normal", agitado: "Agitado" };

function PainelLive({ id }: { id: string }) {
  const personagens = useCharacters((s) => s.characters);
  const [live, setLive] = useState<LiveResumo | null>(null);
  const [restante, setRestante] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoSala | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [ouvir, setOuvir] = useState(true);

  const salaRef = useRef<SalaLive | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [trilhaVideo, setTrilhaVideo] = useState<RemoteTrack | null>(null);
  const [trilhaAudio, setTrilhaAudio] = useState<RemoteTrack | null>(null);
  /** Imagem que virou o avatar, para conferir antes de entrar no ar. */
  const [previa, setPrevia] = useState<string | null>(null);
  /** O que o avatar está falando agora (legenda no palco). */
  const [falando, setFalando] = useState<string | null>(null);
  const [aba, setAba] = useState<"chat" | "jogo" | "transmitir" | "obs">("transmitir");
  /** Jogo na tela (tela compartilhada ou vídeo gravado): o avatar vai para o canto. */
  const [jogo, setJogo] = useState<JogoNaTela | null>(null);
  const jogoRef = useRef<HTMLVideoElement>(null);
  const urlDoVideo = useRef<string | null>(null);
  /** Sombra ao vivo: a webcam virando o influencer (components/live/sombra.ts). */
  const sombraRef = useRef<SombraAoVivo | null>(null);
  const [videoSombra, setVideoSombra] = useState<MediaStream | null>(null);
  const [estadoSombra, setEstadoSombra] = useState<EstadoSombra | null>(null);
  const [filaSombra, setFilaSombra] = useState<number | null>(null);
  /** Ajustada pela pessoa (null: o padrão do tipo de live). */
  const [sincroniaEscolhida, setSincronia] = useState<number | null>(null);
  const [mudo, setMudo] = useState(false);
  /** Sombra 3D: o avatar 3D desta página (components/live/sombra3d.ts). */
  const sombra3dRef = useRef<Sombra3D | null>(null);
  const carregando3dRef = useRef(false);
  const montadoRef = useRef(true);
  const [avatar3d, setAvatar3d] = useState<{
    modeloKey: string | null;
    desenhoKey: string | null;
    fundoKey: string | null;
  } | null>(null);
  const [estado3d, setEstado3d] = useState<"carregando" | "pronto" | null>(null);
  const [camera3d, setCamera3d] = useState(false);
  const [semRosto, setSemRosto] = useState(false);

  const character = personagens.find((c) => c.id === live?.characterId);
  const noAr = live?.status === "no_ar";
  const conectado = !!estado && estado !== "desconectada";
  /** Quem aparece é a pessoa da webcam (Sombra ao vivo ou 3D). */
  const ehSombra = ehSombraTipo(live?.tipo);
  const eh3d = live?.tipo === "sombra3d";
  const sincronia = sincroniaEscolhida ?? (eh3d ? SINCRONIA_3D_MS : SINCRONIA_PADRAO_MS);
  /** Tem vídeo no palco: o avatar do Runway, a webcam transformada ou o avatar 3D. */
  const temVideo = !!trilhaVideo || !!videoSombra;
  /** O palco está indo para a sala (o avatar 3D aparece antes, em prévia). */
  const aoVivo = eh3d ? noAr && conectado && temVideo : temVideo;

  // Entrou no ar: o chat passa a ser a aba principal.
  useEffect(() => {
    if (noAr && conectado) setAba("chat");
  }, [noAr, conectado]);

  const atualizar = useCallback(async () => {
    const res = await fetch(`/api/live/${id}`, { cache: "no-store" }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as {
      live?: LiveResumo;
      restante?: number | null;
      previa?: string | null;
      avatar3d?: { modeloKey: string | null; desenhoKey: string | null; fundoKey: string | null } | null;
      error?: string;
    } | null;
    if (!res?.ok || !b?.live) {
      if (b?.error) setErro(txErro(b.error));
      return;
    }
    setLive(b.live);
    if (b.restante !== undefined) setRestante(b.restante);
    if (b.avatar3d) setAvatar3d(b.avatar3d);
    if (b.previa) setPrevia(b.previa);
    else if (b.live.tipo === "sombra") setPrevia(fileUrl(b.live.imageKey));
    // Sombra 3D: a versão desenho (de onde saiu o 3D) até o avatar carregar.
    else if (b.live.tipo === "sombra3d") setPrevia(fileUrl(b.avatar3d?.desenhoKey ?? b.live.imageKey));
    if (b.live.status === "encerrada") avisarCreditos();
  }, [id]);

  useEffect(() => {
    void atualizar();
  }, [atualizar]);

  // Preparando: confere o avatar a cada 4s. No ar: acerta o relógio a cada 20s.
  useEffect(() => {
    if (live?.status !== "preparando" && live?.status !== "no_ar") return;
    const t = setInterval(atualizar, live.status === "preparando" ? 4000 : 20_000);
    return () => clearInterval(t);
  }, [live?.status, atualizar]);

  // Relógio local entre as conferências.
  useEffect(() => {
    if (!noAr || !conectado) return;
    const t = setInterval(() => setRestante((r) => (r === null ? r : Math.max(0, r - 1))), 1000);
    return () => clearInterval(t);
  }, [noAr, conectado]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !trilhaVideo) return;
    trilhaVideo.attach(el);
    return () => void trilhaVideo.detach(el);
  }, [trilhaVideo]);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !ehSombra) return;
    el.srcObject = videoSombra;
    if (videoSombra) void el.play().catch(() => {});
  }, [videoSombra, ehSombra]);
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !trilhaAudio) return;
    trilhaAudio.attach(el);
    return () => void trilhaAudio.detach(el);
  }, [trilhaAudio]);

  // Fechar a página encerra a live (o avatar sai e o tempo que sobrou volta).
  useEffect(() => {
    if (!noAr || !conectado) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    const fechar = () => navigator.sendBeacon(`/api/live/${id}/encerrar`);
    window.addEventListener("beforeunload", avisar);
    window.addEventListener("pagehide", fechar);
    return () => {
      window.removeEventListener("beforeunload", avisar);
      window.removeEventListener("pagehide", fechar);
    };
  }, [noAr, conectado, id]);
  // Sombra 3D: com o modelo pronto, carrega o avatar (three.js e MediaPipe só
  // agora) e ele já aparece no palco, em repouso. Testar com a câmera é de graça.
  const modelo3d = avatar3d?.modeloKey ?? null;
  const fundo3d = avatar3d?.fundoKey ?? null;
  const pode3d = eh3d && (live?.status === "pronta" || live?.status === "no_ar") && !!modelo3d;
  const vozTrocada = !!live?.voiceId;
  useEffect(() => {
    if (!pode3d || !modelo3d || sombra3dRef.current || carregando3dRef.current) return;
    carregando3dRef.current = true;
    setEstado3d("carregando");
    void (async () => {
      const { Sombra3D } = await import("./sombra3d");
      if (!montadoRef.current) return;
      const s = new Sombra3D({
        liveId: id,
        vozTrocada,
        sincroniaMs: sincronia,
        ao: {
          video: (v) => sombra3dRef.current === s && setVideoSombra(v),
          semRosto: setSemRosto,
          erro: (m) => setErro(txErro(m)),
        },
      });
      sombra3dRef.current = s;
      await s.carregar(fileUrl(modelo3d), fundo3d ? fileUrl(fundo3d) : null);
      if (sombra3dRef.current === s) setEstado3d("pronto");
    })()
      .catch((e) => {
        console.error("[sombra3d] carregar", e);
        setEstado3d(null);
        setErro(`${tx("Não consegui carregar o avatar 3D:")} ${(e as Error).message}`);
      })
      .finally(() => {
        carregando3dRef.current = false;
      });
    // A sincronia entra só ao criar; depois vai por ajustarSincronia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pode3d, modelo3d, fundo3d, id, vozTrocada]);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  // Sair da página pelo menu também encerra.
  useEffect(
    () => () => {
      void sombraRef.current?.parar();
      sombraRef.current = null;
      void sombra3dRef.current?.parar();
      sombra3dRef.current = null;
      const sala = salaRef.current;
      if (!sala) return;
      salaRef.current = null;
      void sala.sair();
      void fetch(`/api/live/${id}/encerrar`, { method: "POST", keepalive: true });
    },
    [id],
  );

  async function entrar() {
    if (live?.tipo === "sombra") return entrarSombra(live);
    if (live?.tipo === "sombra3d") return entrarSombra3d(live);
    if (live?.status === "pronta") {
      const ok = await confirmar({
        titulo: tx("Entrar no ar?"),
        mensagem: `${tx("Serão cobrados")} ${creditosLive(live.duracaoMin)} ${tx("créditos")} (${live.duracaoMin} min). ${tx("O que você não usar volta ao encerrar.")}`,
        confirmar: tx("Entrar no ar"),
      });
      if (!ok) return;
    }
    setErro(null);
    setEntrando(true);
    try {
      const res = await fetch(`/api/live/${id}/iniciar`, { method: "POST" });
      const b = (await res.json().catch(() => ({}))) as {
        url?: string;
        token?: string;
        restante?: number;
        error?: string;
      };
      avisarCreditos();
      if (!res.ok || !b.url || !b.token)
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      setRestante(b.restante ?? null);
      if (!salaRef.current || estado === "desconectada") {
        const sala = new SalaLive({ estado: setEstado, video: setTrilhaVideo, audio: setTrilhaAudio });
        salaRef.current = sala;
        await sala.conectar(b.url, b.token);
      }
      await atualizar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEntrando(false);
    }
  }

  /**
   * Sombra ao vivo: liga a câmera (antes de cobrar: se o navegador não deixar,
   * nada é cobrado), entra na sala e abre o Lucy. Se só o Lucy caiu, reabre.
   */
  async function entrarSombra(l: LiveResumo) {
    if (l.status === "pronta") {
      const ok = await confirmar({
        titulo: tx("Entrar no ar?"),
        mensagem: `${tx("Serão cobrados")} ${creditosSombraAoVivo(l.duracaoMin)} ${tx("créditos")} (${l.duracaoMin} min). ${tx("O que você não usar volta ao encerrar.")}`,
        confirmar: tx("Entrar no ar"),
      });
      if (!ok) return;
    }
    setErro(null);
    setEntrando(true);
    try {
      if (sombraRef.current && salaRef.current && conectado) return await sombraRef.current.conectar();
      await sombraRef.current?.parar();
      const sala = new SalaLive({ estado: setEstado, video: setTrilhaVideo, audio: setTrilhaAudio });
      const sombra = new SombraAoVivo({
        room: sala.room,
        liveId: id,
        imagem: fileUrl(l.imageKey),
        vozTrocada: !!l.voiceId,
        ao: {
          estado: (e, posicao) => {
            setEstadoSombra(e);
            setFilaSombra(posicao ?? null);
          },
          video: setVideoSombra,
          erro: (m) => setErro(txErro(m)),
        },
      });
      sombra.ajustarSincronia(sincronia);
      try {
        await sombra.abrirCamera();
      } catch (e) {
        setEstadoSombra(null);
        return setErro(erroDaCamera(e));
      }
      const res = await fetch(`/api/live/${id}/iniciar`, { method: "POST" });
      const b = (await res.json().catch(() => ({}))) as { url?: string; token?: string; restante?: number; error?: string };
      avisarCreditos();
      if (!res.ok || !b.url || !b.token) {
        await sombra.parar();
        setEstadoSombra(null);
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      }
      setRestante(b.restante ?? null);
      salaRef.current = sala;
      sombraRef.current = sombra;
      await sala.conectar(b.url, b.token);
      await atualizar();
      await sombra.conectar();
    } catch (e) {
      setErro(txErro((e as Error).message));
    } finally {
      setEntrando(false);
    }
  }

  /** Sombra 3D: liga a câmera só nesta página (sem custo), para ver o avatar copiando. */
  async function testarCamera3d() {
    const s = sombra3dRef.current;
    if (!s) return;
    setErro(null);
    try {
      await s.abrirCamera();
      setCamera3d(true);
    } catch (e) {
      setErro(erroDaCamera(e));
    }
  }

  /**
   * Sombra 3D: liga a câmera (antes de cobrar), cobra a duração, entra na sala
   * e publica o avatar e a voz. Voltar para a sala (a conexão caiu) publica de novo.
   */
  async function entrarSombra3d(l: LiveResumo) {
    const s = sombra3dRef.current;
    if (!s || estado3d !== "pronto") return setErro(tx("O avatar 3D ainda está carregando."));
    if (l.status === "pronta") {
      const ok = await confirmar({
        titulo: tx("Entrar no ar?"),
        mensagem: `${tx("Serão cobrados")} ${creditosSombra3d(l.duracaoMin, !!l.voiceId)} ${tx("créditos")} (${l.duracaoMin} min). ${tx("O que você não usar volta ao encerrar.")}`,
        confirmar: tx("Entrar no ar"),
      });
      if (!ok) return;
    }
    setErro(null);
    setEntrando(true);
    try {
      try {
        await s.abrirCamera();
        setCamera3d(true);
      } catch (e) {
        return setErro(erroDaCamera(e));
      }
      const res = await fetch(`/api/live/${id}/iniciar`, { method: "POST" });
      const b = (await res.json().catch(() => ({}))) as { url?: string; token?: string; restante?: number; error?: string };
      avisarCreditos();
      if (!res.ok || !b.url || !b.token) return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      setRestante(b.restante ?? null);
      const sala = new SalaLive({ estado: setEstado, video: setTrilhaVideo, audio: setTrilhaAudio });
      salaRef.current = sala;
      await sala.conectar(b.url, b.token);
      await atualizar();
      await s.conectar(sala.room);
    } catch (e) {
      setErro(txErro((e as Error).message));
    } finally {
      setEntrando(false);
    }
  }

  /** Tira o jogo da tela (para de publicar e limpa o vídeo). */
  const pararJogo = useCallback(async () => {
    await salaRef.current?.pararJogo();
    const el = jogoRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.srcObject = null;
    }
    if (urlDoVideo.current) URL.revokeObjectURL(urlDoVideo.current);
    urlDoVideo.current = null;
    setJogo(null);
  }, []);

  async function compartilharTela() {
    const sala = salaRef.current;
    const el = jogoRef.current;
    if (!sala || !el) return;
    const trilha = await sala.compartilharTela(() => void pararJogo());
    if (!trilha) return;
    el.srcObject = new MediaStream([trilha]);
    el.muted = true;
    await el.play().catch(() => {});
    setJogo({ tipo: "tela" });
  }

  async function usarVideo(arquivo: File) {
    const sala = salaRef.current;
    const el = jogoRef.current;
    if (!sala || !el) return;
    await pararJogo();
    const url = URL.createObjectURL(arquivo);
    urlDoVideo.current = url;
    el.srcObject = null;
    el.src = url;
    el.loop = true;
    el.muted = false;
    await el.play();
    await sala.publicarVideo(el, ouvir);
    setJogo({ tipo: "video", nome: arquivo.name });
  }

  /** Imagem do jogo agora (JPEG em base64), para a IA comentar. */
  const pegarTela = useCallback((): string | null => {
    const el = jogoRef.current;
    if (!jogo || !el || !el.videoWidth) return null;
    const largura = Math.min(768, el.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = Math.round((el.videoHeight / el.videoWidth) * largura);
    canvas.getContext("2d")?.drawImage(el, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.6).split(",")[1] ?? null;
  }, [jogo]);

  function mudarSincronia(passo: number) {
    const novo = Math.min(SINCRONIA_MAX_MS, Math.max(0, sincronia + passo));
    setSincronia(novo);
    sombraRef.current?.ajustarSincronia(novo);
    sombra3dRef.current?.ajustarSincronia(novo);
  }

  async function encerrar() {
    const ok = await confirmar({
      titulo: tx("Encerrar a live?"),
      mensagem: tx("O avatar sai do ar e os minutos que sobraram voltam como créditos."),
      confirmar: tx("Encerrar"),
      tom: "perigo",
    });
    if (!ok) return;
    await pararJogo();
    await sombraRef.current?.parar();
    sombraRef.current = null;
    setEstadoSombra(null);
    await sombra3dRef.current?.parar();
    sombra3dRef.current = null;
    setEstado3d(null);
    setCamera3d(false);
    const sala = salaRef.current;
    salaRef.current = null;
    await sala?.sair();
    const res = await fetch(`/api/live/${id}/encerrar`, { method: "POST" }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { live?: LiveResumo } | null;
    if (b?.live) setLive(b.live);
    avisarCreditos();
  }

  if (!live)
    return (
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6 sm:py-8 grid gap-6">
        <Cabecalho voltar="/app/live" />
        {erro ? (
          <p className="text-[13px] text-pink">{erro}</p>
        ) : (
          <Loader2 className="w-5 h-5 animate-spin text-ink-mute" />
        )}
      </main>
    );

  const nome = character?.identidade.nome || live.persona?.nome || tx("Personagem");
  const palcoAtivo = live.status === "pronta" || noAr;
  const podeEntrar = !conectado || (ehSombra ? estadoSombra === "caiu" : estado === "avatar_saiu");
  const precoNoAr = eh3d
    ? creditosSombra3d(live.duracaoMin, !!live.voiceId)
    : ehSombra
      ? creditosSombraAoVivo(live.duracaoMin)
      : creditosLive(live.duracaoMin);
  /** O que mostrar no palco enquanto não há vídeo (ou a sombra caiu/reconecta). */
  const avisoSombra = eh3d
    ? estado3d === "carregando"
      ? tx("Carregando o avatar 3D…")
      : camera3d && semRosto
        ? tx("Não estou vendo o seu rosto. Fique de frente para a câmera, com luz no rosto.")
        : null
    : estadoSombra === "camera" || (entrando && !estadoSombra)
      ? tx("Ligando a câmera…")
      : estadoSombra === "conectando"
        ? tx("Transformando a sua câmera no influencer…")
        : estadoSombra === "na_fila"
          ? `${tx("Na fila da Decart")}${filaSombra ? ` (${tx("posição")} ${filaSombra})` : ""}…`
          : estadoSombra === "caiu"
            ? tx("A Sombra caiu. Clique em Reconectar a Sombra.")
            : null;
  /** Girando: algo está a caminho (não é um aviso parado, como "sem rosto" ou "caiu"). */
  const avisoGirando = eh3d ? estado3d === "carregando" : estadoSombra !== "caiu";

  return (
    <main className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <Cabecalho voltar="/app/live">
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-ink-mute">
            <span className="font-semibold text-ink">{nome}</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                noAr ? "bg-pink/20 text-pink" : live.status === "erro" ? "bg-pink/10 text-pink" : "bg-panel text-ink-mute",
              )}
            >
              {tx(NOME_STATUS[live.status])}
            </span>
            {noAr && restante !== null ? (
              <span className="mono text-[12px]">
                {tx("restam")} {relogio(restante)}
              </span>
            ) : null}
          </p>
        </Cabecalho>
        {palcoAtivo ? (
          <div className="ml-auto flex flex-wrap items-center gap-2 self-center">
            {conectado && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setOuvir((o) => {
                    salaRef.current?.ouvirJogo(!o);
                    return !o;
                  })
                }
                title={tx("Ouvir o avatar nesta página")}
              >
                {ouvir ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                {ouvir ? tx("Ouvindo aqui") : tx("Mudo aqui")}
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={encerrar}>
              <Square className="w-3.5 h-3.5" />
              {noAr ? tx("Encerrar") : tx("Descartar")}
            </Button>
            {podeEntrar ? (
              <Button variant="accent" onClick={entrar} disabled={entrando || (eh3d && estado3d !== "pronto")}>
                {entrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                {live.status === "pronta"
                  ? `${tx("Entrar no ar")} · ${precoNoAr} ${tx("créditos")}`
                  : ehSombra && estadoSombra === "caiu"
                    ? tx("Reconectar a Sombra")
                    : estado === "avatar_saiu"
                      ? tx("Trazer o avatar de volta")
                      : tx("Voltar para a sala")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {erro ? <p className="text-[13px] text-pink">{erro}</p> : null}

      {live.status === "preparando" && (
        <div className="card p-8 grid justify-items-center gap-3 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <p className="text-[14px] text-ink">
            {eh3d
              ? tx("Montando o avatar 3D: a foto vira um personagem de desenho e depois um modelo 3D.")
              : tx("O Runway está montando o avatar a partir da imagem.")}
          </p>
          <p className="text-[12px] text-ink-mute">{tx("Leva de 1 a 3 minutos. Pode deixar esta página aberta.")}</p>
        </div>
      )}

      {live.status === "erro" && (
        <div className="card p-6 grid gap-2">
          <p className="text-[14px] text-pink">{live.erro || tx("O avatar não pôde ser preparado.")}</p>
          <Link href="/app/live" className="text-[13px] font-semibold text-accent hover:underline">
            {tx("Tentar com outra imagem")}
          </Link>
        </div>
      )}

      {live.status === "encerrada" && (
        <div className="card p-6 grid gap-1 text-[14px]">
          <p className="text-ink font-semibold">{tx("Live encerrada.")}</p>
          <p className="text-ink-mute">
            {tx("Tempo no ar")}: {relogio(live.segundos ?? 0)} · {tx("Créditos cobrados")}: {live.creditos ?? 0}
          </p>
          <Link href="/app/live" className="mt-2 text-[13px] font-semibold text-accent hover:underline">
            {tx("Fazer outra live")}
          </Link>
        </div>
      )}

      {palcoAtivo && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="grid gap-2">
            {/* Palco: o mesmo que as redes recebem (16:9). */}
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black">
              {!temVideo && previa ? (
                // Antes do vídeo chegar: a imagem que virou o avatar (já no cenário),
                // ocupando o palco inteiro — o corte guarda o rosto, no alto.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previa} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_25%]" />
              ) : null}
              {/* Jogo: sempre montado (o navegador precisa dele para tocar e capturar). */}
              <video
                ref={jogoRef}
                playsInline
                className={cn("absolute inset-0 h-full w-full bg-black object-contain", !jogo && "invisible")}
              />
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "absolute",
                  jogo
                    ? "bottom-[3%] right-[2%] aspect-square w-[24%] rounded-2xl border-4 border-white/90 bg-black object-cover shadow-2xl"
                    : "inset-0 h-full w-full object-cover",
                  !temVideo && "invisible",
                )}
              />
              <audio ref={audioRef} autoPlay muted={!ouvir} />

              {/* Selos no alto: ao vivo, tempo e redes recebendo. */}
              <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2">
                {aoVivo ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pink px-2.5 py-1 text-[11px] font-bold text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    {tx("AO VIVO")}
                    {restante !== null ? <span className="mono font-semibold">· {relogio(restante)}</span> : null}
                  </span>
                ) : (
                  <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                    {tx("Prévia")}
                  </span>
                )}
                {live.transmitindo.map((r) => (
                  <span
                    key={r}
                    className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm"
                  >
                    {REDES_TRANSMISSAO[r].nome}
                  </span>
                ))}
              </div>

              {/* Legenda: o que o avatar está falando agora. */}
              {temVideo && falando ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-5 pb-4 pt-10">
                  <p className="mx-auto max-w-3xl text-center text-[15px] font-medium leading-snug text-white">
                    {falando}
                  </p>
                </div>
              ) : null}

              {/* Enquanto o avatar não está no vídeo: o que está acontecendo. */}
              {ehSombra && (avisoSombra || (eh3d ? noAr && !conectado : !temVideo)) ? (
                <div className="absolute inset-x-0 bottom-0 grid justify-items-center bg-gradient-to-t from-black/85 to-transparent px-5 pb-5 pt-12 text-center text-[13px] text-white">
                  {avisoSombra ? (
                    <span className="inline-flex items-center gap-2">
                      {avisoGirando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {avisoSombra}
                    </span>
                  ) : noAr ? (
                    tx("Volte para a sala para continuar a live.")
                  ) : (
                    tx("Esta foto vai aparecer no lugar da sua webcam, com os seus movimentos. Entre no ar quando quiser.")
                  )}
                </div>
              ) : null}
              {!ehSombra && !trilhaVideo && (
                <div className="absolute inset-x-0 bottom-0 grid justify-items-center bg-gradient-to-t from-black/85 to-transparent px-5 pb-5 pt-12 text-center text-[13px] text-white">
                  {estado === "conectando" || estado === "esperando_avatar" || entrando ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {tx("O avatar está entrando na sala…")}
                    </span>
                  ) : estado === "avatar_saiu" ? (
                    tx("O avatar saiu da sala.")
                  ) : noAr ? (
                    tx("Volte para a sala para continuar a live.")
                  ) : (
                    tx("Esta é a prévia do avatar. Entre no ar quando quiser.")
                  )}
                </div>
              )}
            </div>
            {eh3d && estado3d === "pronto" && !conectado ? (
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-mute">
                {camera3d ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => sombra3dRef.current?.centralizar()}>
                      <Crosshair className="w-4 h-4" />
                      {tx("Centralizar o avatar")}
                    </Button>
                    <span>{tx("Fique de frente para a tela, do jeito que vai ficar na live, e clique: esse jeito vira o centro.")}</span>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={testarCamera3d}>
                      <Camera className="w-4 h-4" />
                      {tx("Testar com a câmera")}
                    </Button>
                    <span>{tx("Só nesta página, sem custo: o avatar copia você antes de entrar no ar.")}</span>
                  </>
                )}
              </div>
            ) : null}
            {ehSombra && conectado ? (
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-mute">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setMudo((m) => {
                      sombraRef.current?.mutar(!m);
                      sombra3dRef.current?.mutar(!m);
                      return !m;
                    })
                  }
                >
                  {mudo ? <MicOff className="w-4 h-4 text-pink" /> : <Mic className="w-4 h-4" />}
                  {mudo ? tx("Microfone desligado") : tx("Microfone ligado")}
                </Button>
                {eh3d ? (
                  <Button variant="ghost" size="sm" onClick={() => sombra3dRef.current?.centralizar()}>
                    <Crosshair className="w-4 h-4" />
                    {tx("Centralizar o avatar")}
                  </Button>
                ) : null}
                <span className="ml-1">{tx("Sincronia da voz")}</span>
                <button
                  type="button"
                  aria-label={tx("Voz mais cedo")}
                  onClick={() => mudarSincronia(-50)}
                  className="grid h-7 w-7 place-items-center rounded-full border border-line text-ink-mute hover:text-ink cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="mono w-14 text-center text-ink">{sincronia} ms</span>
                <button
                  type="button"
                  aria-label={tx("Voz mais tarde")}
                  onClick={() => mudarSincronia(50)}
                  className="grid h-7 w-7 place-items-center rounded-full border border-line text-ink-mute hover:text-ink cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {live.voiceId && !podeAtrasarVideo() ? (
                  <span className="basis-full text-ink-dim">
                    {tx("Neste navegador a voz trocada sai alguns segundos depois da boca. Use o Chrome ou o Edge para sincronizar.")}
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="text-[12px] text-ink-dim">
              {ehSombra
                ? tx("O palco mostra o mesmo que as redes recebem. Se a boca e a voz não casarem, ajuste a sincronia. Marque a live como conteúdo feito com IA na plataforma.")
                : tx("O palco mostra o mesmo que as redes recebem. Marque a live como conteúdo feito com IA na plataforma.")}
            </p>
          </section>

          <aside className="grid content-start gap-3">
            <div role="tablist" className="grid grid-cols-4 gap-1 rounded-full border border-line p-1">
              {(
                [
                  ["chat", "Chat"],
                  ["transmitir", "Transmitir"],
                  ["jogo", "Jogo"],
                  ["obs", "OBS e Discord"],
                ] as const
              ).map(([a, rotulo]) => (
                <button
                  key={a}
                  type="button"
                  role="tab"
                  aria-selected={aba === a}
                  onClick={() => setAba(a)}
                  className={cn(
                    "h-8 truncate rounded-full px-2 text-[12px] font-semibold transition cursor-pointer",
                    aba === a ? "bg-accent text-bg" : "text-ink-mute hover:text-ink",
                  )}
                >
                  {tx(rotulo)}
                  {a === "transmitir" && live.transmitindo.length ? ` · ${live.transmitindo.length}` : ""}
                </button>
              ))}
            </div>

            {/* As abas ficam montadas: o chat (fila e conexões) e a transmissão não podem se perder ao trocar. */}
            <div className={cn(aba !== "chat" && "hidden")}>
              {noAr && conectado && ehSombra ? (
                <ChatDaSombra id={id} />
              ) : noAr && conectado ? (
                <Conducao
                  sala={salaRef}
                  id={id}
                  avatarNoAr={!!trilhaVideo}
                  onFalando={setFalando}
                  pegarTela={pegarTela}
                />
              ) : (
                <div className="card grid gap-2 p-5 text-[13px] text-ink-mute">
                  <p className="font-semibold text-ink">{tx("O chat abre quando a live entrar no ar.")}</p>
                  <p>
                    {ehSombra
                      ? tx("Aqui você liga o chat da Twitch, do YouTube, do Kick e do Discord para ler as mensagens num lugar só enquanto fala.")
                      : tx("Aqui você liga o chat da Twitch, do YouTube, do Kick e do Discord (ou cola as mensagens) e responde uma a uma ou deixa o avatar responder sozinho.")}
                  </p>
                </div>
              )}
            </div>
            <div className={cn(aba !== "transmitir" && "hidden")}>
              <PainelTransmissao
                id={id}
                noAr={noAr && conectado}
                avatarNoAr={aoVivo}
                transmitindo={live.transmitindo}
              />
            </div>
            <div className={cn(aba !== "jogo" && "hidden")}>
              <ControlesDoJogo
                id={id}
                conectado={noAr && conectado}
                jogo={jogo}
                onTela={compartilharTela}
                onVideo={usarVideo}
                onParar={pararJogo}
                sombra={ehSombra}
              />
            </div>
            <div className={cn("grid gap-3", aba !== "obs" && "hidden")}>
              <div className="card grid gap-2 p-4">
                <span className="label-cap">{tx("Palco para o OBS")}</span>
                <p className="text-[12px] text-ink-mute">
                  {tx("Use no OBS como fonte de navegador (1280×720) para transmitir pelo OBS ou levar o avatar para outro app.")}
                </p>
                <LinkDoPalco id={id} />
              </div>
              <GuiaDiscord id={id} />
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

/** Por que a câmera não abriu, em palavras de gente. */
function erroDaCamera(e: unknown): string {
  const nome = (e as { name?: string } | null)?.name;
  if (nome === "NotAllowedError" || nome === "SecurityError")
    return tx("O navegador não deixou usar a câmera e o microfone. Libere os dois para este site (no cadeado da barra de endereço) e tente de novo.");
  if (nome === "NotFoundError" || nome === "OverconstrainedError")
    return tx("Nenhuma câmera ou microfone encontrado neste computador.");
  if (nome === "NotReadableError")
    return tx("A câmera está em uso por outro programa (OBS, Zoom, Meet…). Feche-o e tente de novo.");
  return (e as Error)?.message || tx("Não consegui abrir a câmera.");
}

/** Chat na Sombra ao vivo: quem fala é a pessoa; aqui ela lê os chats ligados. */
function ChatDaSombra({ id }: { id: string }) {
  const [mensagens, setMensagens] = useState<ItemFila[]>([]);
  const proximoId = useRef(1);
  const receber = useCallback((m: MensagemChat) => {
    const texto = m.texto.trim().slice(0, 600);
    if (!texto) return;
    setMensagens((f) => [...f, { ...m, texto, id: proximoId.current++ }].slice(-MAX_FILA));
  }, []);

  return (
    <section className="card p-4 grid gap-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-accent" />
        <h2 className="label-cap">{tx("Chat")}</h2>
      </div>
      <ConexoesChat id={id} enfileirar={receber} />
      {mensagens.length === 0 ? (
        <p className="text-[13px] text-ink-dim">{tx("As mensagens dos chats ligados aparecem aqui, as mais novas em cima.")}</p>
      ) : (
        <ul className="grid gap-1.5 max-h-[520px] overflow-y-auto">
          {[...mensagens].reverse().map((m) => (
            <li key={m.id} className="rounded-xl border border-line px-3 py-2 text-[13px]">
              {m.origem ? (
                <span className="mr-1.5 rounded bg-panel px-1.5 py-0.5 text-[10px] font-bold text-ink-mute">
                  {NOME_ORIGEM[m.origem]}
                </span>
              ) : null}
              {m.autor ? <b className="text-ink">{m.autor}: </b> : null}
              <span className="text-ink-mute break-words">{m.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function relogio(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Conduz a live: fila do chat, resposta automática e falas digitadas. */
function Conducao({
  sala,
  id,
  avatarNoAr,
  onFalando,
  pegarTela,
}: {
  sala: React.RefObject<SalaLive | null>;
  id: string;
  avatarNoAr: boolean;
  /** Avisa o que está sendo falado (legenda no palco). */
  onFalando?: (texto: string | null) => void;
  /** Imagem do jogo na tela agora (base64), quando houver: a IA comenta. */
  pegarTela?: () => string | null;
}) {
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [historico, setHistorico] = useState<TrocaLive[]>([]);
  const [falando, setFalando] = useState<string | null>(null);
  const [pensando, setPensando] = useState(false);
  useEffect(() => onFalando?.(falando), [falando, onFalando]);
  const [auto, setAuto] = useState(false);
  /** Modo apresentador: fala por conta própria quando o chat para. */
  const [apresentador, setApresentador] = useState(false);
  const [tema, setTema] = useState("");
  const [ritmo, setRitmo] = useState<Ritmo>("normal");
  const [autor, setAutor] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [roteiro, setRoteiro] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const ocupado = useRef(false);
  const proximoId = useRef(1);

  const enfileirar = useCallback((m: MensagemChat) => {
    const texto = m.texto.trim().slice(0, 600);
    if (!texto) return;
    setFila((f) => [...f, { ...m, texto, id: proximoId.current++ }].slice(-MAX_FILA));
  }, []);

  const dizer = useCallback(
    async (modo: "responder" | "falar" | "espontanea", texto: string, quem?: string) => {
      const s = sala.current;
      if (!s || ocupado.current) return false;
      ocupado.current = true;
      setErro(null);
      setPensando(true);
      try {
        const res = await fetch(`/api/live/${id}/fala`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modo,
            texto,
            autor: quem || undefined,
            tema: modo === "espontanea" ? tema.trim() || undefined : undefined,
            tela: modo === "falar" ? undefined : (pegarTela?.() ?? undefined),
            anteriores: modo === "falar" ? [] : historico.slice(-8),
          }),
        });
        if (!res.ok || !res.body) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
          return false;
        }
        const falado = decodeURIComponent(res.headers.get("x-live-texto") ?? "");
        const tipo = (res.headers.get("x-live-tipo") ?? undefined) as TrocaLive["tipo"];
        setPensando(false);
        setFalando(falado);
        await s.falar(res.body);
        // Tudo o que foi falado entra na memória da live (para não se repetir).
        setHistorico((h) =>
          [
            ...h,
            modo === "responder"
              ? { autor: quem, texto, resposta: falado }
              : { texto: "", resposta: falado, espontanea: true, ...(tipo ? { tipo } : {}) },
          ].slice(-20),
        );
        return true;
      } catch (e) {
        setErro((e as Error).message);
        return false;
      } finally {
        ocupado.current = false;
        setPensando(false);
        setFalando(null);
      }
    },
    [historico, id, sala, tema, pegarTela],
  );

  // Resposta automática: com o avatar livre, responde a mensagem mais antiga.
  useEffect(() => {
    if (!auto || !avatarNoAr || ocupado.current || pensando || falando || !fila.length) return;
    const t = setTimeout(() => {
      const [primeira] = fila;
      setFila((f) => f.filter((x) => x.id !== primeira.id));
      void dizer("responder", primeira.texto, primeira.autor);
    }, 1500);
    return () => clearTimeout(t);
  }, [auto, avatarNoAr, pensando, falando, fila, dizer]);

  // Modo apresentador: com o avatar livre e o chat parado (ou só na mão),
  // espera o silêncio do ritmo escolhido e fala por conta própria.
  useEffect(() => {
    if (!apresentador || !avatarNoAr || ocupado.current || pensando || falando) return;
    if (auto && fila.length) return; // a fila tem prioridade
    const t = setTimeout(async () => {
      // Outra fala começou nesse meio-tempo: espera a próxima vez.
      if (ocupado.current) return;
      const ok = await dizer("espontanea", "");
      // Falhou: desliga para não ficar tentando (e gastando) sem parar.
      if (!ok) setApresentador(false);
    }, SILENCIO_MS[ritmo]);
    return () => clearTimeout(t);
  }, [apresentador, avatarNoAr, pensando, falando, auto, fila.length, ritmo, dizer]);

  function adicionar() {
    enfileirar({ autor: autor.trim(), texto: mensagem });
    setMensagem("");
  }

  function responder(item: ItemFila) {
    setFila((f) => f.filter((x) => x.id !== item.id));
    void dizer("responder", item.texto, item.autor);
  }

  async function falarRoteiro() {
    const texto = roteiro.trim();
    if (!texto) return;
    if (await dizer("falar", texto)) setRoteiro("");
  }

  const livre = avatarNoAr && !pensando && !falando;

  return (
    <section className="grid gap-4">
      <div className="card p-4 grid gap-2">
        <div className="flex items-center gap-2 text-[13px]">
          <Mic className={cn("w-4 h-4", falando ? "text-pink animate-pulse" : "text-ink-mute")} />
          <span className="text-ink-mute">
            {!avatarNoAr
              ? tx("Esperando o avatar…")
              : pensando
                ? tx("Pensando na resposta…")
                : falando
                  ? tx("Falando")
                  : tx("Livre")}
          </span>
          {(falando || pensando) && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void sala.current?.interromper()}>
              <Square className="w-3.5 h-3.5" />
              {tx("Parar")}
            </Button>
          )}
        </div>
        {falando ? <p className="text-[14px] text-ink leading-relaxed">{falando}</p> : null}
        {erro ? <p className="text-[13px] text-pink">{erro}</p> : null}
      </div>

      <div className="card p-4 grid gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h2 className="label-cap">{tx("Piloto automático")}</h2>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-ink cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>
            <b>{tx("Responder o chat sozinho")}</b>
            <span className="block text-[12px] text-ink-dim">{tx("Responde a fila, uma mensagem por vez.")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-ink cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={apresentador}
            onChange={(e) => setApresentador(e.target.checked)}
          />
          <span>
            <b>{tx("Falar sozinho quando o chat parar")}</b>
            <span className="block text-[12px] text-ink-dim">
              {tx("Puxa assunto, faz perguntas, conta piadas e retoma o que o chat disse.")}
            </span>
          </span>
        </label>
        {apresentador ? (
          <div className="grid gap-2 pl-6">
            <Input
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              maxLength={300}
              placeholder={tx("Assunto da live (opcional) — ex.: games e café")}
            />
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-mute">
              {tx("Ritmo:")}
              {(Object.keys(SILENCIO_MS) as Ritmo[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRitmo(r)}
                  className={cn(
                    "h-7 rounded-full border px-3 font-semibold transition cursor-pointer",
                    r === ritmo ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-mute hover:text-ink",
                  )}
                >
                  {tx(NOME_RITMO[r])}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card p-4 grid gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-accent" />
          <h2 className="label-cap">{tx("Chat")}</h2>
        </div>
        <ConexoesChat id={id} enfileirar={enfileirar} />
        <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
          <Input value={autor} onChange={(e) => setAutor(e.target.value)} placeholder={tx("Nome (opcional)")} />
          <Input
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && mensagem.trim() && adicionar()}
            placeholder={tx("Cole uma mensagem do chat")}
          />
          <Button variant="ghost" size="sm" onClick={adicionar} disabled={!mensagem.trim()}>
            {tx("Pôr na fila")}
          </Button>
        </div>
        {fila.length === 0 ? (
          <p className="text-[13px] text-ink-dim">{tx("Nenhuma mensagem na fila.")}</p>
        ) : (
          <ul className="grid gap-1.5 max-h-[320px] overflow-y-auto">
            {fila.map((m) => (
              <li key={m.id} className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  {m.origem ? (
                    <span className="mr-1.5 rounded bg-panel px-1.5 py-0.5 text-[10px] font-bold text-ink-mute">
                      {NOME_ORIGEM[m.origem]}
                    </span>
                  ) : null}
                  {m.autor ? <b className="text-ink">{m.autor}: </b> : null}
                  <span className="text-ink-mute break-words">{m.texto}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => responder(m)} disabled={!livre}>
                  {tx("Responder")}
                </Button>
                <button
                  type="button"
                  aria-label={tx("Tirar da fila")}
                  onClick={() => setFila((f) => f.filter((x) => x.id !== m.id))}
                  className="p-1.5 text-ink-dim hover:text-pink cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-4 grid gap-2">
        <h2 className="label-cap">{tx("Falar exatamente")}</h2>
        <Textarea
          value={roteiro}
          onChange={(e) => setRoteiro(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder={tx("Ex.: abertura, chamada para seguir, anúncio de um produto…")}
        />
        <Button size="sm" className="justify-self-start" onClick={falarRoteiro} disabled={!livre || !roteiro.trim()}>
          <Send className="w-3.5 h-3.5" />
          {tx("Falar")}
        </Button>
      </div>

      {historico.length > 0 && (
        <div className="card p-4 grid gap-2">
          <h2 className="label-cap">{tx("Já falou")}</h2>
          <ul className="grid gap-2 text-[13px]">
            {[...historico].reverse().map((h, i) => (
              <li key={i} className="grid gap-0.5">
                <span className="text-ink-mute">
                  {h.espontanea ? (
                    <i>{tx("Por conta própria")}</i>
                  ) : (
                    <>
                      {h.autor ? <b>{h.autor}: </b> : null}
                      {h.texto}
                    </>
                  )}
                </span>
                <span className="text-ink">{h.resposta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
