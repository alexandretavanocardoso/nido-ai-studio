"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { confirmar } from "@/components/ui/Confirmacao";
import { authClient } from "@/lib/auth/client";
import { tx } from "@/lib/i18n/tx";
import { cn } from "@/lib/cn";

interface Estado {
  vinculado: boolean;
  nome?: string | null;
  /** Foto do perfil no Discord. */
  imagem?: string | null;
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

/**
 * Vincular o Discord (ou ver qual está vinculado e desvincular). Só aparece em
 * deploy com o app do Discord configurado. `cartao` é a versão da tela de
 * perfil (quem está vinculado e um botão para cada ação); sem ele, é o item
 * compacto do menu da conta.
 */
export function DiscordConta({
  className,
  cartao,
}: {
  className?: string;
  cartao?: boolean;
}) {
  const recursos = useRecursos();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!recursos.discord) return;
    let vivo = true;
    fetch("/api/conta/discord", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { vinculado: false }))
      .then((b: Estado) => vivo && setEstado(b))
      .catch(() => vivo && setEstado({ vinculado: false }));
    return () => {
      vivo = false;
    };
  }, [recursos.discord]);

  if (!recursos.discord) return null;

  async function vincular() {
    setOcupado(true);
    setErro(null);
    // Vai para o Discord autorizar e volta para a mesma tela, já vinculado.
    const r = await authClient.linkSocial({
      provider: "discord",
      callbackURL: window.location.pathname,
    });
    if (r.error) {
      setErro(tx("Não consegui abrir o Discord. Tente de novo."));
      setOcupado(false);
    }
  }

  async function desvincular() {
    if (
      !(await confirmar({
        titulo: tx("Desvincular o Discord?"),
        mensagem: tx("Você pode vincular de novo quando quiser."),
        confirmar: tx("Desvincular"),
      }))
    )
      return;
    setOcupado(true);
    setErro(null);
    const r = await fetch("/api/conta/discord", { method: "DELETE" }).catch(
      () => null,
    );
    if (!r?.ok) setErro(tx("Não consegui desvincular. Tente de novo."));
    else setEstado({ vinculado: false });
    setOcupado(false);
  }

  const vinculado = !!estado?.vinculado;
  if (cartao)
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3.5">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#5865F2] text-white">
            {vinculado && estado?.imagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={estado.imagem}
                alt=""
                className="h-full w-full rounded-xl object-cover"
              />
            ) : (
              <Logo className="h-6 w-6" />
            )}
            {vinculado && estado?.imagem ? (
              <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-[#5865F2] text-white ring-2 ring-panel">
                <Logo className="h-3 w-3" />
              </span>
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-ink">Discord</span>
              {vinculado ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  <Check className="h-3 w-3" /> {tx("Vinculado")}
                </span>
              ) : null}
            </div>
            <div className="truncate text-[12.5px] text-ink-mute">
              {!estado
                ? tx("Carregando…")
                : vinculado
                  ? (estado.nome ?? tx("Discord vinculado"))
                  : tx("Nenhuma conta vinculada")}
            </div>
          </div>
          <Button
            variant={vinculado ? "ghost" : "accent"}
            onClick={vinculado ? desvincular : vincular}
            disabled={ocupado || !estado}
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {vinculado ? tx("Desvincular") : tx("Vincular")}
          </Button>
        </div>
        {erro ? <p className="mt-1.5 text-[12px] text-pink">{erro}</p> : null}
      </div>
    );
  return (
    <>
      <button
        type="button"
        onClick={vinculado ? desvincular : vincular}
        disabled={ocupado || !estado}
        title={vinculado ? tx("Desvincular o Discord") : undefined}
        className={cn(className, "disabled:opacity-60")}
      >
        {ocupado || !estado ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Logo className={cn("h-4 w-4 shrink-0", vinculado && "text-[#8b9bff]")} />
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {vinculado
            ? (estado?.nome ?? tx("Discord vinculado"))
            : tx("Vincular Discord")}
        </span>
        {vinculado ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
        ) : null}
      </button>
      {erro ? <p className="px-2.5 pb-1 text-[11px] text-pink">{erro}</p> : null}
    </>
  );
}
