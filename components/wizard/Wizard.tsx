"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCharacters } from "@/lib/store";
import { STEPS, stepIndex } from "@/data/steps";
import { STEP_IDS, type StepId } from "@/lib/types";
import { CharacterHeader, type AbaPersonagem } from "./CharacterHeader";
import { StepTabs } from "./StepTabs";
import { StepFooter } from "./StepFooter";
import { SuggestionCounter } from "./SuggestionCounter";
import { WizardProvider } from "./WizardContext";
import { RegenerateSection } from "./RegenerateSection";
import { DicaBox } from "@/components/ui/DicaBox";
import { CharacterCard } from "@/components/preview/CharacterCard";
import { ExportarFicha } from "@/components/export/ExportarFicha";
import { IdentidadeStep } from "@/components/steps/IdentidadeStep";
import { VisualStep } from "@/components/steps/VisualStep";
import { SoulStep } from "@/components/steps/SoulStep";
import { NichoStep } from "@/components/steps/NichoStep";
import { VozStep } from "@/components/steps/VozStep";
import { MonetizacaoStep } from "@/components/steps/MonetizacaoStep";
import { RevisaoStep } from "@/components/steps/RevisaoStep";
import { useRouter } from "next/navigation";
import { useRecursos } from "@/components/RecursosProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { NftPersonagem } from "@/components/nft/NftPersonagem";
import { liberadoNaTela } from "@/lib/em-teste";
import { cn } from "@/lib/cn";
import {
  EstudioConteudo,
  SECOES_ESTUDIO,
  type SecaoEstudio,
} from "@/components/estudio/Estudio";
import { useT, type Chave } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";

/**
 * Larguras mínimas do conteúdo (em px) para cada layout da ficha. A régua é
 * a largura que SOBRA para o conteúdo, medida na tela, e não um breakpoint: o
 * menu lateral do app ocupa 124 ou 288px, então a mesma tela de 1024px deixa
 * 852 ou 688px para cá. Com `lg:`, as três colunas da ficha esmagavam o
 * formulário em ~110px. (Medido por JS e não por @container: um contêiner aqui
 * prenderia os modais do Estúdio dentro dele em navegadores mais antigos.)
 * Menu de etapas ao lado a partir de 760 (abaixo disso ele vira a faixa
 * horizontal acima do formulário); prévia na terceira coluna a partir de 1060
 * (entre os dois, a prévia fica embaixo do formulário).
 */
const LARGURA_MENU = 760;
const LARGURA_PREVIA_AO_LADO = 1060;

/** Largura atual de um elemento (0 até medir). Use com `ref={medir}`. */
function useLargura() {
  const [el, medir] = useState<HTMLElement | null>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const ler = () => setLargura(el.clientWidth);
    ler();
    const ro = new ResizeObserver(ler);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [largura, medir] as const;
}

