"use client";

import { useEffect, useState } from "react";
import "./landing.css";
import { useAuth } from "@/components/auth/AuthProvider";
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
      <Entrar />
      <Palco
        rotulo="Nido AI Studio"
        h={720}
        hm={844}
        caber
        classe="hx-sec"
        quadro="hx"
      >
        <Hero />
      </Palco>
      <Palco rotulo="Manifesto" h={720} hm={844}>
        <Manifesto />
      </Palco>
      <Palco rotulo="Prova" h={900} hm={790}>
        <Prova />
      </Palco>
      <Palco
        rotulo="A tese"
        h={720}
        hm={844}
        pin={2.6}
        classe="ts-sec"
        quadro="ts"
      >
        <Tese />
      </Palco>
      <Palco rotulo="Uma frase, um creator" h={720} hm={844}>
        <Demo />
      </Palco>
      <Palco rotulo="Como funciona" h={720} hm={844} pin={6}>
        <ComoFunciona />
      </Palco>
      <Palco id="planos" rotulo="Planos" h={1080} hm={1180}>
        <Planos />
      </Palco>
      <Palco rotulo="Perguntas frequentes" h={620} hm={720}>
        <Faq />
      </Palco>
      <Palco id="whitelist" rotulo="Whitelist" h={860} hm={1290}>
        <Whitelist />
      </Palco>
      <CtaFixo />
    </Landing>
  );
}

/** Canto superior direito: quem já tem conta entra por aqui. */
function Entrar() {
  const { user, disabled } = useAuth();
  const dentro = disabled || !!user;
  return (
    <a className="lp-entrar" href={dentro ? "/app" : "/auth/login"}>
      {dentro ? "Abrir o app" : "Entrar"}
    </a>
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
      <span className="lbl">Construir meu creator</span>
    </a>
  );
}
