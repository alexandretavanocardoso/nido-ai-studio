"use client";

import Link from "next/link";
import { tx } from "@/lib/i18n/tx";

/** Mensagem de erro de geração; sem saldo ou fora do plano, oferece o link pros planos. */
export function ErroGeracao({
  mensagem,
  code,
}: {
  mensagem: string;
  code?: string | null;
}) {
  const comLink =
    !!code &&
    ["SEM_CREDITOS", "PLANO", "SIMULTANEAS", "ARMAZENAMENTO"].includes(code);
  return (
    <div className="rounded-xl border border-pink/40 bg-pink/10 px-3.5 py-2.5 text-sm text-pink">
      {mensagem}
      {comLink && (
        <>
          {" "}
          <Link href="/app/planos" className="font-bold underline">
            {tx("Ver planos e créditos")}
          </Link>
        </>
      )}
    </div>
  );
}
