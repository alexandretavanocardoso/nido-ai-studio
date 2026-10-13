"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Coins,
  HardDrive,
  Languages,
  Loader2,
  LogOut,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ContaVinculada } from "@/components/auth/ContaVinculada";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { CarteiraConta } from "@/components/nft/CarteiraConta";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth/client";
import { PROVEDORES_VINCULO } from "@/lib/auth/vinculos";
import { cn } from "@/lib/cn";
import { liberadoNaTela } from "@/lib/em-teste";
import { IDIOMAS, useIdioma } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";
import { PLANOS } from "@/lib/planos";

const GB = 1024 ** 3;

/** Conta → Perfil: quem está logado, plano e créditos, idioma e contas vinculadas. */
export default function Perfil() {
  const recursos = useRecursos();
  const { user, signOut } = useAuth();
  const { conta } = useCreditos();
  const { idioma, setIdioma } = useIdioma();
  const router = useRouter();

  // user === null → ainda carregando (não mostra nada pra não piscar)
  if (user === null) return null;
  if (!user) return <SemLogin />;

  const nome = user.name || user.email.split("@")[0];
  // A carteira Solana (para onde os NFTs são mintados) entra com as contas vinculadas.
  const comCarteira = recursos.nft && liberadoNaTela("nft", conta);
  const numero = (n: number) =>
    n.toLocaleString(idioma === "pt" ? "pt-BR" : "en-US");
  const data = (iso: string) =>
    new Date(iso).toLocaleDateString(idioma === "pt" ? "pt-BR" : "en-US");

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-8 sm:px-6 [&>*]:min-w-0">
      <header>
        <h1 className="display text-2xl uppercase text-ink">{tx("Perfil")}</h1>
        <p className="mt-1 text-[14px] text-ink-mute">
          {tx("Sua conta, seu plano e as contas vinculadas.")}
        </p>
      </header>

      <section className="card flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#5c2a1f,#aa7d43)] text-2xl font-bold text-ink">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-full w-full object-cover" />
          ) : (
            (nome[0] ?? "?").toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold text-ink">{nome}</div>
          <div className="truncate text-[13px] text-ink-mute">{user.email}</div>
          <div className="mt-1 text-[11.5px] text-ink-dim">
            {tx("Login pelo Google. Nome e foto vêm da sua conta Google.")}
          </div>
        </div>
      </section>

      {conta ? (
        <section className="card grid grid-cols-1 gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[12px] text-ink-mute">{tx("Plano")}</div>
              <div className="text-[17px] font-semibold text-ink">
                {PLANOS[conta.plano].nome}
              </div>
              {conta.proximaRecargaEm ? (
                <div className="text-[11.5px] text-ink-dim">
                  {tx("Próxima recarga em")} {data(conta.proximaRecargaEm)}
                </div>
              ) : null}
            </div>
            <Link href="/app/planos">
              <Button variant="ghost">{tx("Ver planos e créditos")}</Button>
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Numero
              icone={<Coins className="h-4 w-4" />}
              rotulo={tx("Créditos")}
              valor={numero(conta.total)}
              detalhe={
                conta.creditosAvulsos
                  ? `${numero(conta.creditosPlano)} ${tx("do plano")} · ${numero(conta.creditosAvulsos)} ${tx("avulsos")}`
                  : undefined
              }
            />
            <Numero
              icone={<Users className="h-4 w-4" />}
              rotulo={tx("Personagens")}
              valor={numero(conta.personagens)}
            />
            <Numero
              icone={<HardDrive className="h-4 w-4" />}
              rotulo={tx("Armazenamento")}
              valor={`${(conta.armazenamento.usadoBytes / GB).toFixed(1)} GB`}
              detalhe={`${tx("de")} ${(conta.armazenamento.cotaBytes / GB).toFixed(0)} GB`}
            />
          </div>
        </section>
      ) : null}

      {PROVEDORES_VINCULO.some((p) => recursos[p]) || comCarteira ? (
        // grid-cols-1 (minmax(0,1fr)): nome de conta comprido trunca em vez de alargar o cartão além da tela.
        <section className="card grid grid-cols-1 gap-3 p-5">
          <div>
            <div className="text-[13px] font-semibold text-ink">
              {tx("Contas vinculadas")}
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-mute">
              {tx("Ligue outras contas à sua. O login continua sendo pelo Google.")}
            </p>
          </div>
          {PROVEDORES_VINCULO.map((p) => (
            <ContaVinculada key={p} provedor={p} />
          ))}
          <CarteiraConta />
        </section>
      ) : null}

      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Languages className="h-4 w-4" /> {tx("Idioma")}
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-line p-1">
          {IDIOMAS.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setIdioma(i.id)}
              aria-pressed={idioma === i.id}
              className={cn(
                "h-8 rounded-lg px-4 text-[12.5px] font-semibold transition",
                idioma === i.id
                  ? "bg-accent text-black"
                  : "text-ink-mute hover:text-ink",
              )}
            >
              {i.id === "pt" ? tx("PT-BR") : "EN"}
            </button>
          ))}
        </div>
      </section>

      <div>
        <Button
          variant="ghost"
          onClick={async () => {
            await signOut();
            router.push("/");
          }}
        >
          <LogOut className="h-4 w-4" /> {tx("Sair")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Perfil sem login: um cartão só, com o botão do Google. Entra direto daqui e
 * volta para o Perfil (o "Entrar" do resto do app cai na Home).
 */
function SemLogin() {
  const { disabled } = useAuth();
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar() {
    setAbrindo(true);
    setErro(null);
    const r = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/app/perfil",
      errorCallbackURL: "/auth/login",
    });
    // Sem erro, o navegador já está indo para o Google: o botão segue girando.
    if (r.error) {
      setErro(tx("Não consegui abrir o login do Google. Tente de novo."));
      setAbrindo(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-160px)] place-items-center px-4 py-8">
      <section className="card relative w-full max-w-sm px-7 py-9 text-center before:absolute before:inset-x-[14%] before:-top-px before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(253,243,39,0.9),transparent)]">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[linear-gradient(135deg,#5c2a1f,#aa7d43)] text-ink">
          <UserRound className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <h1 className="display mt-5 text-xl uppercase text-ink">
          {tx("Entre na sua conta")}
        </h1>
        <p className="mx-auto mt-2 max-w-[260px] text-[14px] leading-relaxed text-ink-mute">
          {tx("Para ver seu plano, seus créditos e as contas vinculadas.")}
        </p>
        {disabled ? (
          <p className="mt-6 text-[13px] text-pink">
            {tx("O login não está configurado neste ambiente.")}
          </p>
        ) : (
          <Button
            variant="accent"
            size="lg"
            className="mt-7 w-full"
            onClick={entrar}
            disabled={abrindo}
          >
            <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-white">
              {abrindo ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-bg" />
              ) : (
                <GoogleIcon />
              )}
            </span>
            {abrindo ? tx("Abrindo…") : tx("Continuar com Google")}
          </Button>
        )}
        {erro ? (
          <p className="mt-3 text-[12px] text-pink" role="alert">
            {erro}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Numero({
  icone,
  rotulo,
  valor,
  detalhe,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="flex items-center gap-1.5 text-[12px] text-ink-mute">
        {icone} {rotulo}
      </div>
      <div className="mt-1 text-[19px] font-semibold tabular-nums text-ink">
        {valor}
      </div>
      {detalhe ? (
        <div className="text-[11.5px] text-ink-dim">{detalhe}</div>
      ) : null}
    </div>
  );
}
