"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileUp,
  ImageIcon,
  ImagePlus,
  Sparkles,
  User,
  UserPlus,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { useCharacters } from "@/lib/store";
import { lerPersonagemExportado } from "@/lib/importar";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { GerarImagem } from "@/components/revisao/GerarImagem";
import type { TipoImagem } from "@/lib/prompts/gerar-imagem";
import { refSrc } from "@/lib/storage/client";
import {
  criarReferencia,
  maxRefBytes,
  useStorageReady,
} from "@/lib/storage/useStorage";
import { useRecursos } from "@/components/RecursosProvider";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

type Mode = "pick" | "imagem" | "expand" | "loading";

const LOADING_STEPS = [
  "Lendo o contexto",
  "Construindo identidade",
  "Escolhendo gostos e repertório",
  "Afinando a voz",
  "Montando pilares de conteúdo",
  "Fechando a ficha",
];

const PLACEHOLDER =
  "Ex.: Influenciadora de finanças pra jovens de 20 a 25 anos, tom debochado, mora em São Paulo, atua no Instagram e TikTok, referência em Nathalia Arcuri mas mais ácida. Odeia conselho genérico de 'guarde 10% do salário'. Fala do dia a dia dela com freelas e boletos.";

/** Por onde o diálogo abre quando vem do campo da Home (em vez da escolha). */
export interface InicioCriar {
  modo: "expand" | "imagem";
  /** Texto já escrito na Home: entra como contexto da expansão. */
  contexto?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  inicio?: InicioCriar | null;
}

