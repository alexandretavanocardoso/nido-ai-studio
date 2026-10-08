"use client";

import { useMemo } from "react";
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
import { cn } from "@/lib/cn";
import {
  EstudioConteudo,
  EstudioNav,
  SECOES_ESTUDIO,
  type SecaoEstudio,
} from "@/components/estudio/Estudio";
import { useT, type Chave } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";

export function Wizard({ id }: { id: string }) {
  const recursos = useRecursos();
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
      : params?.get("aba") === "estudio"
        ? "estudio"
        : "ficha";
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
  const setSecao = (s: SecaoEstudio) => navegar({ aba: "estudio", secao: s });

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
        <CharacterHeader character={character} aba={aba} onAba={setAba} />
        {aba === "ficha" && <SuggestionCounter character={character} />}

        {/* Mobile/tablet: nav horizontal rolável acima do conteúdo */}
        <div className={cn("mb-6 lg:hidden", aba === "radar" && "hidden")}>
          {aba === "ficha" ? (
            <StepTabs
              current={currentId}
              character={character}
              onPick={setCurrentId}
              orientation="horizontal"
            />
          ) : (
            <EstudioNav
              atual={secao}
              onPick={setSecao}
              orientation="horizontal"
            />
          )}
        </div>

        <div
          className={cn(
            "grid grid-cols-1 gap-6",
            aba === "estudio" && "lg:grid-cols-[230px_minmax(0,1fr)]",
            aba === "ficha" && "lg:grid-cols-[230px_minmax(0,1fr)_300px]",
          )}
        >
          {/* Desktop: nav vertical sticky */}
          <aside
            className={cn("hidden min-w-0", aba !== "radar" && "lg:block")}
          >
            <div className="sticky top-20">
              {aba === "ficha" ? (
                <StepTabs
                  current={currentId}
                  character={character}
                  onPick={setCurrentId}
                  orientation="vertical"
                />
              ) : (
                <EstudioNav
                  atual={secao}
                  onPick={setSecao}
                  orientation="vertical"
                />
              )}
            </div>
          </aside>

          <div className="min-w-0">
            {aba === "radar" ? (
              <EstudioConteudo secao="radar" character={character} />
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
            <aside className="min-w-0">
              <div className="sticky top-6 grid gap-3">
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
