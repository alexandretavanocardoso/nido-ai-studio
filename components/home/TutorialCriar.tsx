"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clapperboard,
  FileText,
  ImagePlus,
  Lock,
  PenLine,
  Send,
  Sparkles,
  UserRound,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

interface Props {
  open: boolean;
  /** Fechou sem terminar (X, Esc ou clique fora). */
  onClose: () => void;
  /** Chegou ao fim e clicou em criar. */
  onConcluir: () => void;
}

const PASSOS = 3;

/**
 * Tutorial de como criar um AI Creator, em 3 telas: a ideia ou foto de
 * partida, a ficha que dá identidade e o que o Estúdio produz com ela.
 * Aparece na primeira vez que a pessoa vai criar (e pelo "Como funciona").
 */
export function TutorialCriar({ open, onClose, onConcluir }: Props) {
  const [passo, setPasso] = useState(0);

  useEffect(() => {
    if (open) setPasso(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight")
        setPasso((p) => Math.min(PASSOS - 1, p + 1));
      else if (e.key === "ArrowLeft") setPasso((p) => Math.max(0, p - 1));
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [open, onClose]);

  if (!open) return null;

  const telas = [
    {
      titulo: tx("Comece com uma ideia ou foto"),
      texto: tx(
        "Uma frase já basta: quem é o personagem, de onde vem, como fala. Se tiver uma imagem de referência, melhor ainda.",
      ),
      arte: <ArteReferencia />,
    },
    {
      titulo: tx("A ficha dá a identidade"),
      texto: tx(
        "Em 7 etapas você define rosto, personalidade e voz. Daí sai o Prompt Mestre, que mantém o personagem igual em tudo.",
      ),
      arte: <ArteIdentidade />,
    },
    {
      titulo: tx("Um personagem. Muito conteúdo."),
      texto: tx(
        "No Estúdio, o mesmo personagem vira vídeo, imagem, legenda e post agendado nas redes.",
      ),
      arte: <ArteEstudio />,
    },
  ];
  const tela = telas[passo];
  const ultimo = passo === PASSOS - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,5,5,0.72)] p-4 backdrop-blur-[10px]"
      role="dialog"
      aria-modal="true"
      aria-label={tx("Como funciona")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[calc(100vh-32px)] w-full max-w-[640px] flex-col gap-5 overflow-y-auto rounded-[26px] border border-white/[0.09] bg-[#121011] p-5 font-geist text-nido-ink shadow-[0_50px_120px_-30px_rgba(0,0,0,0.9)] animate-nido-rise sm:p-7">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPasso((p) => Math.max(0, p - 1))}
            aria-label={tx("Voltar")}
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-nido-soft transition hover:text-nido-ink",
              passo === 0 && "invisible",
            )}
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {Array.from({ length: PASSOS }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= passo ? "bg-nido-yellow" : "bg-white/[0.12]",
                )}
              />
            ))}
          </div>
          <span className="font-geist-mono text-[12px] text-nido-mute">
            {passo + 1}/{PASSOS}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={tx("Fechar")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-nido-mute transition hover:text-nido-ink"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="flex items-center gap-2 font-geist-mono text-[11px] uppercase tracking-[0.16em] text-nido-yellow">
            <Sparkles className="h-3.5 w-3.5" />
            {tx("Como funciona")}
          </span>
          <h2 className="text-balance font-archivo text-[26px] font-black uppercase leading-[0.95] tracking-[-0.02em] [font-stretch:125%] sm:text-[32px]">
            {tela.titulo}
          </h2>
          <p className="max-w-[46ch] text-pretty text-[14.5px] leading-[1.5] text-nido-mute">
            {tela.texto}
          </p>
        </div>

        <div className="rounded-[20px] border border-white/[0.07] bg-[#0b0a0a] p-4 sm:p-5">
          {tela.arte}
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] px-4 py-3 text-[13px] text-nido-mute">
          <Lock className="h-4 w-4 shrink-0" />
          {tx("Você revisa tudo antes de gerar. Nada é cobrado agora.")}
        </div>

        <button
          type="button"
          onClick={() => (ultimo ? onConcluir() : setPasso((p) => p + 1))}
          autoFocus
          className="flex h-[52px] items-center justify-center gap-2.5 rounded-2xl bg-nido-yellow text-[15px] font-bold text-nido-bg shadow-[0_0_30px_-6px_rgba(253,243,39,0.6)] transition hover:bg-nido-yellow-hi"
        >
          {ultimo ? tx("Criar meu AI Creator") : tx("Continuar")}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** Selo flutuante sobre as artes. */
