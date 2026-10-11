"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Coins, HardDrive, Languages, LogOut, Users } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ContaVinculada } from "@/components/auth/ContaVinculada";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { CarteiraConta } from "@/components/nft/CarteiraConta";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
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
  if (!user)
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-8 sm:px-6">
        <p className="text-[14px] text-ink-mute">
          {tx("Entre na sua conta para ver o perfil.")}
        </p>
        <Link href="/auth/login" className="w-fit">
          <Button variant="accent">{tx("Entrar")}</Button>
        </Link>
      </div>
    );

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
        <section className="card grid gap-4 p-5">
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
        <section className="card grid gap-3 p-5">
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
