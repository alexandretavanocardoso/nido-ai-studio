"use client";

import { Plus } from "lucide-react";
import { useCriar } from "@/components/AppShell";
import { GradeDePersonagens } from "@/components/home/GradeDePersonagens";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";

/** Tela Personagens: todos os personagens da conta e o botão de criar. */
export default function PersonagensPage() {
  const t = useT();
  // No limite do plano, o criar leva para a Home, que mostra o aviso de upgrade.
  const { criar } = useCriar();
  return (
    <main className="flex w-full max-w-[1440px] flex-col gap-8 px-4 pb-16 pt-3 font-geist text-nido-ink sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="font-geist-mono text-[11px] uppercase tracking-[0.18em] text-nido-yellow">
            {t("inicio.selo")}
          </span>
          {/* Abaixo de 400px, "PERSONAGENS" a 32px passa da tela: a letra acompanha a largura. */}
          <h1 className="font-archivo text-[clamp(24px,8vw,32px)] sm:text-[clamp(32px,4vw,48px)] font-black uppercase leading-[0.95] tracking-[-0.02em] [font-stretch:125%]">
            {tx("Personagens")}
          </h1>
          <p className="max-w-[60ch] text-[15px] leading-[1.55] text-nido-mute">
            {tx(
              "Cada personagem tem uma ficha de 7 etapas e um Prompt Mestre. Abra um card para editar a ficha ou gerar conteúdo no Estúdio.",
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={criar}
          className="flex h-11 items-center gap-2 rounded-full bg-nido-yellow px-5 text-sm font-bold text-nido-bg shadow-[0_0_24px_-6px_rgba(253,243,39,0.7)] transition hover:bg-nido-yellow-hi"
        >
          <Plus className="h-[18px] w-[18px]" />
          {tx("Novo AI Creator")}
        </button>
      </div>
      <GradeDePersonagens />
    </main>
  );
}
