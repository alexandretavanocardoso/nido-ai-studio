"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  ChartColumn,
  CreditCard,
  FlaskConical,
  Gift,
  Inbox,
  LayoutDashboard,
  Newspaper,
  Radar,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Undo2,
  Users,
} from "lucide-react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { IconeNft } from "@/components/nft/IconeNft";
import { cn } from "@/lib/cn";
import { DashboardInfluencers } from "./DashboardInfluencers";
import { EmTesteAdmin } from "./EmTesteAdmin";
import { Fornecedores } from "./Fornecedores";
import { Indicacoes } from "./Indicacoes";
import { Leads } from "./Leads";
import { Lucro } from "./Lucro";
import { Nft } from "./Nft";
import { Noticias } from "./Noticias";
import { Pagamentos } from "./Pagamentos";
import { Reembolsos } from "./Reembolsos";
import { Sorteios } from "./Sorteios";
import { Uso } from "./Uso";
import { Usuarios } from "./Usuarios";
import { VisaoGeral } from "./VisaoGeral";

const ABAS = [
  { id: "visao", titulo: "Visão geral", icone: LayoutDashboard },
  { id: "dashboard", titulo: "Dashboard", icone: ChartColumn },
  { id: "usuarios", titulo: "Usuários", icone: Users },
  { id: "pagamentos", titulo: "Pagamentos", icone: CreditCard },
  { id: "reembolsos", titulo: "Reembolsos", icone: Undo2 },
  { id: "indicacoes", titulo: "Indicações", icone: Gift },
  { id: "sorteios", titulo: "Sorteios", icone: Trophy },
  { id: "leads", titulo: "Leads", icone: Inbox },
  { id: "fornecedores", titulo: "Fornecedores", icone: Radar },
  { id: "noticias", titulo: "Notícias", icone: Newspaper },
  { id: "uso", titulo: "Uso de créditos", icone: BarChart3 },
  { id: "lucro", titulo: "Lucro", icone: TrendingUp },
  { id: "nft", titulo: "NFT", icone: IconeNft },
  { id: "emteste", titulo: "Em teste", icone: FlaskConical },
] as const;
type Aba = (typeof ABAS)[number]["id"];

/** Casca da área admin: menu lateral (abas no celular) + conteúdo. A aba e o usuário aberto ficam na URL. */
export function AdminApp({ email }: { email: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const aba = (ABAS.find((a) => a.id === sp.get("aba"))?.id ?? "visao") as Aba;
  const usuario = sp.get("usuario");

  function ir(mudancas: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}?${p}`, { scroll: false });
  }
  const abrirUsuario = (id: string | null) =>
    ir({ aba: "usuarios", usuario: id });

  return (
    <main className="min-h-screen">
      {/* O menu ao lado só entra a partir de `xl`: em `lg`, com o menu do app aberto (288px), sobravam ~430px para as tabelas. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-8 grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)] gap-6 xl:gap-8">
        <aside className="xl:sticky xl:top-24 xl:self-start min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-ink px-3 mb-3">
            <ShieldCheck className="w-4 h-4 text-accent shrink-0" /> Admin
          </h1>
          <div
            role="tablist"
            aria-label="Seções do admin"
            // Abaixo de `xl` as abas ficam numa faixa que rola para o lado, com a barra à vista (fina) para dar a entender que tem mais.
            className="flex xl:grid gap-1 overflow-x-auto xl:overflow-visible -mx-1 px-1 pb-2 xl:pb-1 [scrollbar-width:thin] [scrollbar-color:#3a3536_transparent]"
          >
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => ir({ aba: a.id, usuario: null })}
                className={cn(
                  "shrink-0 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition",
                  aba === a.id
                    ? "bg-card text-ink"
                    : "text-ink-mute hover:text-ink hover:bg-panel",
                )}
              >
                <a.icone
                  className={cn(
                    "w-4 h-4 shrink-0",
                    aba === a.id && "text-accent",
                  )}
                />
                <span className="whitespace-nowrap">{a.titulo}</span>
              </button>
            ))}
          </div>
          <p className="hidden xl:block text-[11px] text-ink-dim mt-4 px-3 leading-relaxed">
            Você entrou como admin ({email}). O que você muda em planos e
            créditos fica no extrato do usuário, com o seu e-mail.
          </p>
        </aside>

        <div className="min-w-0">
          {aba === "visao" && (
            <VisaoGeral irPara={(a) => ir({ aba: a, usuario: null })} />
          )}
          {aba === "dashboard" && (
            <DashboardInfluencers abrirUsuario={abrirUsuario} />
          )}
          {aba === "usuarios" && (
            <Usuarios aberto={usuario} abrir={abrirUsuario} />
          )}
          {aba === "pagamentos" && <Pagamentos abrirUsuario={abrirUsuario} />}
          {aba === "reembolsos" && <Reembolsos abrirUsuario={abrirUsuario} />}
          {aba === "indicacoes" && <Indicacoes abrirUsuario={abrirUsuario} />}
          {aba === "sorteios" && <Sorteios />}
          {aba === "leads" && <Leads />}
          {aba === "fornecedores" && <Fornecedores />}
          {aba === "noticias" && <Noticias />}
          {aba === "uso" && <Uso abrirUsuario={abrirUsuario} />}
          {aba === "lucro" && <Lucro abrirUsuario={abrirUsuario} />}
          {aba === "nft" && <Nft abrirUsuario={abrirUsuario} />}
          {aba === "emteste" && <EmTesteAdmin />}
        </div>
      </div>
    </main>
  );
}
