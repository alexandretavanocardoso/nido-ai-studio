"use client";

import type { Character } from "@/lib/types";
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
}> = [
  {
    id: "videos",
    titulo: "Vídeos",
    descricao:
      "Troque a pessoa de um vídeo pelo personagem, crie cenas novas, edite legendas e falas.",
  },
  {
    id: "textos",
    titulo: "Textos",
    descricao:
      "Legendas, roteiros e respostas a comentários na voz do personagem.",
  },
  {
    id: "imagens",
    titulo: "Imagens",
    descricao:
      "Card de referência com posicionamentos e retratos fiéis ao personagem.",
  },
  {
    id: "figurinhas",
    titulo: "Figurinhas",
    descricao:
      "Figurinhas de WhatsApp do personagem: crie novas ou troque o personagem de uma figurinha pronta.",
  },
  {
    id: "publicar",
    titulo: "Publicar",
    descricao:
      "Conecte as redes do influencer e publique agora ou agende posts no Instagram, TikTok, YouTube Shorts, X e LinkedIn.",
  },
  {
    id: "agendamentos",
    titulo: "Agendamentos",
    descricao:
      "Calendário com o que foi agendado e publicado, e o backlog de posts prontos para agendar.",
  },
  {
    id: "radar",
    titulo: "Radar",
    descricao:
      "O que está acontecendo hoje nos temas do personagem, com nota de relevância e ideia de post.",
  },
];

/**
 * Conteúdo de uma seção do Estúdio. O Estúdio não tem menu próprio: as seções
 * abrem pelo menu lateral do app (pasta Ferramentas e Agenda), que marca a aberta.
 */
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
          {recursos.fal || recursos.runway || recursos.sapiens ? (
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
