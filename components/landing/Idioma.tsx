"use client";

import { useIdioma } from "@/lib/i18n";

/** Canto superior direito: troca o idioma da página (português ou inglês). Usado na landing e no login. */
export function Idioma() {
  const { idioma, setIdioma } = useIdioma();
  return (
    <div className="lp-idioma" role="group" aria-label="Idioma / Language">
      {(["pt", "en"] as const).map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => setIdioma(i)}
          aria-pressed={idioma === i}
          className={idioma === i ? "on" : undefined}
        >
          {i.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
