"use client";

import { useState } from "react";
import { Mail, MessageCircle, RefreshCw } from "lucide-react";
import type { LeadAdmin, LeadsAdmin } from "@/lib/admin/leads";
import { cn } from "@/lib/cn";
import { diaHora, Estado, Kpi, num, Secao, Selo, useAdmin } from "./partes";

const NOME_PERFIL: Record<string, string> = {
  marca: "Marca",
  agencia: "Agência",
  creator: "Creator",
};

/** Link do WhatsApp a partir do número digitado (só dígitos; sem DDI vira Brasil). */
export function linkWhatsapp(numero: string | null): string | null {
  const digitos = (numero ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`;
}

function Contato({ lead }: { lead: LeadAdmin }) {
  const zap = linkWhatsapp(lead.whatsapp);
  const botao =
    "inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-bold text-ink transition hover:border-accent";
  return (
    <div className="flex flex-wrap gap-2">
      {zap ? (
        <a href={zap} target="_blank" rel="noopener noreferrer" className={botao}>
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
      ) : null}
      <a href={`mailto:${lead.email}`} className={botao}>
        <Mail className="h-3.5 w-3.5" /> E-mail
      </a>
    </div>
  );
}

/**
 * Aba Leads: quem pediu proposta do plano Agência e quem entrou na whitelist
 * pela landing page. Esses formulários só gravam no banco — é aqui que se lê.
 */
export function Leads() {
  const { dados, erro, carregando, recarregar } =
    useAdmin<LeadsAdmin>("/api/admin/leads");
  const [filtro, setFiltro] = useState<"agencia" | "whitelist">("agencia");
  const itens = dados?.itens.filter((l) => l.tipo === filtro) ?? [];

  return (
    <div className="grid gap-6 min-w-0">
      {dados ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Kpi
            rotulo="Propostas (Agência)"
            valor={num(dados.totais.agencia)}
            icone={MessageCircle}
          />
          <Kpi
            rotulo="Whitelist"
            valor={num(dados.totais.whitelist)}
            icone={Mail}
          />
          <Kpi
            rotulo="Chegaram em 7 dias"
            valor={num(dados.totais.semana)}
            icone={RefreshCw}
          />
        </div>
      ) : null}

      <Secao
        titulo="Contatos da landing page"
        descricao="Os formulários não avisam ninguém: quem responde é você, por WhatsApp ou e-mail. Mais recentes primeiro."
        acoes={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-full border border-line bg-panel p-1">
              {(
                [
                  ["agencia", "Propostas"],
                  ["whitelist", "Whitelist"],
                ] as const
              ).map(([id, nome]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  aria-pressed={filtro === id}
                  className={cn(
                    "h-7 rounded-full px-3 text-[11px] font-bold mono transition",
                    filtro === id
                      ? "bg-accent text-bg"
                      : "text-ink-mute hover:text-ink",
                  )}
                >
                  {nome}
                  {dados ? ` · ${num(dados.totais[id])}` : ""}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={recarregar}
              title="Atualizar"
              aria-label="Atualizar"
              className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink-mute hover:text-ink"
            >
              <RefreshCw className={cn("h-4 w-4", carregando && "animate-spin")} />
            </button>
          </div>
        }
      >
        <Estado
          carregando={carregando}
          erro={erro}
          vazio={!itens.length}
          textoVazio={
            filtro === "agencia"
              ? "Nenhum pedido de proposta ainda."
              : "Ninguém na whitelist ainda."
          }
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {itens.map((l) => (
            <article key={l.id} className="card grid gap-3 p-4 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-ink">
                    {l.nome}
                    {l.empresa ? (
                      <span className="font-normal text-ink-mute">
                        {" "}
                        · {l.empresa}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-[12px] text-ink-mute">
                    {l.email}
                    {l.whatsapp ? ` · ${l.whatsapp}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-ink-dim">
                  {diaHora(l.criadoEm)}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {l.creators ? <Selo>{l.creators} creators</Selo> : null}
                {l.perfil ? (
                  <Selo>{NOME_PERFIL[l.perfil] ?? l.perfil}</Selo>
                ) : null}
                {l.temConta ? <Selo tom="ok">Já tem conta</Selo> : null}
              </div>

              {l.objetivo || l.nicho ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                  {l.objetivo ?? l.nicho}
                </p>
              ) : null}

              <Contato lead={l} />
            </article>
          ))}
        </div>
      </Secao>
    </div>
  );
}