export function CreateDialog({ open, onClose, inicio }: Props) {
  const recursos = useRecursos();
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("pick");
  const [contexto, setContexto] = useState("");
  /** O nome é sempre do usuário — a IA não inventa nome. */
  const [nomeExpandir, setNomeExpandir] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const [imagemTipo, setImagemTipo] = useState<TipoImagem>("referencia");
  const [imagemCharId, setImagemCharId] = useState<string | null>(null);

  const imagemInputRef = useRef<HTMLInputElement>(null);

  const create = useCharacters((s) => s.createCharacter);
  const adicionar = useCharacters((s) => s.adicionar);
  const importRef = useRef<HTMLInputElement>(null);
  const [erroImport, setErroImport] = useState<string | null>(null);
  const deleteChar = useCharacters((s) => s.deleteCharacter);
  const applySuggestions = useCharacters((s) => s.applySuggestions);
  const updateChar = useCharacters((s) => s.update);
  const usarS3 = useStorageReady();

  const imagemChar = useCharacters((s) =>
    imagemCharId ? s.characters.find((c) => c.id === imagemCharId) : undefined,
  );

  useEffect(() => {
    if (!open) return;
    const pelaImagem = inicio?.modo === "imagem" ? create() : null;
    setMode(
      pelaImagem
        ? "imagem"
        : inicio?.modo === "expand" && recursos.ia
          ? "expand"
          : "pick",
    );
    setContexto(inicio?.contexto ?? "");
    setErro(null);
    setLoadingStep(0);
    setImagemTipo("retrato");
    setImagemCharId((prev) => {
      if (prev && prev !== pelaImagem) deleteChar(prev);
      return pelaImagem;
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (mode !== "loading") return;
    const t = setInterval(() => {
      setLoadingStep((i) => (i < LOADING_STEPS.length - 1 ? i + 1 : i));
    }, 1800);
    return () => clearInterval(t);
  }, [mode]);

  if (!open) return null;

  function handleClose() {
    if (imagemCharId) {
      deleteChar(imagemCharId);
      setImagemCharId(null);
    }
    onClose();
  }

  async function onImportar(file: File | undefined) {
    if (!file) return;
    setErroImport(null);
    if (file.size > 20 * 1024 * 1024)
      return setErroImport("Arquivo grande demais (máx. 20 MB).");
    const r = lerPersonagemExportado(await file.text());
    if (!r.ok) return setErroImport(txErro(r.erro));
    const id = adicionar(r.character);
    onClose();
    router.push(`/app/personagem/${id}`);
  }

  function onCriarDoZero() {
    const id = create();
    handleClose();
    router.push(`/app/personagem/${id}`);
  }

  function onComecarPelaImagem() {
    const id = create();
    setImagemCharId(id);
    setMode("imagem");
  }

  function onCriarDoImagem() {
    const id = imagemCharId;
    setImagemCharId(null);
    onClose();
    if (id) router.push(`/app/personagem/${id}`);
  }

  function onVoltarDoImagem() {
    if (imagemCharId) {
      deleteChar(imagemCharId);
      setImagemCharId(null);
    }
    setMode("pick");
  }

  async function onImagemFiles(files: FileList | null) {
    if (!files || !imagemCharId) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const maxBytes = maxRefBytes(usarS3);
      if (f.size > maxBytes) {
        alert(`${f.name}: maior que ${maxBytes / 1024 / 1024} MB.`);
        continue;
      }
      try {
        const ref = await criarReferencia(f, usarS3);
        updateChar(imagemCharId, (c) => {
          c.visual.referencias.push(ref);
        });
      } catch (e) {
        alert(`${f.name}: ${(e as Error).message}`);
      }
    }
  }

  function removerImagemRef(refId: string) {
    if (!imagemCharId) return;
    updateChar(imagemCharId, (c) => {
      c.visual.referencias = c.visual.referencias.filter((r) => r.id !== refId);
    });
  }

  async function onGerar() {
    const ctx = contexto.trim();
    const nome = nomeExpandir.trim();
    if (!nome) {
      setErro("Escreva o nome do personagem.");
      return;
    }
    if (ctx.length < 10) {
      setErro("Escreva pelo menos uma frase sobre o personagem.");
      return;
    }
    setErro(null);
    setMode("loading");
    setLoadingStep(0);
    try {
      const res = await fetch("/api/expandir-ficha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contexto: ctx, nome }),
      });
      const data = await res.json();
      avisarCreditos(); // gastou (ou foi estornado): atualiza o saldo
      if (!res.ok) {
        setMode("expand");
        setErro(txErro(data?.error ?? "Falha ao expandir. Tente de novo."));
        return;
      }
      const id = create();
      updateChar(id, (c) => {
        c.identidade.nome = nome;
      });
      applySuggestions(id, data.suggestions ?? [], "Expansão inicial");
      if (data.pontosEmAberto?.length) {
        updateChar(id, (c) => {
          c.pontosEmAberto = data.pontosEmAberto;
        });
      }
      onClose();
      router.push(`/app/personagem/${id}`);
    } catch (e) {
      setMode("expand");
      setErro((e as Error)?.message ?? "Falha de rede. Tente de novo.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && mode !== "loading") handleClose();
      }}
    >
      <div
        className={cn(
          "card w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto",
          mode === "pick"
            ? "max-w-[920px] sm:p-9 rounded-[22px] bg-[#121011] border-white/[0.09] shadow-[0_50px_120px_-30px_rgba(0,0,0,0.9)] animate-nido-rise font-geist text-nido-ink"
            : "max-w-2xl",
        )}
      >
        {mode === "pick" && (
          <div className="pointer-events-none absolute -top-px left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-nido-yellow/90 to-transparent" />
        )}
        {mode !== "loading" && (
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
            aria-label={tx("Fechar")}
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {mode === "pick" && (
          <div>
            <div className="font-geist-mono text-[11px] uppercase tracking-[0.16em] text-nido-yellow mb-2.5">
              {tx("Novo AI Creator")}
            </div>
            <h2 className="font-archivo [font-stretch:125%] font-black text-[26px] sm:text-4xl uppercase leading-[0.95] tracking-[-0.02em] pr-10">
              {t("criar.pergunta")}
            </h2>
            <p className="text-nido-mute text-[14.5px] mt-2.5 leading-relaxed max-w-[60ch]">
              {t("criar.descricao")}
            </p>

            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                onImportar(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="grid gap-3 mt-6 sm:grid-cols-2">
              {recursos.ia ? (
                <Option
                  icon={<Wand2 className="w-5 h-5" />}
                  title={t("criar.ia.titulo")}
                  description={t("criar.ia.descricao")}
                  onClick={() => setMode("expand")}
                  accent
                />
              ) : null}
              <Option
                icon={<ImageIcon className="w-5 h-5" />}
                title={t("criar.imagem.titulo")}
                description={t("criar.imagem.descricao")}
                onClick={onComecarPelaImagem}
              />
              <Option
                icon={<UserPlus className="w-5 h-5" />}
                title={t("criar.manual.titulo")}
                description={t("criar.manual.descricao")}
                onClick={onCriarDoZero}
              />
              <Option
                icon={<FileUp className="w-5 h-5" />}
                title={t("criar.importar.titulo")}
                description={t("criar.importar.descricao")}
                onClick={() => importRef.current?.click()}
              />
            </div>
            {erroImport ? (
              <div className="mt-3 rounded-xl border border-pink/40 bg-pink/10 px-3.5 py-2.5 text-sm text-pink">
                {erroImport}
              </div>
            ) : null}
            <div className="mt-6 pt-[18px] border-t border-white/[0.07] flex items-center justify-between gap-3">
              <span className="font-geist-mono text-[11px] text-nido-dim">
                {tx("Atalho: N abre esta janela a qualquer momento")}
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="h-9 px-3.5 rounded-[10px] border border-white/[0.12] text-[13px] text-nido-soft hover:text-nido-ink transition"
              >
                {tx("Cancelar")}
              </button>
            </div>
          </div>
        )}

        {mode === "imagem" && imagemChar && (
          <div>
            <div className="eyebrow-accent mb-2 inline-flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" />
              {tx("Começar pela imagem")}
            </div>
            <h2 className="display text-2xl sm:text-3xl text-ink uppercase leading-tight">
              {tx("Gere a imagem do seu personagem.")}
            </h2>
            <p className="text-ink-mute mt-3 leading-relaxed">
              {tx(
                "Descreva a aparência e gere a imagem aqui mesmo. Depois crie o personagem e complete a ficha.",
              )}
            </p>

            <div className="mt-6 grid gap-5">
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setImagemTipo("referencia")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full h-10 px-5 text-sm font-bold transition active:translate-y-px",
                    imagemTipo === "referencia"
                      ? "bg-accent text-bg shadow-glow"
                      : "bg-panel border border-line text-ink-mute hover:text-ink hover:border-line-strong",
                  )}
                >
                  <ImageIcon className="w-4 h-4" strokeWidth={2.5} />
                  {tx("Card de referência")}
                </button>
                <button
                  type="button"
                  onClick={() => setImagemTipo("retrato")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full h-10 px-5 text-sm font-bold transition active:translate-y-px",
                    imagemTipo === "retrato"
                      ? "bg-accent text-bg shadow-glow"
                      : "bg-panel border border-line text-ink-mute hover:text-ink hover:border-line-strong",
                  )}
                >
                  <User className="w-4 h-4" strokeWidth={2.5} />
                  {tx("Imagem de perfil")}
                </button>
              </div>

              <GerarImagem character={imagemChar} tipo={imagemTipo} />
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <div className="label-cap mb-2 inline-flex items-center gap-2">
                <ImagePlus className="w-3.5 h-3.5" />
                {tx("Adicionar imagem gerada")}
              </div>
              <p className="text-[13px] text-ink-mute mb-3 leading-relaxed">
                {tx(
                  "Já tem uma imagem do personagem? Adicione aqui para salvar nele.",
                )}
              </p>
              <input
                ref={imagemInputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  onImagemFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-3 items-center flex-wrap">
                {imagemChar.visual.referencias.map((r) => (
                  <div
                    key={r.id}
                    className="relative w-20 h-20 rounded-xl overflow-hidden border border-line bg-bg group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={refSrc(r)}
                      alt={r.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removerImagemRef(r.id)}
                      className="absolute top-1 right-1 h-6 w-6 inline-flex items-center justify-center rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                      aria-label={`Remover ${r.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => imagemInputRef.current?.click()}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-line-strong hover:border-accent hover:bg-accent/5 transition flex flex-col items-center justify-center text-ink-dim hover:text-accent gap-1"
                >
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px]">{tx("Adicionar")}</span>
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center mt-6 gap-3 flex-wrap">
              <Button variant="ghost" onClick={onVoltarDoImagem}>
                {tx("Voltar")}
              </Button>
              <Button variant="accent" onClick={onCriarDoImagem}>
                <Sparkles className="w-4 h-4" />
                {tx("Ir para o Step 1")}
              </Button>
            </div>
          </div>
        )}

        {mode === "expand" && (
          <div>
            <div className="eyebrow-accent mb-2 inline-flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              {tx("Expandir com IA")}
            </div>
            <h2 className="display text-2xl sm:text-3xl text-ink uppercase leading-tight">
              {tx("Escreva um contexto curto.")}
            </h2>
            <p className="text-ink-mute mt-3 leading-relaxed">
              {tx(
                "Você escolhe o nome; a IA preenche o resto a partir do contexto — nicho, público, tom, referências. Depois você edita tudo.",
              )}
            </p>

            <div className="mt-5 grid gap-4">
              <Field label={tx("Nome do personagem")}>
                <Input
                  maxLength={80}
                  placeholder={tx("Ex.: Lila, Jr., Noa, Vulpes…")}
                  value={nomeExpandir}
                  onChange={(e) => setNomeExpandir(e.target.value)}
                  autoFocus
                />
              </Field>
              <Field
                label={tx("Contexto do personagem")}
                counter={{ value: contexto.length, max: 2000 }}
                hint={tx(
                  "Entre 10 e 2000 caracteres. Quanto mais específico, menos clichê.",
                )}
              >
                <Textarea
                  rows={8}
                  maxLength={2000}
                  placeholder={PLACEHOLDER}
                  value={contexto}
                  onChange={(e) => setContexto(e.target.value)}
                />
              </Field>

              {erro ? (
                <div className="mt-3 rounded-xl border border-pink/40 bg-pink/10 px-3.5 py-2.5 text-sm text-pink">
                  {erro}
                </div>
              ) : null}

              <div className="flex justify-between items-center mt-5 gap-3 flex-wrap">
                <Button variant="ghost" onClick={() => setMode("pick")}>
                  {tx("Voltar")}
                </Button>
                <Button
                  variant="accent"
                  onClick={onGerar}
                  disabled={contexto.trim().length < 10 || !nomeExpandir.trim()}
                >
                  <Sparkles className="w-4 h-4" />
                  {tx("Gerar ficha")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {mode === "loading" && (
          <div className="text-center py-6">
            <div className="relative inline-flex items-center justify-center h-16 w-16 rounded-full bg-accent/15 border border-accent/50 mb-5">
              <Sparkles className="w-7 h-7 text-accent animate-pulse" />
            </div>
            <h2 className="display text-2xl text-ink uppercase">
              {tx("Montando o personagem…")}
            </h2>
            <p className="text-ink-mute mt-3">
              {tx("Isso leva uns 10–20 segundos.")}
            </p>

            <ul className="mt-6 text-left max-w-md mx-auto grid gap-2">
              {LOADING_STEPS.map((label, i) => {
                const done = i < loadingStep;
                const active = i === loadingStep;
                return (
                  <li
                    key={label}
                    className={cn(
                      "flex items-center gap-3 text-sm px-3.5 py-2 rounded-xl border",
                      active
                        ? "border-accent bg-accent/5 text-ink font-semibold"
                        : done
                          ? "border-line bg-panel text-ink-dim line-through"
                          : "border-line bg-panel text-ink-mute",
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 inline-flex items-center justify-center rounded-full text-[10px] mono font-bold",
                        active
                          ? "bg-accent text-bg"
                          : done
                            ? "bg-ok/20 text-ok"
                            : "bg-card text-ink-dim",
                      )}
                    >
                      {done ? "✓" : String(i + 1).padStart(2, "0")}
                    </span>
                    {label}…
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Option({
  icon,
  title,
  description,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-4 text-left rounded-[14px] border p-5 transition hover:border-nido-yellow/60",
        accent
          ? "border-nido-yellow/45 bg-nido-yellow/[0.05]"
          : "border-white/[0.08] bg-white/[0.02]",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center h-[42px] w-[42px] rounded-xl shrink-0",
          accent ? "bg-nido-yellow text-nido-bg" : "bg-white/[0.06] text-nido-ink",
        )}
      >
        {icon}
      </span>
      <span className="grid gap-1.5">
        <span className="flex items-center gap-2 flex-wrap text-[15px] font-semibold text-nido-ink">
          {title}
          {accent ? (
            <span className="h-[18px] px-[7px] inline-flex items-center rounded-full bg-nido-yellow text-nido-bg text-[10px] font-bold">
              {tx("Recomendado")}
            </span>
          ) : null}
        </span>
        <span className="text-[13px] text-nido-mute leading-relaxed">
          {description}
        </span>
      </span>
    </button>
  );
}
