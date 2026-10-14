"use client";

import { useIdioma } from "@/lib/i18n";
import { MOEDAS } from "@/lib/moeda";
import { useMoeda } from "@/lib/moeda-client";

/** Canto superior direito: idioma (português ou inglês) e moeda (BRL ou USD) da página. Usado na landing e no login. */
export function Idioma() {
  const { idioma, setIdioma } = useIdioma();
  const { moeda, setMoeda } = useMoeda();
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
      <span className="sep" aria-hidden />
      <div role="group" aria-label="Moeda / Currency">
        {MOEDAS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMoeda(m.id)}
            aria-pressed={moeda === m.id}
            className={moeda === m.id ? "on" : undefined}
          >
            {m.id}
          </button>
        ))}
      </div>
    </div>
  );
}
