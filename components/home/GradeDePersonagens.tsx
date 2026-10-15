"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useCriar } from "@/components/AppShell";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { CharacterListItem } from "@/components/home/CharacterListItem";
import { EmptyState } from "@/components/home/EmptyState";
import { useNftsMintados } from "@/components/nft/useNftsMintados";
import { status } from "@/lib/completion";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";
import { PLANOS } from "@/lib/planos";
import { useCharacters } from "@/lib/store";
import { usePendentesDeSync } from "@/lib/sync/remoteSync";

/**
 * Grade dos personagens da conta (Home e tela Personagens): resumo, aviso dos
 * que só existem neste navegador, o card "Novo AI Creator" e os cards.
 */
export function GradeDePersonagens() {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const characters = useCharacters((s) => s.characters);
  const { conta } = useCreditos();
  const { criar } = useCriar();
  const comNft = useNftsMintados();
  const limitePersonagens = conta ? PLANOS[conta.plano].personagens : Infinity;
  // Personagens que a conta não tem: só existem neste navegador.
  const naoSalvos = usePendentesDeSync();
  const foraDoPlano = naoSalvos.recusados.length > 0;
  const pendentes = naoSalvos.recusados.length + naoSalvos.falharam.length;

  const lista = mounted ? characters : [];
  const contagem = {
    completo: lista.filter((c) => status(c) === "completo").length,
    rascunho: lista.filter((c) => status(c) === "rascunho").length,
  };

  return (
    <section id="personagens" className="flex scroll-mt-6 flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          {lista.length > 0 ? (
            <span className="font-geist-mono text-[11.5px] text-nido-mute">
              {lista.length} {tx("no total")} · {contagem.completo}{" "}
              {tx("completos")} · {contagem.rascunho} {tx("rascunhos")}
            </span>
          ) : null}
        </div>
      </div>

      {mounted && pendentes > 0 && (
        <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
          {t(
            foraDoPlano ? "inicio.soAquiLimite" : "inicio.soAquiFalha",
            foraDoPlano && conta
              ? {
                  x: pendentes,
                  plano: PLANOS[conta.plano].nome,
                  n: limitePersonagens,
                }
              : { x: pendentes },
          )}{" "}
          {foraDoPlano && (
            <Link href="/app/planos" className="font-bold underline">
              {t("inicio.upgradeSalvar")}
            </Link>
          )}
        </div>
      )}

      {!mounted ? (
        <div className="card p-16 text-center text-ink-dim">
          {t("inicio.carregando")}
        </div>
      ) : characters.length === 0 ? (
        <EmptyState onCreate={criar} />
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          <button
            type="button"
            onClick={criar}
            className="flex aspect-[3/4] flex-col items-center justify-center gap-3.5 rounded-2xl border-[1.5px] border-dashed border-white/[0.14] bg-white/[0.015] transition duration-200 hover:border-nido-yellow/60 hover:bg-nido-yellow/[0.04]"
          >
            <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-nido-yellow text-nido-bg shadow-[0_0_30px_-6px_rgba(253,243,39,0.6)]">
              <Plus className="h-[18px] w-[18px]" />
            </span>
            <span className="flex flex-col items-center gap-1">
              <span className="text-sm font-semibold">
                {tx("Novo AI Creator")}
              </span>
              <span className="font-geist-mono text-[11px] text-nido-dim">
                {tx("wizard de 7 etapas · N")}
              </span>
            </span>
          </button>
          {lista.map((c) => (
            <CharacterListItem
              key={c.id}
              character={c}
              comNft={comNft.has(c.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
