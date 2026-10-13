"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRecursos } from "@/components/RecursosProvider";
import {
  conectarCarteira,
  desconectarCarteira,
  ligarCarteiras,
  useCarteiras,
  type CarteiraInstalada,
  type Familia,
} from "@/lib/carteira";
import { cn } from "@/lib/cn";
import { copyToClipboard } from "@/lib/export";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { CarteiraError } from "@/lib/nft/carteira-navegador";
import { abreviarEndereco } from "@/lib/nft/comum";
import { retomarPagamentos } from "@/lib/pagamentos/enviados";
import { REDES_USDC } from "@/lib/pagamentos/redes-usdc";

/** Ícone que a própria carteira anuncia; sem ele, o genérico. */
export function IconeDaCarteira({
  carteira,
  className,
}: {
  carteira: CarteiraInstalada;
  className?: string;
}) {
  return carteira.icone ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={carteira.icone}
      alt=""
      className={cn("h-4 w-4 shrink-0 rounded", className)}
    />
  ) : (
    <Wallet className={cn("h-4 w-4 shrink-0", className)} />
  );
}

/** Mensagem de um erro da carteira, já no idioma da pessoa. */
export function erroDaCarteira(e: unknown, padrao: string): string {
  return e instanceof CarteiraError
    ? `${txErro(e.message)}${e.detalhe ? ` (${e.detalhe})` : ""}`
    : tx(padrao);
}

/**
 * Carteira cripto na barra do topo, ao lado do sino: mostra a que está
 * conectada (uma Solana e uma EVM) e deixa conectar, copiar o endereço e
 * desconectar. É dela que saem os pagamentos em USDC — por isso só aparece com
 * o USDC configurado, e só as redes ligadas.
 */
export function CarteiraNaBarra() {
  const { user } = useAuth();
  const { usdc, usdcRedes } = useRecursos();
  const carteiras = useCarteiras();
  const [aberto, setAberto] = useState(false);
  const [conectando, setConectando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<Familia | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const ligado = !!user && usdc;

  useEffect(() => {
    if (!ligado) return;
    ligarCarteiras();
    // Pagamento enviado numa visita anterior e ainda sem confirmação.
    retomarPagamentos();
  }, [ligado]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  if (!ligado) return null;

  const evm = REDES_USDC.filter((r) => r.evm && usdcRedes.includes(r.id));
  const familias: Array<{ id: Familia; redes: string }> = [
    ...(usdcRedes.includes("solana")
      ? [{ id: "solana" as const, redes: "Solana" }]
      : []),
    ...(evm.length
      ? [{ id: "evm" as const, redes: evm.map((r) => r.nome).join(" · ") }]
      : []),
  ];
  const conectadas = familias.flatMap((f) => carteiras[f.id] ?? []);

  async function conectar(familia: Familia, id: string) {
    setErro(null);
    setConectando(`${familia}:${id}`);
    try {
      await conectarCarteira(familia, id);
    } catch (e) {
      setErro(erroDaCarteira(e, "Não foi possível conectar a carteira."));
    } finally {
      setConectando(null);
    }
  }

  async function copiar(familia: Familia, endereco: string) {
    if (!(await copyToClipboard(endereco))) return;
    setCopiado(familia);
    setTimeout(() => setCopiado(null), 1200);
  }

  const rotulo = conectadas.length
    ? `${tx("Carteira conectada")}: ${conectadas.map((c) => `${c.nome} ${abreviarEndereco(c.endereco)}`).join(", ")}`
    : tx("Conectar carteira");

  return (
    // No celular o painel se alinha à barra do topo (16px da borda), não ao botão: preso ao botão ele saía pela esquerda da tela.
    <div className="sm:relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={rotulo}
        title={rotulo}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 text-[12px] font-semibold text-ink transition hover:border-line-strong"
      >
        {conectadas.length ? (
          <>
            <span className="flex -space-x-1">
              {conectadas.map((c) => (
                <IconeDaCarteira key={c.endereco} carteira={c} />
              ))}
            </span>
            {/* Abaixo de `lg` fica só o ícone: num tablet o texto tirava o lugar da busca. */}
            <span className="mono hidden lg:inline">
              {abreviarEndereco(conectadas[0].endereco)}
            </span>
            {conectadas.length > 1 ? (
              <span className="hidden text-ink-dim lg:inline">
                +{conectadas.length - 1}
              </span>
            ) : null}
          </>
        ) : (
          <>
            <Wallet className="h-4 w-4" />
            <span className="hidden lg:inline">{tx("Conectar carteira")}</span>
          </>
        )}
      </button>
      {aberto ? (
        <div className="absolute right-4 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel shadow-card sm:right-0">
          <div className="border-b border-line px-3.5 py-2.5 text-[11px] mono uppercase tracking-wider text-ink-dim">
            {tx("Carteira para pagar em USDC")}
          </div>
          {familias.map((f) => {
            const c = carteiras[f.id];
            const instaladas = carteiras.instaladas[f.id];
            return (
              <div
                key={f.id}
                className="grid gap-2 border-b border-line px-3.5 py-3 last:border-b-0"
              >
                <div className="text-[11px] font-semibold text-ink-dim">
                  {f.redes}
                </div>
                {c ? (
                  <div className="flex items-center gap-2">
                    <IconeDaCarteira carteira={c} className="h-5 w-5" />
                    <button
                      type="button"
                      onClick={() => copiar(f.id, c.endereco)}
                      title={c.endereco}
                      className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] text-ink hover:text-accent"
                    >
                      <span className="truncate">
                        {c.nome} ·{" "}
                        <span className="mono">
                          {abreviarEndereco(c.endereco)}
                        </span>
                      </span>
                      {copiado === f.id ? (
                        <Check className="h-3 w-3 shrink-0 text-ok" />
                      ) : (
                        <Copy className="h-3 w-3 shrink-0 text-ink-dim" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => desconectarCarteira(f.id)}
                      className="shrink-0 text-[12px] font-semibold text-ink-mute hover:text-pink"
                    >
                      {tx("Desconectar")}
                    </button>
                  </div>
                ) : instaladas.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {instaladas.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        disabled={!!conectando}
                        onClick={() => conectar(f.id, w.id)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-semibold text-ink transition hover:border-line-strong disabled:opacity-50"
                      >
                        {conectando === `${f.id}:${w.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <IconeDaCarteira carteira={w} />
                        )}
                        {w.nome}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-mute">
                    {tx("Nenhuma carteira desta rede instalada neste navegador.")}
                  </p>
                )}
              </div>
            );
          })}
          {erro ? (
            <p className="border-t border-line px-3.5 py-2.5 text-[12px] text-pink">
              {erro}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
