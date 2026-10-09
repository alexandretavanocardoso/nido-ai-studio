"use client";

import { tx } from "@/lib/i18n/tx";
import { useEffect, useState } from "react";
import "./landing.css";
import { useIdioma } from "@/lib/i18n";
import { Hero, Manifesto, Prova, Tese } from "./cenas";
import { ComoFunciona } from "./ComoFunciona";
import { Demo } from "./Demo";
import { Faq, Planos, Whitelist } from "./fechamento";
import { Landing, Palco } from "./palco";

/**
 * Landing page (design "Nido Studio · Landing Amarela"). Cada seção é um
 * quadro de tamanho fixo escalado para a tela (ver palco.tsx); `h`/`hm` são as
 * alturas do quadro no desktop e no celular.
 */
export function LandingPage() {
  return (
    <Landing>
      <Idioma />
      <Palco
        rotulo={tx("Nido AI Studio")}
        h={720}
        hm={844}
        caber
        classe="hx-sec"
        quadro="hx"
      >
        <Hero />
      </Palco>
      <Palco rotulo={tx("Manifesto")} h={720} hm={844}>
        <Manifesto />
      </Palco>
      <Palco rotulo={tx("Prova")} h={900} hm={790}>
        <Prova />
      </Palco>
      <Palco
        rotulo={tx("A tese")}
        h={720}
        hm={844}
        pin={2.6}
        classe="ts-sec"
        quadro="ts"
      >
        <Tese />
      </Palco>
      <Palco rotulo={tx("Uma frase, um creator")} h={720} hm={844}>
        <Demo />
      </Palco>
      <Palco rotulo={tx("Como funciona")} h={720} hm={844} pin={6}>
        <ComoFunciona />
      </Palco>
      <Palco id="planos" rotulo={tx("Planos")} h={1080} hm={1180}>
        <Planos />
      </Palco>
      <Palco rotulo={tx("Perguntas frequentes")} h={620} hm={720}>
        <Faq />
      </Palco>
      <Palco id="whitelist" rotulo={tx("Whitelist")} h={860} hm={1290}>
        <Whitelist />
      </Palco>
      <CtaFixo />
    </Landing>
  );
}

/** Canto superior direito: troca o idioma da página (português ou inglês). */
function Idioma() {
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

/** Botão fixo no rodapé da tela: aparece depois do primeiro scroll e some ao chegar na whitelist. */
function CtaFixo() {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const conferir = () => {
      const alvo = document.getElementById("whitelist");
      const chegou =
        !!alvo && alvo.getBoundingClientRect().top < innerHeight * 0.75;
      setVisivel(scrollY > Math.min(140, innerHeight * 0.15) && !chegou);
    };
    conferir();
    addEventListener("scroll", conferir, { passive: true });
    return () => removeEventListener("scroll", conferir);
  }, []);
  return (
    <a
      className={`lp-cta lp-fixo${visivel ? " show" : ""}`}
      href="#whitelist"
      tabIndex={visivel ? undefined : -1}
      onClick={(e) => {
        e.preventDefault();
        document
          .getElementById("whitelist")
          ?.scrollIntoView({ behavior: "smooth" });
      }}
    >
      <span className="lbl">{tx("Construir meu creator")}</span>
    </a>
  );
}
