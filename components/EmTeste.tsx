"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { liberadoNaTela, type RecursoEmTeste } from "@/lib/em-teste";
import { tx } from "@/lib/i18n/tx";

/**
 * Envolve uma tela em teste: só aparece para quem tem acesso (lib/em-teste.ts;
 * o admin abre e fecha cada recurso na área admin, aba "Em teste").
 * Quem chega pelo endereço sem acesso vê um aviso — as rotas também recusam.
 */
export function EmTeste({
  recurso,
  children,
}: {
  recurso: RecursoEmTeste;
  children: React.ReactNode;
}) {
  const { conta } = useCreditos();
  if (liberadoNaTela(recurso, conta)) return <>{children}</>;
  return (
    <div className="mx-auto grid max-w-md place-items-center gap-3 px-4 py-24 text-center">
      {conta === null || conta === undefined ? (
        <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
      ) : (
        <>
          <h1 className="display text-xl uppercase text-ink">
            {tx("Em breve")}
          </h1>
          <p className="text-[14px] text-ink-mute">
            {tx("Este recurso ainda não está disponível para a sua conta.")}
          </p>
          <Link
            href="/app"
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            {tx("Voltar para o início")}
          </Link>
        </>
      )}
    </div>
  );
}
