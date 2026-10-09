"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth/client";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";

/**
 * Tela de autorização do conector (OAuth): o Claude abre esta página quando o
 * usuário adiciona o NIDO como conector. Logado, o usuário permite ou recusa;
 * sem login, entra com o Google e volta para cá.
 */
export default function Autorizar() {
  return (
    <Suspense fallback={null}>
      <Tela />
    </Suspense>
  );
}

function Tela() {
  const p = useSearchParams();
  const { user, disabled } = useAuth();
  const pedido = {
    client_id: p?.get("client_id") ?? "",
    redirect_uri: p?.get("redirect_uri") ?? "",
    code_challenge: p?.get("code_challenge") ?? "",
    state: p?.get("state") ?? "",
  };
  const [app, setApp] = useState<{ nome: string; destino: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams({
      client_id: pedido.client_id,
      redirect_uri: pedido.redirect_uri,
    });
    fetch(`/api/mcp/oauth/consentir?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as {
          nome?: string;
          destino?: string;
          error?: string;
        };
        if (!r.ok || !b.nome || !b.destino)
          return setErro(
            txErro(b.error ?? "Pedido de conexão inválido. Tente conectar de novo."),
          );
        setApp({ nome: b.nome, destino: b.destino });
      })
      .catch(() =>
        setErro(tx("Não consegui carregar o pedido de conexão. Tente de novo.")),
      );
    // O pedido vem da URL e não muda depois que a tela abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function responder(permitir: boolean) {
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch("/api/mcp/oauth/consentir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pedido, permitir }),
      });
      const b = (await res.json().catch(() => ({}))) as {
        ir?: string;
        error?: string;
      };
      if (!res.ok || !b.ir) {
        setOcupado(false);
        return setErro(txErro(b.error ?? `Falha (HTTP ${res.status}).`));
      }
      // Volta para o Claude com a resposta.
      window.location.href = b.ir;
    } catch (e) {
      setOcupado(false);
      setErro((e as Error).message);
    }
  }

  const entrar = () =>
    authClient.signIn.social({
      provider: "google",
      // Depois do login, volta para esta mesma tela com o mesmo pedido.
      callbackURL: window.location.pathname + window.location.search,
      errorCallbackURL: "/auth/login",
    });

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 flex items-center gap-2 text-ink">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <h1 className="text-[17px] font-bold">{tx("Conectar à sua conta NIDO")}</h1>
        </div>

        {erro && !app ? (
          <p className="text-[13px] text-pink">{erro}</p>
        ) : !app || user === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-mute" />
        ) : (
          <>
            <p className="text-[14px] leading-relaxed text-ink">
              <strong>{app.nome}</strong>{" "}
              {tx("quer se conectar à sua conta do NIDO AI Studio.")}
            </p>
            <ul className="mt-3 grid gap-1.5 text-[13px] text-ink-mute">
              <li>
                •{" "}
                {tx(
                  "Vai poder ver seus personagens, imagens e vídeos, e criar conteúdo em seu nome.",
                )}
              </li>
              <li>
                •{" "}
                {tx(
                  "As gerações gastam os seus créditos, como no app. Compras e saques continuam só aqui.",
                )}
              </li>
              <li>
                •{" "}
                {tx(
                  "Você pode desligar quando quiser em Conta → Claude e ChatGPT (MCP), na lista de tokens.",
                )}
              </li>
            </ul>
            <p className="mono mt-3 truncate text-[11px] text-ink-dim">
              {tx("Depois de permitir, você volta para")} {app.destino}
            </p>
            {erro ? <p className="mt-3 text-[13px] text-pink">{erro}</p> : null}

            {disabled ? (
              <p className="mt-5 text-[13px] text-pink">
                {tx("O login não está configurado neste ambiente.")}
              </p>
            ) : user === undefined ? (
              <div className="mt-5 grid gap-2">
                <p className="text-[13px] text-ink-mute">
                  {tx("Entre na sua conta para continuar.")}
                </p>
                <Button variant="accent" className="justify-center" onClick={entrar}>
                  {tx("Entrar com Google")}
                </Button>
              </div>
            ) : (
              <>
                <p className="mt-5 text-[12px] text-ink-dim">
                  {tx("Conta:")} {user.email}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="accent"
                    className="flex-1 justify-center"
                    onClick={() => responder(true)}
                    disabled={ocupado}
                  >
                    {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {tx("Permitir")}
                  </Button>
                  <Button
                    className="flex-1 justify-center"
                    onClick={() => responder(false)}
                    disabled={ocupado}
                  >
                    {tx("Recusar")}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
