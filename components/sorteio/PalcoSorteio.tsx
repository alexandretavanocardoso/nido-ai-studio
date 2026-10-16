"use client";

import { useEffect, useState } from "react";
import { useIdioma } from "@/lib/i18n";
import type { SorteioPublico } from "@/lib/sorteio/tipos";
import { Corrida } from "./Corrida";
import { useSorteio } from "./comum";

/**
 * Palco do sorteio (/sorteio/palco#s=<id>): só a corrida, em tela cheia, para
 * a fonte de navegador do OBS na live. Sem login — o sorteio vem no link,
 * com o idioma de quem copiou (o OBS abre sem conta; sem ele, português).
 */
export function PalcoSorteio() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(location.hash.slice(1));
    // Pelo seletor do app (o <ComIdioma> aplica e redesenha): o OBS não tem conta nem escolha salva.
    useIdioma.getState().setIdioma(p.get("idioma") === "en" ? "en" : "pt");
    setId(p.get("s"));
  }, []);
  const { dados, erro, desvio } = useSorteio<{ sorteio: SorteioPublico | null }>(
    id ? `/api/sorteio/publico/${encodeURIComponent(id)}` : null,
    2500,
  );
  const s = dados?.sorteio ?? null;

  return (
    <div className="fixed inset-0 grid place-items-center overflow-hidden bg-black">
      {s ? (
        <div style={{ width: "min(100vw, calc(100vh * 16 / 9))" }}>
          <Corrida sorteio={s} desvio={desvio} />
        </div>
      ) : (
        <p className="text-[14px] text-white/60">
          {id === null ? "Carregando…" : !id ? "Link do sorteio incompleto. Copie de novo na área admin." : erro ?? "Carregando…"}
        </p>
      )}
    </div>
  );
}
