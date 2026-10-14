"use client";

import { useIdioma } from "@/lib/i18n";

/** Canto superior direito: idioma (português ou inglês) da página. Usado na landing e no login. */
export function Idioma() {
  const { idioma, setIdioma } = useIdioma();
  return (
    <div className="lp-idioma">
      <div role="group" aria-label="Idioma / Language">
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
    </div>
  );
}
