"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { LogoSolana } from "@/components/nft/LogoSolana";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { confirmar } from "@/components/ui/Confirmacao";
import { liberadoNaTela } from "@/lib/em-teste";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import {
  aoMudarCarteiras,
  CarteiraError,
  carteirasDisponiveis,
  vincularCarteira,
  type CarteiraDisponivel,
} from "@/lib/nft/carteira-navegador";
import { abreviarEndereco } from "@/lib/nft/comum";

/**
 * Carteira Solana da conta, no Perfil (junto das outras contas vinculadas):
 * ver qual é, trocar e desvincular. É a mesma da aba NFT do personagem — é
 * para ela que os NFTs são mintados. Só aparece com o NFT configurado e
 * liberado para a conta.
 */
export function CarteiraConta({ className }: { className?: string }) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const ligado = recursos.nft && liberadoNaTela("nft", conta);
  /** undefined = carregando · null = nenhuma. */
  const [carteira, setCarteira] = useState<string | null | undefined>();
  const [instaladas, setInstaladas] = useState<CarteiraDisponivel[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!ligado) return;
    let vivo = true;
    fetch("/api/carteira", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { carteira: null }))
      .then((b: { carteira: string | null }) => vivo && setCarteira(b.carteira))
      .catch(() => vivo && setCarteira(null));
    setInstaladas(carteirasDisponiveis());
    const tirar = aoMudarCarteiras(() => setInstaladas(carteirasDisponiveis()));
    return () => {
      vivo = false;
      tirar();
    };
  }, [ligado]);

  if (!ligado) return null;

  async function vincular(nome: string) {
    setOcupado(true);
    setErro(null);
    try {
      setCarteira(await vincularCarteira(nome));
      setEscolhendo(false);
    } catch (e) {
      setErro(
        e instanceof CarteiraError
          ? `${txErro(e.message)}${e.detalhe ? ` (${e.detalhe})` : ""}`
          : tx("Não foi possível conectar a carteira."),
      );
    } finally {
      setOcupado(false);
    }
  }

  async function desvincular() {
    if (
      !(await confirmar({
        titulo: tx("Desvincular a carteira?"),
        mensagem: tx(
          "Os NFTs já mintados continuam nela. Para mintar outro, é só vincular uma carteira de novo.",
        ),
        confirmar: tx("Desvincular"),
      }))
    )
      return;
    setOcupado(true);
    setErro(null);
    const r = await fetch("/api/carteira", { method: "DELETE" }).catch(
      () => null,
    );
    if (!r?.ok) setErro(tx("Não consegui desvincular. Tente de novo."));
    else setCarteira(null);
    setOcupado(false);
  }

  async function copiar() {
    if (!carteira) return;
    try {
      await navigator.clipboard.writeText(carteira);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1200);
    } catch {
      /* sem permissão de área de transferência: o endereço está no title */
    }
  }

  const vinculada = !!carteira;
  // Sem carteira, a escolha já fica à vista; com carteira, só depois de "Trocar".
  const mostrarEscolha = carteira === null || escolhendo;

  return (
    <div className={className}>
      <div className="grid gap-3 rounded-xl border border-line p-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-black">
            <LogoSolana className="w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-ink">
                {tx("Carteira Solana")}
              </span>
              {vinculada ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  <Check className="h-3 w-3" /> {tx("Vinculada")}
                </span>
              ) : null}
            </div>
            {vinculada ? (
              <button
                type="button"
                onClick={copiar}
                title={carteira}
                className="mono inline-flex max-w-full items-center gap-1.5 truncate text-[12.5px] text-ink-mute hover:text-ink"
              >
                {abreviarEndereco(carteira)}
                {copiado ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 text-ink-dim" />
                )}
              </button>
            ) : (
              <div className="truncate text-[12.5px] text-ink-mute">
                {carteira === undefined
                  ? tx("Carregando…")
                  : tx("Nenhuma carteira vinculada")}
              </div>
            )}
          </div>
          {vinculada && !escolhendo ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setErro(null);
                  setEscolhendo(true);
                }}
                disabled={ocupado}
              >
                {tx("Trocar")}
              </Button>
              <Button variant="ghost" onClick={desvincular} disabled={ocupado}>
                {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tx("Desvincular")}
              </Button>
            </div>
          ) : null}
        </div>

        {mostrarEscolha ? (
          instaladas.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {instaladas.map((c) => (
                <Button
                  key={c.nome}
                  variant="ghost"
                  size="sm"
                  disabled={ocupado}
                  onClick={() => vincular(c.nome)}
                >
                  {ocupado ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icone} alt="" className="h-4 w-4 rounded" />
                  )}
                  {c.nome}
                </Button>
              ))}
              {escolhendo ? (
                <button
                  type="button"
                  onClick={() => setEscolhendo(false)}
                  disabled={ocupado}
                  className="text-[13px] font-semibold text-ink-mute hover:text-ink"
                >
                  {tx("Cancelar")}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-mute">
              {tx(
                "Instale a Phantom, a Solflare, a Backpack ou a MetaMask neste navegador para conectar a carteira.",
              )}
            </p>
          )
        ) : null}

        <p className="text-[11.5px] leading-relaxed text-ink-dim">
          {tx(
            "É para esta carteira que os NFTs dos seus influencers são mintados. Ela só assina uma mensagem para provar que é sua: não é transação e não tem custo.",
          )}
        </p>
      </div>
      {erro ? <p className="mt-1.5 text-[12px] text-pink">{erro}</p> : null}
    </div>
  );
}
