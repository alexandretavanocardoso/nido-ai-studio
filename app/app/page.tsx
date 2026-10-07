"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useCharacters } from "@/lib/store";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/home/EmptyState";
import { CharacterListItem } from "@/components/home/CharacterListItem";
import { useRecursos } from "@/components/RecursosProvider";
import Link from "next/link";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { PLANOS } from "@/lib/planos";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";
import { useCriar } from "@/components/AppShell";

export default function Home() {
  const recursos = useRecursos();
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const characters = useCharacters((s) => s.characters);
  const { conta } = useCreditos();
  const { criar: handleCreateClick, noLimite: avisoLimite } = useCriar();
  const limitePersonagens = conta ? PLANOS[conta.plano].personagens : Infinity;

  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-accent/10 blur-[120px] rounded-full" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="flex items-center gap-2 mb-5 justify-center">
            <span className="chip-new">{"NEW"}</span>
            <span className="eyebrow-accent">{t("inicio.selo")}</span>
          </div>
          <h1 className="display text-[40px] sm:text-[64px] text-center uppercase leading-[0.95] tracking-tighter">
            {t("inicio.titulo1")}
            <br />
            <span className="text-accent">{t("inicio.titulo2")}</span>
          </h1>
          <p className="text-ink-mute text-[17px] text-center mt-6 max-w-[640px] mx-auto leading-relaxed">
            {t("inicio.descricao")}
          </p>
          {avisoLimite && conta && (
            <div className="mt-6 mx-auto max-w-xl rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink text-center">
              {t("inicio.limite", {
                plano: PLANOS[conta.plano].nome,
                n: limitePersonagens,
              })}{" "}
              <Link href="/app/planos" className="font-bold underline">
                {t("inicio.upgrade")}
              </Link>
            </div>
          )}
          <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
            <Button variant="accent" size="lg" onClick={handleCreateClick}>
              <Plus className="w-4 h-4" strokeWidth={3} />
              {t("inicio.criar")}
            </Button>
            <a
              href="#personagens"
              className="eyebrow hover:text-ink transition"
            >
              {t("inicio.verSeus")}
            </a>
          </div>
        </div>
      </section>

      <section
        id="personagens"
        className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20"
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="eyebrow-accent mb-2">{t("inicio.biblioteca")}</div>
            <h2 className="display text-3xl uppercase">{t("inicio.seus")}</h2>
          </div>
          {mounted && characters.length > 0 ? (
            <Button variant="accent" onClick={handleCreateClick}>
              <Plus className="w-4 h-4" strokeWidth={3} />
              {t("inicio.novo")}
            </Button>
          ) : null}
        </div>

        {!mounted ? (
          <div className="card p-16 text-center text-ink-dim">
            {t("inicio.carregando")}
          </div>
        ) : characters.length === 0 ? (
          <EmptyState onCreate={handleCreateClick} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {characters.map((c) => (
              <CharacterListItem key={c.id} character={c} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-line mt-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 text-[12px] text-ink-dim flex flex-wrap items-center gap-3">
          <span className="eyebrow">v2</span>
          <span>
            {recursos.ia
              ? tx("Expansão por IA + persistência local.")
              : tx(
                  "Persistência local no navegador. Expansão por IA chega em uma versão futura.",
                )}
          </span>
        </div>
      </footer>

      <MountGate onMount={() => setMounted(true)} />
    </main>
  );
}

function MountGate({ onMount }: { onMount: () => void }) {
  useEffect(() => onMount(), [onMount]);
  return null;
}
