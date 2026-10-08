"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  ExternalLink,
  Gift,
  Landmark,
  Loader2,
  PenLine,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { confirmar } from "@/components/ui/Confirmacao";
import {
  CARENCIA_DIAS,
  COMISSAO,
  formatoDeCarteira,
  normalizarCodigo,
  problemaDoCodigo,
} from "@/lib/indicacao/regras";
import type { ResumoIndicacao } from "@/lib/indicacao/server";
import { REDES_USDC, type RedeUsdc } from "@/lib/pagamentos/redes-usdc";
import { PLANOS, type PlanoId } from "@/lib/planos";
import { idiomaAtual, tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

type Resumo = ResumoIndicacao & { link: string };

const local = () => (idiomaAtual() === "en" ? "en-US" : "pt-BR");
const dinheiro = (valor: number, moeda: string) =>
  moeda === "USDC"
    ? `${valor.toLocaleString(local(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
    : valor.toLocaleString(local(), { style: "currency", currency: moeda });
const EXPLORER: Record<string, string> = {
  solana: "https://solscan.io/tx/",
  base: "https://basescan.org/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  bnb: "https://bscscan.com/tx/",
  ethereum: "https://etherscan.io/tx/",
};
const dia = (iso: string) =>
  new Date(iso).toLocaleDateString(local(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const ROTULO_SAQUE: Record<string, string> = {
  processando: "Processando",
  pago: "Enviado",
  falhou: "Falhou",
};

export default function IndicacoesPage() {
  const { user } = useAuth();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [rede, setRede] = useState<RedeUsdc | "">("");
  const [carteira, setCarteira] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/indicacao", { cache: "no-store" });
      const b = await r.json().catch(() => null);
      if (!r.ok)
        return setErroCarga(
          txErro(b?.error ?? `Falha (HTTP ${r.status}).`),
        );
      setErroCarga(null);
      setResumo(b);
    } catch {
      setErroCarga(tx("Falha de rede. Tente de novo."));
    }
  }, []);

  useEffect(() => {
    if (user) carregar();
  }, [user, carregar]);

  /** Chama uma rota que devolve { url } e abre essa página do Stripe. */
  async function abrirNoStripe(rota: string, chave: string) {
    setErro(null);
    setOcupado(chave);
    try {
      const r = await fetch(rota, { method: "POST" });
      const b = await r.json().catch(() => null);
      if (!r.ok || !b?.url) return setErro(txErro(b?.error ?? "Falha. Tente de novo."));
      window.location.href = b.url;
    } catch {
      setErro(tx("Falha de rede. Tente de novo."));
    } finally {
      setOcupado(null);
    }
  }

  async function salvarCodigo() {
    const problema = problemaDoCodigo(novoCodigo);
    if (problema) return setErro(txErro(problema));
    const codigo = normalizarCodigo(novoCodigo);
    const ok = await confirmar({
      titulo: `${tx("Usar o código")} “${codigo}”?`,
      mensagem: tx(
        "Você só pode escolher o código uma vez. O link antigo para de funcionar e este passa a valer para sempre.",
      ),
      confirmar: tx("Usar este código"),
    });
    if (!ok) return;
    setErro(null);
    setOcupado("codigo");
    try {
      const r = await fetch("/api/indicacao/codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const b = await r.json().catch(() => null);
      if (!r.ok) return setErro(txErro(b?.error ?? "Falha. Tente de novo."));
      setEditando(false);
      setNovoCodigo("");
      await carregar();
    } catch {
      setErro(tx("Falha de rede. Tente de novo."));
    } finally {
      setOcupado(null);
    }
  }

  async function sacar(moeda: string, valor: number) {
    const usdc = moeda === "USDC";
    const destino = carteira.trim();
    const redeEscolhida = rede || resumo?.usdc.redes[0] || "";
    if (usdc && !formatoDeCarteira(redeEscolhida, destino))
      return setErro(tx("Endereço de carteira inválido para esta rede."));
    const ok = await confirmar({
      titulo: `${tx("Sacar")} ${dinheiro(valor, moeda)}?`,
      mensagem: usdc
        ? `${tx("O USDC é enviado agora, na rede")} ${REDES_USDC.find((r) => r.id === redeEscolhida)?.nome}, ${tx("para")} ${destino}. ${tx("Confira o endereço e a rede: transferência on-chain não pode ser desfeita.")}`
        : tx(
            "O valor vai para a sua conta no Stripe, que repassa para o seu banco no prazo dela.",
          ),
      confirmar: tx("Sacar"),
    });
    if (!ok) return;
    setErro(null);
    setAviso(null);
    setOcupado(`sacar-${moeda}`);
    try {
      const r = await fetch("/api/indicacao/sacar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usdc ? { moeda, rede: redeEscolhida, carteira: destino } : { moeda },
        ),
      });
      const b = await r.json().catch(() => null);
      if (!r.ok) setErro(txErro(b?.error ?? "Falha. Tente de novo."));
      else if (usdc)
        setAviso(
          b.pendente
            ? tx(
                "A transferência foi enviada, mas a rede ainda não confirmou. O saque fica em processamento até a confirmação.",
              )
            : `${dinheiro(b.valor, moeda)} ${tx("enviados para a sua carteira.")}`,
        );
      else
        setAviso(
          `${dinheiro(b.valor, moeda)} ${tx("enviados para a sua conta no Stripe.")}`,
        );
      await carregar();
    } catch {
      setErro(tx("Falha de rede. Tente de novo."));
    } finally {
      setOcupado(null);
    }
  }

  const pct = Math.round(COMISSAO * 100);

  if (user === undefined)
    return (
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <div className="card p-8 text-center text-ink-mute">
          <Link href="/auth/login" className="font-bold text-accent">
            {tx("Entre na sua conta")}
          </Link>{" "}
          {tx("para indicar amigos e ganhar comissão.")}
        </div>
      </main>
    );

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 grid gap-6">
      <header className="grid gap-2.5">
        <div className="eyebrow-accent inline-flex items-center gap-2">
          <Gift className="w-3.5 h-3.5" />
          {tx("Indique e ganhe")}
        </div>
        <h1 className="display text-3xl sm:text-4xl uppercase">
          {tx("Ganhe")} {pct}% {tx("de quem você indicar")}
        </h1>
        <p className="text-ink-mute max-w-[62ch] leading-relaxed">
          {tx(
            "Compartilhe o seu link. Quando alguém cria a conta por ele e assina qualquer plano, você recebe",
          )}{" "}
          {pct}%{" "}
          {tx(
            "do valor da primeira assinatura, em dinheiro. O saque é feito pelo Stripe; se o plano foi pago em USDC, a comissão sai em USDC para a sua carteira.",
          )}
        </p>
      </header>

      {erroCarga ? (
        <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
          {erroCarga}
        </div>
      ) : null}
      {erro ? (
        <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink">
          {erro}
        </div>
      ) : null}
      {aviso ? (
        <div className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          {aviso}
        </div>
      ) : null}

      {!resumo ? (
        erroCarga ? null : (
          <div className="py-16 grid place-items-center text-ink-dim">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )
      ) : (
        <>
          {/* Link e código */}
          <section className="card p-5 sm:p-6 grid gap-4">
            <div className="label-cap">{tx("Seu link de indicação")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="mono flex-1 min-w-0 truncate rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[13.5px] text-ink">
                {resumo.link}
              </code>
              <Button
                variant="accent"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resumo.link);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 1600);
                  } catch {}
                }}
              >
                {copiado ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                {copiado ? tx("Copiado") : tx("Copiar link")}
              </Button>
            </div>

            {resumo.personalizado ? (
              <p className="text-[13px] text-ink-dim">
                {tx("Código")}:{" "}
                <span className="mono text-ink">{resumo.codigo}</span> ·{" "}
                {tx("já escolhido, não muda mais.")}
              </p>
            ) : editando ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    autoFocus
                    maxLength={24}
                    placeholder={tx("seu-codigo")}
                    value={novoCodigo}
                    onChange={(e) => setNovoCodigo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && salvarCodigo()}
                    className="max-w-xs"
                  />
                  <Button
                    variant="accent"
                    onClick={salvarCodigo}
                    disabled={ocupado === "codigo" || !novoCodigo.trim()}
                  >
                    {tx("Salvar código")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditando(false);
                      setErro(null);
                    }}
                  >
                    {tx("Cancelar")}
                  </Button>
                </div>
                <p className="text-[12.5px] text-ink-dim">
                  {tx(
                    "De 3 a 24 caracteres: letras sem acento, números, hífen e sublinhado. Você só pode escolher uma vez.",
                  )}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-ink-dim">
                  {tx("Código")}:{" "}
                  <span className="mono text-ink">{resumo.codigo}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  {tx("Escolher meu código (uma vez)")}
                </button>
              </div>
            )}
          </section>

          {/* Saldo e saque */}
          <section className="card p-5 sm:p-6 grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="label-cap">{tx("Comissões")}</div>
              {resumo.stripe.conectado ? (
                <button
                  type="button"
                  onClick={() =>
                    abrirNoStripe("/api/indicacao/stripe/painel", "painel")
                  }
                  disabled={ocupado === "painel"}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-mute hover:text-ink"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {tx("Ver no Stripe")}
                </button>
              ) : null}
            </div>

            {resumo.saldos.length === 0 ? (
              <p className="text-[14px] text-ink-mute">
                {tx(
                  "Nenhuma comissão ainda. Ela aparece aqui quando um indicado assinar um plano.",
                )}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {resumo.saldos.map((s) => (
                  <div
                    key={s.moeda}
                    className="rounded-2xl border border-line bg-bg p-4 grid gap-3"
                  >
                    <div>
                      <div className="text-[12px] text-ink-dim">
                        {tx("Disponível para saque")}
                      </div>
                      <div className="display text-3xl text-accent mt-1">
                        {dinheiro(s.disponivel, s.moeda)}
                      </div>
                    </div>
                    <div className="mono text-[11.5px] text-ink-dim">
                      {tx("Em carência")}: {dinheiro(s.pendente, s.moeda)} ·{" "}
                      {tx("Já sacado")}: {dinheiro(s.sacado, s.moeda)}
                    </div>
                    {s.moeda === "USDC" ? (
                      resumo.usdc.redes.length === 0 ? (
                        <div className="text-[12px] text-ink-dim">
                          {tx(
                            "O saque em USDC não está configurado neste deploy.",
                          )}
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            {resumo.usdc.redes.map((id) => {
                              const ativa =
                                (rede || resumo.usdc.redes[0]) === id;
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => setRede(id)}
                                  aria-pressed={ativa}
                                  className={
                                    ativa
                                      ? "h-8 rounded-full border border-accent bg-accent/10 px-3 text-[12.5px] font-semibold text-accent"
                                      : "h-8 rounded-full border border-line px-3 text-[12.5px] font-semibold text-ink-mute hover:text-ink"
                                  }
                                >
                                  {REDES_USDC.find((r) => r.id === id)?.nome}
                                </button>
                              );
                            })}
                          </div>
                          <Input
                            value={carteira}
                            onChange={(e) => setCarteira(e.target.value)}
                            placeholder={
                              (rede || resumo.usdc.redes[0]) === "solana"
                                ? tx("Endereço da sua carteira Solana")
                                : tx("Endereço da sua carteira (0x…)")
                            }
                            spellCheck={false}
                            autoComplete="off"
                            className="mono text-[13px]"
                          />
                        </div>
                      )
                    ) : null}
                    {(
                      s.moeda === "USDC"
                        ? resumo.usdc.redes.length > 0
                        : resumo.stripe.pronto
                    ) ? (
                      <Button
                        variant="accent"
                        onClick={() => sacar(s.moeda, s.disponivel)}
                        disabled={
                          s.disponivel < s.minimo ||
                          (s.moeda === "USDC" && !carteira.trim()) ||
                          ocupado === `sacar-${s.moeda}`
                        }
                      >
                        {ocupado === `sacar-${s.moeda}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : null}
                        {tx("Sacar")}
                      </Button>
                    ) : null}
                    {s.disponivel < 0 ? (
                      <div className="text-[12px] text-pink">
                        {tx(
                          "Uma comissão já sacada foi estornada. O valor será descontado das próximas.",
                        )}
                      </div>
                    ) : s.disponivel < s.minimo ? (
                      <div className="text-[12px] text-ink-dim">
                        {tx("Saque mínimo")}: {dinheiro(s.minimo, s.moeda)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <p className="text-[12.5px] text-ink-dim leading-relaxed">
              {tx("A comissão fica em carência por")} {CARENCIA_DIAS}{" "}
              {tx(
                "dias depois do pagamento do indicado e então libera para saque. Se o pagamento for estornado, a comissão é desfeita.",
              )}
            </p>

            {resumo.saldos.length > 0 &&
            resumo.saldos.every((s) => s.moeda === "USDC") ? null : !resumo
                .stripe.configurado ? (
              <div className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-dim">
                {tx("O saque pelo Stripe não está configurado neste deploy.")}
              </div>
            ) : !resumo.stripe.pronto ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg px-4 py-3">
                <Landmark className="w-4 h-4 text-accent shrink-0" />
                <span className="flex-1 min-w-[220px] text-[13px] text-ink-mute">
                  {resumo.stripe.conectado
                    ? tx(
                        "Falta terminar o cadastro da sua conta de recebimento no Stripe.",
                      )
                    : tx(
                        "Para sacar, cadastre sua conta de recebimento no Stripe (dados pessoais e conta bancária).",
                      )}
                </span>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() =>
                    abrirNoStripe("/api/indicacao/stripe/conectar", "conectar")
                  }
                  disabled={ocupado === "conectar"}
                >
                  {ocupado === "conectar" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : null}
                  {resumo.stripe.conectado
                    ? tx("Continuar cadastro")
                    : tx("Conectar Stripe")}
                </Button>
              </div>
            ) : null}
          </section>

          {/* Indicados */}
          <section className="card overflow-hidden">
            <div className="flex items-baseline gap-3 px-5 sm:px-6 py-4">
              <div className="label-cap">{tx("Indicados")}</div>
              <span className="mono text-[11.5px] text-ink-dim">
                {resumo.indicados.length} {tx("no total")} ·{" "}
                {resumo.indicados.filter((i) => i.assinou).length}{" "}
                {tx("assinaram")}
              </span>
            </div>
            {resumo.indicados.length === 0 ? (
              <div className="border-t border-line px-5 sm:px-6 py-6 text-[14px] text-ink-mute">
                {tx("Ninguém criou conta pelo seu link ainda.")}
              </div>
            ) : (
              resumo.indicados.map((i, n) => (
                <div
                  key={n}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-5 sm:px-6 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-ink">
                      {i.nome}
                    </div>
                    <div className="mono text-[11.5px] text-ink-dim">
                      {tx("entrou em")} {dia(i.desde)}
                    </div>
                  </div>
                  {i.estornada ? (
                    <span className="mono text-[11.5px] text-pink">
                      {tx("pagamento estornado")}
                    </span>
                  ) : i.assinou && i.comissao != null && i.moeda ? (
                    <div className="text-right">
                      <div className="mono text-[13px] font-semibold text-ok">
                        +{dinheiro(i.comissao, i.moeda)}
                      </div>
                      <div className="text-[11.5px] text-ink-dim">
                        {tx("Plano")}{" "}
                        {PLANOS[i.plano as PlanoId]?.nome ?? i.plano}
                      </div>
                    </div>
                  ) : (
                    <span className="mono text-[11.5px] text-ink-dim">
                      {tx("ainda não assinou")}
                    </span>
                  )}
                </div>
              ))
            )}
          </section>

          {/* Saques */}
          {resumo.saques.length > 0 ? (
            <section className="card overflow-hidden">
              <div className="px-5 sm:px-6 py-4 label-cap">{tx("Saques")}</div>
              {resumo.saques.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 border-t border-line px-5 sm:px-6 py-3"
                >
                  <span className="mono text-[12px] text-ink-dim">
                    {dia(s.quando)}
                  </span>
                  <span className="mono text-[13px] font-semibold text-ink">
                    {dinheiro(s.valor, s.moeda)}
                    {s.rede && s.txHash && EXPLORER[s.rede] ? (
                      <a
                        href={EXPLORER[s.rede] + s.txHash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 font-normal text-accent hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {tx("ver transação")}
                      </a>
                    ) : null}
                  </span>
                  <span
                    className={
                      s.status === "falhou"
                        ? "mono text-[11.5px] uppercase text-pink"
                        : "mono text-[11.5px] uppercase text-ink-mute"
                    }
                  >
                    {tx(ROTULO_SAQUE[s.status] ?? s.status)}
                  </span>
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
