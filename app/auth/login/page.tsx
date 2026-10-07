"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { useRecursos } from "@/components/RecursosProvider";
import { tx } from "@/lib/i18n/tx";

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
      <div className="card p-8 text-center">
        <h1 className="display text-xl uppercase">
          {tx("Login não configurado")}
        </h1>
        <p className="text-ink-mute text-sm mt-2 leading-relaxed">
          {tx(
            "Este deploy ainda não tem login ativo. Pede pro admin preencher",
          )}
          <code className="mono text-accent mx-1">{"DATABASE_URL"}</code>,
          <code className="mono text-accent mx-1">{"BETTER_AUTH_SECRET"}</code>{" "}
          {tx("e as chaves do Google.")}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="eyebrow-accent mb-2 inline-flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" />
        {tx("Entrar")}
      </div>
      <h1 className="display text-2xl sm:text-3xl text-ink uppercase leading-tight">
        {tx("Seus personagens,")}
        <br />
        {tx("na sua conta.")}
      </h1>
      <p className="text-ink-mute text-[15px] mt-3 leading-relaxed">
        {tx(
          "Com login, cada personagem fica salvo na sua conta e pode ser aberto de qualquer dispositivo.",
        )}
      </p>

      <div className="mt-7 grid gap-4">
        <Button
          variant="primary"
          size="lg"
          onClick={onGoogle}
          disabled={loading}
          className="w-full"
        >
          <GoogleIcon />
          {loading ? tx("Abrindo…") : tx("Continuar com Google")}
        </Button>

        {err ? (
          <div className="rounded-xl border border-pink/40 bg-pink/10 px-3.5 py-2.5 text-sm text-pink">
            {err}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 min-h-screen">
      {/* LEFT: brand / promo panel */}
      <div className="hidden md:flex flex-col justify-between bg-bg relative overflow-hidden p-10 lg:p-14 border-r border-line">
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-accent/10 blur-[120px] rounded-full pointer-events-none"
        />

        <div className="relative flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-accent flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-bg" strokeWidth={3} />
          </div>
          <span className="font-bold text-sm uppercase tracking-wider">
            {tx("Influenciador Sintético")}
          </span>
        </div>

        <div className="relative">
          <h2 className="display text-4xl lg:text-5xl text-ink uppercase leading-[0.95]">
            {tx("Construa um")}
            <br />
            influenciador <span className="text-accent">{"AI"}</span>
            <br />
            {tx("a partir da sua")}
            <br />
            criatividade.
          </h2>
          <p className="text-ink-mute text-[15px] mt-5 max-w-sm leading-relaxed">
            {tx(
              "Identidade, visual, voz e estratégia — tudo numa ficha completa, salva na sua conta.",
            )}
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {[
              tx("Identidade completa"),
              tx("Sem aparecer"),
              tx("Múltiplos creators"),
            ].map((chip) => (
              <span
                key={chip}
                className="label-cap !text-ink-mute border border-line-strong rounded-full px-3 py-1.5"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="relative eyebrow">
          {tx("Persistência local · Login opcional")}
        </div>
      </div>

      {/* RIGHT: auth card */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-bg">
        <div className="w-full max-w-sm">
          <Link
            href="/app"
            className="inline-flex items-center gap-1.5 text-ink-mute hover:text-ink text-sm mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> {tx("Voltar")}
          </Link>
          <Suspense fallback={null}>
            <LoginInner />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
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
