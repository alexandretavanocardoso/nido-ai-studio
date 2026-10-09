"use client";

import { Suspense, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import "@/components/landing/landing.css";
import { useAuth } from "@/components/auth/AuthProvider";
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
      await signInWithGoogle();
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-3.5 h-3.5" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
