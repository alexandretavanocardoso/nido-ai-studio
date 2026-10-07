"use client";
import { tx } from "@/lib/i18n/tx";

import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel p-10 sm:p-14 text-center">
      <div className="absolute -top-20 -right-20 w-80 h-80 bg-accent/10 blur-[80px] rounded-full pointer-events-none" />
      <div className="relative">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-accent text-bg mb-5">
          <Sparkles className="w-6 h-6" strokeWidth={2.5} />
        </div>
        <h2 className="display text-2xl sm:text-3xl text-ink uppercase">
          {tx("Nenhum personagem ainda")}
        </h2>
        <p className="text-ink-mute mt-3 max-w-md mx-auto leading-relaxed">
          {tx(
            "Um bom influenciador sintético começa com decisões claras. Vamos passar por 7 etapas, no seu ritmo. Você pode voltar, duplicar e exportar quando quiser.",
          )}
        </p>
        <div className="mt-7">
          <Button variant="accent" size="lg" onClick={onCreate}>
            <Plus className="w-4 h-4" strokeWidth={3} />{" "}
            {tx("Criar personagem")}
          </Button>
        </div>
      </div>
    </div>
  );
}
