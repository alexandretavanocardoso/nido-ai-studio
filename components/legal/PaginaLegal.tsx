"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { IDIOMAS, useIdioma, type Idioma } from "@/lib/i18n";
import { idiomaAtual } from "@/lib/i18n/tx";
import { EMAIL_CONTATO } from "./Secao";

export type VersaoLegal = {
  titulo: string;
  atualizadoEm: string;
  corpo: React.ReactNode;
};

const ROTULOS: Record<
  Idioma,
  { voltar: string; atualizado: string; privacidade: string; termos: string }
> = {
  pt: {
    voltar: "Voltar",
    atualizado: "Última atualização",
    privacidade: "Política de Privacidade",
    termos: "Termos de Serviço",
  },
  en: {
    voltar: "Back",
    atualizado: "Last updated",
    privacidade: "Privacy Policy",
    termos: "Terms of Service",
  },
};

/**
 * Moldura das páginas legais (/privacidade e /termos), em PT e EN.
 * O servidor entrega em português; depois de montar, <ComIdioma> troca para o idioma salvo.
 */
export function PaginaLegal({
  versoes,
}: {
  versoes: Record<Idioma, VersaoLegal>;
}) {
  const setIdioma = useIdioma((s) => s.setIdioma);
  // Assina o idioma para re-renderizar; o valor efetivo vem de <ComIdioma> (pt até montar).
  useIdioma((s) => s.idioma);
  const idioma = idiomaAtual();
  const versao = versoes[idioma];
  const r = ROTULOS[idioma];

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-14">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-ink-mute hover:text-ink text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> {r.voltar}
          </Link>
          <div className="flex items-center gap-1">
            {IDIOMAS.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setIdioma(i.id)}
                aria-label={i.rotulo}
                aria-pressed={i.id === idioma}
                className={cn(
                  "label-cap rounded-full border px-3 py-1.5",
                  i.id === idioma
                    ? "border-accent !text-accent"
                    : "border-line-strong hover:!text-ink",
                )}
              >
                {i.id}
              </button>
            ))}
          </div>
        </div>

        <div className="eyebrow-accent mb-2 inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          NIDO Studio
        </div>
        <h1 className="display text-3xl sm:text-4xl text-ink uppercase leading-tight">
          {versao.titulo}
        </h1>
        <p className="eyebrow mt-3">
          {r.atualizado}: {versao.atualizadoEm}
        </p>

        <div className="mt-10 grid gap-9">{versao.corpo}</div>

        <footer className="mt-14 pt-6 border-t border-line flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-mute">
          <Link href="/privacidade" className="hover:text-ink">
            {r.privacidade}
          </Link>
          <Link href="/termos" className="hover:text-ink">
            {r.termos}
          </Link>
          <a href={`mailto:${EMAIL_CONTATO}`} className="hover:text-ink">
            {EMAIL_CONTATO}
          </a>
        </footer>
      </div>
    </div>
  );
}
