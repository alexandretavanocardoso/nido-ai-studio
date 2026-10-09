"use client";

import {
  CalendarClock,
  CalendarDays,
  Clapperboard,
  ImageIcon,
  PenLine,
  Radar as IconeRadar,
  type LucideIcon,
  Sticker,
} from "lucide-react";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useRecursos } from "@/components/RecursosProvider";
import { VideosOrigem } from "@/components/revisao/VideosOrigem";
import { PromptSubstituirVideo } from "@/components/revisao/PromptSubstituirVideo";
import { EscreverComoPersonagem } from "@/components/revisao/EscreverComoPersonagem";
import { GerarImagem } from "@/components/revisao/GerarImagem";
import { Publicar } from "@/components/estudio/Publicar";
import { Agendamentos } from "@/components/estudio/Agendamentos";
import { Figurinhas } from "@/components/estudio/Figurinhas";
import { useT, type Chave } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";
import { Radar } from "@/components/estudio/Radar";

export type SecaoEstudio =
  | "videos"
  | "textos"
  | "imagens"
  | "figurinhas"
  | "publicar"
  | "agendamentos"
  | "radar";

export const SECOES_ESTUDIO: Array<{
  id: SecaoEstudio;
  titulo: string;
  descricao: string;
  icon: LucideIcon;
}> = [
  {
    id: "videos",
    titulo: "Vídeos",
    descricao:
      "Troque a pessoa de um vídeo pelo personagem, crie cenas novas, edite legendas e falas.",
    icon: Clapperboard,
  },
  {
    id: "textos",
    titulo: "Textos",
    descricao:
      "Legendas, roteiros e respostas a comentários na voz do personagem.",
    icon: PenLine,
  },
  {
    id: "imagens",
    titulo: "Imagens",
    descricao:
      "Card de referência com posicionamentos e retratos fiéis ao personagem.",
    icon: ImageIcon,
  },
  {
    id: "figurinhas",
    titulo: "Figurinhas",
    descricao:
      "Figurinhas de WhatsApp do personagem: crie novas ou troque o personagem de uma figurinha pronta.",
    icon: Sticker,
  },
  {
    id: "publicar",
    titulo: "Publicar",
    descricao:
      "Conecte as redes do influencer e publique agora ou agende posts no Instagram, TikTok, YouTube Shorts, X e LinkedIn.",
    icon: CalendarClock,
  },
  {
    id: "agendamentos",
    titulo: "Agendamentos",
    descricao:
      "Calendário com o que foi agendado e publicado, e o backlog de posts prontos para agendar.",
    icon: CalendarDays,
  },
  {
    id: "radar",
    titulo: "Radar",
    descricao:
      "O que está acontecendo hoje nos temas do personagem, com nota de relevância e ideia de post.",
    icon: IconeRadar,
  },
];

/** O Radar tem aba própria no cabeçalho do personagem: fica fora do menu do Estúdio. */
const SECOES_DO_MENU = SECOES_ESTUDIO.filter((s) => s.id !== "radar");

/** Navegação do Estúdio (coluna da esquerda no desktop, abas no celular). */
export function EstudioNav({
  atual,
  onPick,
  orientation,
}: {
  atual: SecaoEstudio;
  onPick: (s: SecaoEstudio) => void;
  orientation: "vertical" | "horizontal";
}) {
  const t = useT();
  const vertical = orientation === "vertical";
  return (
    <nav
      aria-label={tx("Estúdio")}
      className={cn(
        vertical ? "grid gap-1" : "flex gap-2 overflow-x-auto pb-1",
      )}
    >
      {SECOES_DO_MENU.map((s) => {
        const ativo = s.id === atual;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl text-left transition shrink-0",
              vertical ? "w-full px-3 py-2.5" : "px-3.5 py-2 border",
              ativo
                ? vertical
                  ? "bg-card text-ink"
                  : "border-accent bg-accent/10 text-ink"
                : vertical
                  ? "text-ink-mute hover:bg-panel hover:text-ink"
                  : "border-line text-ink-mute hover:text-ink",
            )}
          >
            <span
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                ativo ? "bg-accent text-bg" : "bg-panel text-ink-mute",
              )}
            >
              <s.icon className="w-4 h-4" />
            </span>
            <span className="text-[14px] font-semibold">
              {t(`estudio.${s.id}.titulo` as Chave)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** Conteúdo de uma seção do Estúdio. */
export function EstudioConteudo({
  secao,
  character,
}: {
  secao: SecaoEstudio;
  character: Character;
}) {
  const recursos = useRecursos();
  const t = useT();
  return (
    <section className="card p-5 sm:p-7">
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-ink tracking-tight">
          {t(`estudio.${secao}.titulo` as Chave)}
        </h2>
        <p className="text-[15px] text-ink-mute mt-1">
          {t(`estudio.${secao}.descricao` as Chave)}
        </p>
      </header>

      {secao === "videos" && (
        <div className="grid gap-6">
          {recursos.fal || recursos.runway ? (
            <VideosOrigem character={character} />
          ) : (
            <Vazio>
              {tx(
                "A produção de vídeo não está configurada neste deploy (FAL_KEY).",
              )}
            </Vazio>
          )}
          <PromptSubstituirVideo character={character} />
        </div>
      )}

      {secao === "textos" &&
        (recursos.ia ? (
          <EscreverComoPersonagem character={character} />
        ) : (
          <Vazio>
            {tx(
              "A escrita com IA não está configurada neste deploy (ANTHROPIC_API_KEY).",
            )}
          </Vazio>
        ))}

      {secao === "publicar" && <Publicar character={character} />}
      {secao === "agendamentos" && <Agendamentos character={character} />}
      {secao === "radar" && <Radar character={character} />}

      {secao === "imagens" && <GerarImagem character={character} />}
      {secao === "figurinhas" && <Figurinhas character={character} />}
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center text-[14px] text-ink-dim">
      {children}
    </div>
  );
}
