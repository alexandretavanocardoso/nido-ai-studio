"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Zap, Languages } from "lucide-react";
import { SaldoCreditos } from "@/components/creditos/SaldoCreditos";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { useRecursos } from "@/components/RecursosProvider";
import { IDIOMAS, useIdioma, useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";

export function AccountMenu() {
  const recursos = useRecursos();
  const { user, disabled, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!recursos.login || disabled) return null;

  const t = useT();
  const { idioma, setIdioma } = useIdioma();
  // user === null → ainda carregando (não mostra nada pra não piscar)
  if (user === null) return null;

  if (user === undefined) {
    return (
      <Link
        href="/auth/login"
        className="inline-flex items-center justify-center gap-1.5 font-semibold rounded-full h-9 px-3.5 text-[12px] bg-transparent text-ink border border-line-strong hover:bg-panel transition"
      >
        {t("conta.entrar")}
      </Link>
    );
  }

  const email = user.email ?? t("conta.semEmail");
  const name = user.name || email.split("@")[0];
  const avatar = user.image || null;
  const inicial = (name[0] ?? "?").toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <SaldoCreditos />
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 h-9 pl-1 pr-3 rounded-full border border-line hover:border-line-strong bg-panel transition"
        >
          <span className="h-7 w-7 rounded-full overflow-hidden bg-accent/15 text-accent font-bold text-sm inline-flex items-center justify-center">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              inicial
            )}
          </span>
          <span className="text-[12px] font-semibold text-ink max-w-[160px] truncate">
            {name}
          </span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-ink-mute transition",
              open && "rotate-180",
            )}
          />
        </button>

        {open ? (
          <div className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-panel shadow-card overflow-hidden z-30">
            <div className="px-3.5 py-3 border-b border-line">
              <div className="text-[11px] mono uppercase tracking-wider text-ink-dim">
                {t("conta.entrouComo")}
              </div>
              <div className="text-sm font-semibold text-ink truncate">
                {name}
              </div>
              <div className="text-[12px] text-ink-mute truncate">{email}</div>
            </div>
            <Link
              href="/app/planos"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-ink-mute hover:text-ink hover:bg-bg transition border-b border-line"
            >
              <Zap className="w-4 h-4" />
              {t("conta.planos")}
            </Link>
            <div className="px-3.5 py-2.5 border-b border-line">
              <div className="flex items-center gap-2 text-[12px] text-ink-dim mb-1.5">
                <Languages className="w-3.5 h-3.5" /> {t("conta.idioma")}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {IDIOMAS.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setIdioma(i.id)}
                    className={cn(
                      "h-8 rounded-lg text-[12px] font-semibold transition inline-flex items-center justify-center gap-1.5",
                      idioma === i.id
                        ? "bg-accent text-bg"
                        : "text-ink-mute hover:text-ink hover:bg-bg",
                    )}
                  >
                    <span aria-hidden>{i.bandeira}</span>
                    {i.id === "pt" ? tx("PT-BR") : "EN"}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                await signOut();
                router.push("/");
              }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-ink-mute hover:text-pink hover:bg-pink/10 transition"
            >
              <LogOut className="w-4 h-4" />
              {t("conta.sair")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
