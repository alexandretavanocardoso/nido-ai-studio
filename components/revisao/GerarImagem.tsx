"use client";

import { useState } from "react";
import { ChevronDown, ImageIcon, Replace, User } from "lucide-react";
import type { Character, EstiloVisual } from "@/lib/types";
import type { TipoImagem } from "@/lib/prompts/gerar-imagem";
import { cn } from "@/lib/cn";
import { useCharacters } from "@/lib/store";
import { Textarea } from "@/components/ui/Input";
import { GerarImagemAuto } from "@/components/revisao/GerarImagemAuto";
import { TrocarPessoaImagem } from "@/components/revisao/TrocarPessoaImagem";
import { useRecursos } from "@/components/RecursosProvider";
import { tx } from "@/lib/i18n/tx";

const ESTILOS: Array<{ id: EstiloVisual; label: string }> = [
  { id: "realista", label: "Realista" },
  { id: "3d", label: "3D" },
];

type Aba = TipoImagem | "troca";

const TIPOS: Array<{
  id: Aba;
  label: string;
  icon: typeof User;
  descricao: string;
}> = [
  {
    id: "referencia",
    label: "Card de referência",
    icon: ImageIcon,
    descricao:
      "5 vistas do corpo + closes do rosto. É a base de tudo — gere primeiro.",
  },
  {
    id: "retrato",
    label: "Retrato",
    icon: User,
    descricao: "Foto de perfil de corpo inteiro, fiel ao card de referência.",
  },
  {
    id: "troca",
    label: "Sombra",
    icon: Replace,
    descricao:
      "Envie uma foto e troque a(s) pessoa(s) pelo(s) influencer(s) — cenário, luz e pose ficam iguais.",
  },
];

interface Props {
  character: Character;
  /** Tipo fixo. Sem ele, a tela mostra a escolha Card de referência | Retrato. */
  tipo?: TipoImagem;
}

const PLACEHOLDER_IDEIA =
  "Ex.: homem de bigode gigante em espiral, cabelo prateado afro alto como torre, blazer de veludo marrom, calça xadrez verde e pink, bota de bico fino.";

/** Gerar imagens do personagem: tipo, descrição visual (opcional), estilo, gerador e galeria. */
export function GerarImagem({ character, tipo: tipoFixo }: Props) {
  const recursos = useRecursos();
  const update = useCharacters((s) => s.update);
  const [tipoEscolhido, setTipo] = useState<Aba>("referencia");
  const tipo = tipoFixo ?? tipoEscolhido;
  const ideia = character.visual.ideiaLivre ?? "";
  const estilo = character.visual.estilo ?? "realista";
  const [descricaoAberta, setDescricaoAberta] = useState(!ideia);
  const info = TIPOS.find((t) => t.id === tipo)!;

  if (!recursos.gemini && !recursos.fal && !recursos.openai)
    return (
      <p className="text-[13px] text-ink-dim">
        {tx(
          "A geração de imagem não está configurada neste deploy (GEMINI_API_KEY ou FAL_KEY).",
        )}
      </p>
    );

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {!tipoFixo ? (
          <div className="flex w-full gap-1 border border-line rounded-full p-1 bg-panel min-[420px]:w-auto">
            {TIPOS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={cn(
                  // Abaixo de 420px os três tipos não cabem com ícone (somam 337px): ocupam a linha toda, só com o texto.
                  "inline-flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap px-1 min-[420px]:flex-none min-[420px]:px-4 h-8 rounded-full text-[13px] font-semibold transition",
                  tipo === t.id
                    ? "bg-accent text-bg"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                <t.icon className="hidden w-3.5 h-3.5 min-[420px]:block" />
                {tx(t.label)}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[14px] font-semibold text-ink">
            {tx(info.label)}
          </span>
        )}
        <div
          className={cn(
            "flex items-center gap-2",
            tipo === "troca" && "hidden",
          )}
        >
          <span className="text-[12px] text-ink-mute">{tx("Estilo")}</span>
          <div className="flex gap-1 border border-line rounded-full p-0.5 bg-panel">
            {ESTILOS.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() =>
                  update(character.id, (c) => {
                    c.visual.estilo = e.id;
                  })
                }
                className={cn(
                  "px-3 h-7 rounded-full text-[12px] font-semibold transition",
                  estilo === e.id
                    ? "bg-accent text-bg"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                {tx(e.label)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[13px] text-ink-mute -mt-1">{tx(info.descricao)}</p>

      {tipo === "referencia" && (
        <div className="rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setDescricaoAberta((v) => !v)}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left"
            aria-expanded={descricaoAberta}
          >
            <span className="text-[13px] font-semibold text-ink">
              {tx("Descrição do visual")}
            </span>
            <span className="text-[12px] text-ink-dim truncate flex-1">
              {ideia
                ? `· ${ideia}`
                : tx("· opcional — complementa os campos da etapa Visual")}
            </span>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-ink-dim transition shrink-0",
                descricaoAberta && "rotate-180",
              )}
            />
          </button>
          {descricaoAberta && (
            <div className="px-3.5 pb-3.5">
              <Textarea
                rows={2}
                maxLength={1500}
                placeholder={PLACEHOLDER_IDEIA}
                value={ideia}
                onChange={(e) =>
                  update(character.id, (c) => {
                    c.visual.ideiaLivre = e.target.value;
                  })
                }
              />
              <p className="text-[11px] text-ink-dim mt-1">
                {tx(
                  "Texto livre já basta. Se a etapa Visual também estiver preenchida, esta descrição vem primeiro.",
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {tipo === "troca" ? (
        <TrocarPessoaImagem character={character} />
      ) : (
        <GerarImagemAuto key={tipo} character={character} tipo={tipo} />
      )}
    </div>
  );
}
