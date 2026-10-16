"use client";

import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import "@/components/landing/landing.css";
import { useAuth } from "@/components/auth/AuthProvider";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { Capsula } from "@/components/landing/Capsula";
import { Idioma } from "@/components/landing/Idioma";
import { useRecursos } from "@/components/RecursosProvider";
import { tx } from "@/lib/i18n/tx";

/** Mesmas imagens da landing page (public/lp). */
const WORDMARK = "/lp/wordmark.webp";
/** Creators da casa, que se revezam na cápsula. */
const CREATORS = [
  { num: "#001", nome: "ARNALDO NITRO", img: "/lp/arn-front.webp" },
  { num: "#002", nome: "ZÉ ZEN", img: "/lp/cut-ze.webp" },
  { num: "#003", nome: "BETTY PIMENTA", img: "/lp/cut-betty.webp" },
  { num: "#004", nome: "DIONE BRABO", img: "/lp/cut-dione.webp" },
  { num: "#005", nome: "PATETA FI DUMA EGUA", img: "/lp/cut-pateta.webp" },
  { num: "#006", nome: "ROMEU NOBRE", img: "/lp/cut-romeu.webp" },
];
/** Tempo de cada creator na cápsula, em ms. */
const TROCA_MS = 4800;

/**
 * Cápsula do painel esquerdo: a cada troca ela pisca e o próximo creator se
 * materializa (a `key` remonta a cápsula para as animações de entrada tocarem
 * de novo; da segunda em diante o hardware não sobe outra vez, só acende).
 */
function CapsulaRotativa() {
  const [i, setI] = useState(0);
  const [trocou, setTrocou] = useState(false);
  useEffect(() => {
    // Baixa as imagens antes, para a troca não mostrar a cápsula vazia.
    CREATORS.forEach((c) => (new Image().src = c.img));
    const t = setInterval(() => {
      setTrocou(true);
      setI((n) => (n + 1) % CREATORS.length);
    }, TROCA_MS);
    return () => clearInterval(t);
  }, []);
  const c = CREATORS[i];
  return (
    <div className={`lg-cap${trocou ? " troca" : ""}`}>
      <Capsula
        key={c.num}
        cx={0}
        base={0}
        w={210}
        h={440}
        img={c.img}
        num={c.num}
        nome={c.nome}
        estado="IDENTITY LOCKED"
        dl={trocou ? 0 : 0.5}
        hw={0.1}
      />
    </div>
  );
}

function LoginInner() {
  const recursos = useRecursos();
  const { signInWithGoogle } = useAuth();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const errorCode = params?.get("error");
  const [err, setErr] = useState<string | null>(
    errorCode
      ? `Não deu pra entrar com o Google (${errorCode}). Tenta de novo.`
      : null,
  );

  async function onGoogle() {
    setLoading(true);
    setErr(null);
    try {
      await signInWithGoogle(params?.get("voltar") ?? undefined);
    } finally {
      setLoading(false);
    }
  }

  if (!recursos.login) {
    return (
      <>
        <h1 className="lp-h2">
          <span>{tx("Login não configurado")}</span>
        </h1>
        <p className="lp-sub">
          {tx(
            "Este deploy ainda não tem login ativo. Pede pro admin preencher",
          )}
          <code>{"DATABASE_URL"}</code>,<code>{"BETTER_AUTH_SECRET"}</code>{" "}
          {tx("e as chaves do Google.")}
        </p>
      </>
    );
  }

  return (
    <>
      <span className="lg-ey">{tx("Entrar")}</span>
      <h1 className="lp-h2">
        <span>{tx("Seus personagens,")}</span>
        <em>{tx("na sua conta.")}</em>
      </h1>
      <p className="lp-sub">
        {tx(
          "Com login, cada personagem fica salvo na sua conta e pode ser aberto de qualquer dispositivo.",
        )}
      </p>

      <div className="lg-cartao">
        <button
          type="button"
          className="lp-cta"
          onClick={onGoogle}
          disabled={loading}
        >
          <span className="lg-google">
            <GoogleIcon />
          </span>
          <span className="lbl">
            {loading ? tx("Abrindo…") : tx("Continuar com Google")}
          </span>
        </button>

        {err ? (
          <div className="lg-erro" role="alert">
            {err}
          </div>
        ) : null}
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="lg">
      <Idioma />
      {/* Esquerda: a mesma fábrica do topo da landing, com uma cápsula. */}
      <div className="lg-cena hx" aria-hidden="true">
        <div className="hx-floor" />
        <div className="hx-fog" />
        <img
          className="hx-wmk"
          src={WORDMARK}
          alt=""
          style={{ "--ad": "1.4s" } as CSSProperties}
        />
        <CapsulaRotativa />
        <div className="hx-vig" />
      </div>

      {/* Direita: entrar */}
      <div className="lg-painel">
        <div className="lg-caixa">
          <Link href="/app" className="lg-voltar">
            <ArrowLeft className="w-4 h-4" /> {tx("Voltar")}
          </Link>
          <img className="lg-marca" src={WORDMARK} alt="Nido AI Studio" />
          <Suspense fallback={null}>
            <LoginInner />
          </Suspense>
          <div className="lg-legal">
            <Link href="/termos">{tx("Termos")}</Link>
            <Link href="/privacidade">{tx("Privacidade")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