export function Wizard({ id }: { id: string }) {
  const recursos = useRecursos();
  const { user } = useAuth();
  const { conta } = useCreditos();
  // Aba NFT: só com o NFT configurado, conta logada e o recurso liberado para ela.
  const comNft = recursos.nft && !!user && liberadoNaTela("nft", conta);
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const character = useCharacters((s) => s.characters.find((c) => c.id === id));
  // Aba, etapa e seção ficam na URL: recarregar ou compartilhar o link volta pro mesmo lugar.
  // (links antigos do radar, ?aba=estudio&secao=radar, continuam abrindo a aba Radar)
  const aba: AbaPersonagem =
    params?.get("aba") === "radar" ||
    (params?.get("aba") === "estudio" && params?.get("secao") === "radar")
      ? "radar"
      : params?.get("aba") === "nft" && comNft
        ? "nft"
        : params?.get("aba") === "estudio"
          ? "estudio"
          : "ficha";
  // Só a ficha tem menu próprio (as etapas). Estúdio, Radar e NFT ocupam a
  // largura toda: as ferramentas do Estúdio ficam no menu lateral do app.
  const semMenu = aba !== "ficha";
  const [largura, medir] = useLargura();
  const menuAoLado = !semMenu && largura >= LARGURA_MENU;
  const previaAoLado = aba === "ficha" && largura >= LARGURA_PREVIA_AO_LADO;
  const currentId = useMemo<StepId>(() => {
    const raw = params?.get("step");
    return (STEP_IDS as readonly string[]).includes(raw ?? "")
      ? (raw as StepId)
      : "identidade";
  }, [params]);
  const secao = useMemo<SecaoEstudio>(() => {
    const raw = params?.get("secao");
    return raw !== "radar" && SECOES_ESTUDIO.some((s) => s.id === raw)
      ? (raw as SecaoEstudio)
      : "videos";
  }, [params]);

  function navegar(mudancas: Record<string, string>) {
    const q = new URLSearchParams(params?.toString());
    for (const [k, v] of Object.entries(mudancas)) q.set(k, v);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const setCurrentId = (step: StepId) => navegar({ aba: "ficha", step });
  // Ao sair do Radar, um ?secao=radar antigo não pode prender o usuário nele.
  const setAba = (a: AbaPersonagem) =>
    navegar(
      params?.get("secao") === "radar"
        ? { aba: a, secao: "videos" }
        : { aba: a },
    );

  const current = useMemo(
    () => STEPS[stepIndex(currentId)] ?? STEPS[0],
    [currentId],
  );

  if (!character) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="card p-8 text-center">
          <h2 className="display text-xl uppercase">
            {t("personagem.naoEncontrado")}
          </h2>
          <p className="text-ink-mute text-sm mt-2">
            {tx("Pode ter sido excluído em outra aba.")}
          </p>
          <button
            onClick={() => router.push("/app")}
            className="mt-4 text-accent hover:underline font-semibold"
          >
            {t("personagem.voltarLista")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <WizardProvider characterId={character.id}>
      <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 sm:py-10">
        <CharacterHeader
          character={character}
          aba={aba}
          onAba={setAba}
          comNft={comNft}
        />
        {aba === "ficha" && <SuggestionCounter character={character} />}

        {/* Ficha com pouca largura: etapas numa faixa horizontal rolável acima do formulário */}
        <div className={cn("mb-6", (semMenu || menuAoLado) && "hidden")}>
          {semMenu ? null : (
            <StepTabs
              current={currentId}
              character={character}
              onPick={setCurrentId}
              orientation="horizontal"
            />
          )}
        </div>

        <div
          ref={medir}
          className={cn(
            "grid gap-6",
            previaAoLado
              ? "grid-cols-[230px_minmax(0,1fr)_300px]"
              : menuAoLado
                ? "grid-cols-[230px_minmax(0,1fr)]"
                : "grid-cols-1",
          )}
        >
          {/* Ficha com largura: etapas na coluna da esquerda, fixas na rolagem */}
          <aside className={cn("min-w-0", !menuAoLado && "hidden")}>
            <div className="sticky top-20">
              {semMenu ? null : (
                <StepTabs
                  current={currentId}
                  character={character}
                  onPick={setCurrentId}
                  orientation="vertical"
                />
              )}
            </div>
          </aside>

          <div className="min-w-0">
            {aba === "radar" ? (
              <EstudioConteudo secao="radar" character={character} />
            ) : aba === "nft" ? (
              <NftPersonagem character={character} />
            ) : aba === "estudio" ? (
              <EstudioConteudo secao={secao} character={character} />
            ) : (
              <section className="card p-5 sm:p-7">
                <div className="mb-6">
                  <div className="text-[12px] text-ink-dim font-semibold tabular-nums">
                    {t("etapa.xDeY", {
                      x: stepIndex(currentId) + 1,
                      y: STEPS.length,
                    })}
                  </div>
                  <h2 className="text-2xl font-bold text-ink tracking-tight mt-1">
                    {t(`passo.${current.id}.titulo` as Chave)}
                  </h2>
                  <p className="text-ink-mute text-[15px] mt-1">
                    {t(`passo.${current.id}.subtitulo` as Chave)}
                  </p>
                </div>

                {recursos.ia && currentId !== "revisao" ? (
                  <div className="mb-4">
                    <RegenerateSection
                      key={currentId}
                      characterId={character.id}
                      stepId={currentId}
                      stepTitulo={t(`passo.${current.id}.titulo` as Chave)}
                    />
                  </div>
                ) : null}

                <div className="mb-6">
                  <DicaBox>{t(`passo.${current.id}.dica` as Chave)}</DicaBox>
                </div>

                {renderStep(currentId, character.id, () => setAba("estudio"))}

                <StepFooter
                  current={currentId}
                  onChange={setCurrentId}
                  onFinish={() => setAba("estudio")}
                />
              </section>
            )}
          </div>

          {aba === "ficha" && (
            // Fora da terceira coluna a prévia fica embaixo do formulário (na coluna dele), com largura de cartão: sem o limite, a imagem 4:5 ocupava a tela inteira num tablet.
            <aside
              className={cn(
                "min-w-0",
                menuAoLado && !previaAoLado && "col-start-2",
              )}
            >
              <div className="sticky top-6 grid w-full max-w-[400px] gap-3">
                <CharacterCard character={character} />
                <ExportarFicha character={character} />
              </div>
            </aside>
          )}
        </div>
      </main>
    </WizardProvider>
  );
}

function renderStep(id: StepId, charId: string, irParaEstudio: () => void) {
  switch (id) {
    case "identidade":
      return <IdentidadeStep id={charId} />;
    case "visual":
      return <VisualStep id={charId} />;
    case "soul":
      return <SoulStep id={charId} />;
    case "nicho":
      return <NichoStep id={charId} />;
    case "voz":
      return <VozStep id={charId} />;
    case "monetizacao":
      return <MonetizacaoStep id={charId} />;
    case "revisao":
      return <RevisaoStep id={charId} onEstudio={irParaEstudio} />;
  }
}