function Selo({
  icon: Icone,
  children,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "absolute flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-nido-yellow/35 bg-[rgba(18,16,17,0.9)] px-3.5 text-[12.5px] font-semibold text-nido-ink backdrop-blur",
        className,
      )}
    >
      <Icone className="h-4 w-4 text-nido-yellow" />
      {children}
    </span>
  );
}

/** Passo 1: a referência (card do personagem) e os recortes que a IA lê dela. */
function ArteReferencia() {
  return (
    <div className="relative grid h-[280px] grid-cols-[1.5fr_1fr] gap-3 sm:h-[360px]">
      <div className="relative h-full overflow-hidden rounded-2xl border border-white/[0.08]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/nino-pirulito-card.png"
          alt=""
          className="h-full w-full object-cover"
        />
        <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-[#56d364] text-nido-bg">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      </div>
      <div className="grid h-full min-h-0 grid-rows-2 gap-3">
        {["0% 100%", "66% 100%"].map((pos) => (
          <div
            key={pos}
            className="min-h-0 overflow-hidden rounded-2xl border border-white/[0.08]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/nino-pirulito-card.png"
              alt=""
              className="h-full w-full scale-[2.4] object-cover"
              style={{ objectPosition: pos, transformOrigin: pos }}
            />
          </div>
        ))}
      </div>
      <Selo icon={Sparkles} className="-top-3 right-3">
        {tx("Entendendo o estilo")}
      </Selo>
      <Selo icon={ImagePlus} className="bottom-3 right-3">
        {tx("Sua referência")}
      </Selo>
    </div>
  );
}

/** Passo 2: o rosto e o que a ficha trava nele. */
function ArteIdentidade() {
  const itens: Array<[LucideIcon, string]> = [
    [UserRound, tx("Rosto reconhecível")],
    [Volume2, tx("Voz e bordões")],
    [FileText, tx("Prompt Mestre")],
  ];
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[1fr_1fr]">
      <div className="aspect-[4/3.4] overflow-hidden rounded-2xl border border-white/[0.08]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/nino-pirulito-card.png"
          alt=""
          className="h-full w-full scale-[2.2] object-cover"
          style={{ objectPosition: "33% 100%", transformOrigin: "33% 100%" }}
        />
      </div>
      <div className="flex flex-col gap-2.5">
        {itens.map(([Icone, rotulo]) => (
          <div
            key={rotulo}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-nido-yellow/10 text-nido-yellow">
              <Icone className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1 text-[13.5px] font-medium">{rotulo}</span>
            <Check className="h-4 w-4 shrink-0 text-[#56d364]" strokeWidth={3} />
          </div>
        ))}
        <span className="flex h-9 items-center gap-2 self-start rounded-full border border-nido-yellow/35 bg-nido-yellow/[0.08] px-3.5 text-[12.5px] font-semibold text-nido-yellow">
          <Check className="h-4 w-4" />
          {tx("Identidade consistente")}
        </span>
      </div>
    </div>
  );
}

/** Passo 3: o que o Estúdio faz com o personagem pronto. */
function ArteEstudio() {
  const quadros: Array<{
    rotulo: string;
    icon: LucideIcon;
    img?: string;
    pos?: string;
  }> = [
    {
      rotulo: tx("Vídeo"),
      icon: Clapperboard,
      img: "/landing/ze-zen-pfp.png",
      pos: "50% 25%",
    },
    {
      rotulo: tx("Imagem"),
      icon: ImagePlus,
      img: "/landing/arnaldo-energetico.png",
      pos: "50% 12%",
    },
    { rotulo: tx("Texto"), icon: PenLine },
    { rotulo: tx("Publicar"), icon: Send },
  ];
  return (
    <div className="relative grid grid-cols-2 gap-3">
      {quadros.map((q) => (
        <div
          key={q.rotulo}
          className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(160deg,#2a2224_0%,#141112_75%)]"
        >
          {q.img ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={q.img}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: q.pos }}
              />
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,10,10,0)_45%,rgba(11,10,10,0.85)_100%)]" />
            </>
          ) : (
            <q.icon
              className="h-8 w-8 text-nido-yellow/70"
              strokeWidth={1.5}
            />
          )}
          <span className="absolute bottom-2.5 left-3 font-geist-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-nido-ink">
            {q.rotulo}
          </span>
        </div>
      ))}
      <Selo icon={Sparkles} className="-top-3 right-3">
        {tx("Feito na NIDO")}
      </Selo>
    </div>
  );
}
