"use client";

import { Check, Loader2 } from "lucide-react";
import { LogoDiscord } from "@/components/auth/DiscordConta";
import { useVinculo } from "@/components/auth/useVinculo";
import { Button } from "@/components/ui/Button";
import { IconeRede } from "@/components/ui/IconeRede";
import type { ProvedorVinculo } from "@/lib/auth/vinculos";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";

/** Fundo do quadro do logo, na cor de cada rede. */
const FUNDO: Record<ProvedorVinculo, string> = {
  discord: "bg-[#5865F2]",
  linkedin: "bg-[#0A66C2]",
  twitter: "border border-line bg-black",
};

function Logo({
  provedor,
  className,
}: {
  provedor: ProvedorVinculo;
  className?: string;
}) {
  if (provedor === "discord") return <LogoDiscord className={className} />;
  return (
    <IconeRede
      rede={provedor === "linkedin" ? "LINKEDIN" : "TWITTER"}
      className={className}
    />
  );
}

/**
 * Cartão de uma conta vinculada na tela de perfil (Discord, LinkedIn, X): quem
 * está vinculado e um botão para vincular ou desvincular. Só aparece em deploy
 * com o app dessa rede configurado.
 */
export function ContaVinculada({
  provedor,
  className,
}: {
  provedor: ProvedorVinculo;
  className?: string;
}) {
  const { ligado, nome, estado, vinculado, ocupado, erro, vincular, desvincular } =
    useVinculo(provedor);

  if (!ligado) return null;

  const comFoto = vinculado && !!estado?.imagem;
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3.5">
        <span
          className={cn(
            "relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white",
            FUNDO[provedor],
          )}
        >
          {comFoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={estado!.imagem!}
              alt=""
              className="h-full w-full rounded-xl object-cover"
            />
          ) : (
            <Logo provedor={provedor} className="h-6 w-6" />
          )}
          {comFoto ? (
            <span
              className={cn(
                "absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full text-white ring-2 ring-panel",
                FUNDO[provedor],
              )}
            >
              <Logo provedor={provedor} className="h-[12px] w-[12px]" />
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-ink">{nome}</span>
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
                ? (estado.nome ?? tx("Conta vinculada"))
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
}
