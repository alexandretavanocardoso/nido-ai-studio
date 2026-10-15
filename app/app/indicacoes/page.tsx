"use client";

import { EmTeste } from "@/components/EmTeste";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { useRecursos } from "@/components/RecursosProvider";
import { liberadoNaTela } from "@/lib/em-teste";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  ExternalLink,
  Eye,
  Gift,
  Landmark,
  Link2,
  UserRound,
  Wallet,
  Loader2,
  PenLine,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { confirmar } from "@/components/ui/Confirmacao";
import {
  CARENCIA_CARTAO_DIAS,
  CARENCIA_DIAS,
  COMISSAO,
  MESES_COMISSAO,
  formatoDeCarteira,
  normalizarCodigo,
  problemaDoCodigo,
  type SaldoComissao,
} from "@/lib/indicacao/regras";
import type { ResumoIndicacao, SaldoIndicacao } from "@/lib/indicacao/server";
import { REDES_USDC, type RedeUsdc } from "@/lib/pagamentos/redes-usdc";
import { PLANOS, type PlanoId } from "@/lib/planos";
import { idiomaAtual, tx } from "@/lib/i18n/tx";
import { moedaAtual, naMoeda } from "@/lib/moeda";
import { txErro } from "@/lib/i18n/erros";
import { cn } from "@/lib/cn";

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
type FormaDeSaque = "stripe" | "usdc";
const ROTULO_SAQUE: Record<string, string> = {
  processando: "Processando",
  pago: "Enviado",
  falhou: "Falhou",
};

export default function IndicacoesPage() {
  return (
    <EmTeste recurso="indicacoes">
      <IndicacoesPageLiberada />
    </EmTeste>
  );
}

function IndicacoesPageLiberada() {
  const { user } = useAuth();
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Simulador: indicações novas por mês e quanto cada indicado gasta por mês
  // em plano, na moeda escolhida (lib/moeda.ts). Os saldos reais aparecem na
  // moeda em que foram pagos.
  const moedaSim = moedaAtual();
  const precos = (["starter", "creator", "studio"] as const).map((id) =>
    naMoeda({ BRL: PLANOS[id].precoBRL, USD: PLANOS[id].precoUSD }),
  );
  const [simN, setSimN] = useState(10);
  const [simValor, setSimValor] = useState(precos[1]);
  const [duvida, setDuvida] = useState(0);
  // Como sacar cada saldo (Stripe ou USDC), a rede do USDC e o endereço por rede.
  const [formas, setFormas] = useState<
    Partial<Record<SaldoComissao, FormaDeSaque>>
  >({});
  const [redeSaque, setRedeSaque] = useState<RedeUsdc | null>(null);
  const [carteiras, setCarteiras] = useState<Partial<Record<RedeUsdc, string>>>(
    {},
  );

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

  /** Saca todo o saldo disponível pela forma escolhida (Stripe ou USDC numa rede). */
  async function sacar(
    saldo: SaldoIndicacao,
    forma: FormaDeSaque,
    rede: RedeUsdc | null,
  ) {
    const usdc = forma === "usdc";
    const moeda = usdc ? "USDC" : saldo.moeda;
    // Em USDC só saem as comissões de quem pagou em USDC.
    const valor = usdc ? saldo.porUsdc : saldo.disponivel;
    const redeEscolhida = rede ?? "";
    const destino = (rede ? carteiras[rede] : "")?.trim() ?? "";
    if (usdc && !formatoDeCarteira(redeEscolhida, destino))
      return setErro(tx("Endereço de carteira inválido para esta rede."));
    const ok = await confirmar({
      titulo: `${tx("Sacar")} ${dinheiro(valor, moeda)}?`,
      mensagem: usdc
        ? `${tx("O USDC é enviado agora, na rede")} ${REDES_USDC.find((r) => r.id === redeEscolhida)?.nome}, ${tx("para")} ${destino}. ${tx("Confira o endereço e a rede: transferência on-chain não pode ser desfeita.")}`
        : saldo.moeda === "USD"
          ? tx(
              "O valor é convertido para reais pela cotação do dia e vai para a sua conta no Stripe, que repassa para o seu banco no prazo dela.",
            )
          : tx(
              "O valor vai para a sua conta no Stripe, que repassa para o seu banco no prazo dela.",
            ),
      confirmar: tx("Sacar"),
    });
    if (!ok) return;
    setErro(null);
    setAviso(null);
    setOcupado(`sacar-${saldo.moeda}`);
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
          b.pago
            ? `${dinheiro(b.pago.valor, b.pago.moeda)} (${dinheiro(b.valor, moeda)}) ${tx("enviados para a sua conta no Stripe.")}`
            : `${dinheiro(b.valor, moeda)} ${tx("enviados para a sua conta no Stripe.")}`,
        );
      await carregar();
    } catch {
      setErro(tx("Falha de rede. Tente de novo."));
    } finally {
      setOcupado(null);
    }
  }

  const pct = Math.round(COMISSAO * 100);
  // Formas de saque. Pelo Stripe sai o saldo inteiro (o em dólar, em reais pela
  // cotação do dia); em USDC, só a parte de quem pagou em USDC (a de cartão
  // pode ser contestada: lib/indicacao/server.ts). O Stripe aparece quando o
  // cartão está liberado para todos (admin incluído, que aqui vê o mesmo que os
  // usuários: lib/em-teste.ts) ou para quem já tem saldo em reais. O USDC,
  // quando há rede de saque ligada no servidor.
  const stripeLiberado =
    recursos.stripe && liberadoNaTela("stripe", { emTeste: conta?.emTeste });
  const redesUsdc = resumo?.usdc.redes ?? [];
  const comStripe = resumo
    ? resumo.stripe.configurado &&
      (stripeLiberado || resumo.saldos.some((s) => s.moeda === "BRL"))
    : stripeLiberado;
  const comUsdc = resumo ? redesUsdc.length > 0 : recursos.usdc;
  const formasDoSaldo = (s: SaldoIndicacao): FormaDeSaque[] =>
    s.moeda === "BRL"
      ? comStripe
        ? ["stripe"]
        : []
      : [
          ...(comStripe ? (["stripe"] as const) : []),
          ...(comUsdc && s.porUsdc > 0 ? (["usdc"] as const) : []),
        ];
  const nomeDaRede = (r: string) =>
    REDES_USDC.find((x) => x.id === r)?.nome ?? r;
  const comoReceber =
    comStripe && comUsdc
      ? tx(
          "O saque é feito pelo Stripe, direto para o seu banco. A comissão de quem pagou em USDC também pode sair em USDC, para a sua carteira.",
        )
      : comStripe
        ? tx("O saque é feito pelo Stripe, direto para o seu banco.")
        : comUsdc
          ? tx("A comissão de quem pagou em USDC sai em USDC, direto para a sua carteira.")
          : "";

  async function copiarLink() {
    if (!resumo) return;
    try {
      await navigator.clipboard.writeText(resumo.link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {}
  }

  // Cada leva nova se soma às que já estão pagando (todas dentro dos 12 meses).
  const porMes = Array.from(
    { length: 12 },
    (_, i) => (i + 1) * simN * simValor * COMISSAO,
  );
  const totalSim = porMes.reduce((a, b) => a + b, 0);
  const passos: Array<[typeof UserRound, string, string]> = [
    [
      UserRound,
      tx("Pegue seu link"),
      tx(
        "Toda conta já tem um link de indicação. Não precisa de inscrição: ele está no seu painel, logo abaixo.",
      ),
    ],
    [
      Link2,
      tx("Compartilhe seu link"),
      tx(
        "Coloque na bio, na descrição dos vídeos, nos posts dos seus personagens, na newsletter ou no curso.",
      ),
    ],
    [
      Coins,
      tx("Ganhe comissão"),
      `${tx("Cada assinatura que vier do seu link gera")} ${pct}% ${tx("de comissão, e ela se repete nas renovações por até")} ${MESES_COMISSAO} ${tx("meses.")}`,
    ],
  ];
  const vantagens: Array<[typeof UserRound, string, string]> = [
    [
      Coins,
      tx("Comissão em dinheiro"),
      tx(
        "Você recebe em dinheiro, não em créditos da plataforma que precisam ser gastos aqui dentro.",
      ),
    ],
    [
      Eye,
      tx("Indicações rastreadas"),
      tx(
        "Veja quem criou conta pelo seu link e quem assinou, para saber o que está funcionando.",
      ),
    ],
    [
      Wallet,
      tx("Saque quando quiser"),
      comStripe && comUsdc
        ? tx(
            "Pelo Stripe, direto para o seu banco. O que veio de pagamento em USDC também pode sair em USDC, na rede que você preferir.",
          )
        : comStripe
          ? tx("Pelo Stripe, direto para o seu banco.")
          : tx("Em USDC, direto para a sua carteira, na rede que você preferir."),
    ],
    [
      Link2,
      tx("Seu código, seu nome"),
      tx(
        "Troque o código do link por um que tenha a sua cara. Dá para escolher uma vez.",
      ),
    ],
  ];
  const termos: Array<[string, string]> = [
    [`${pct}%`, tx("de comissão em cada assinatura")],
    [String(MESES_COMISSAO), tx("meses de comissão recorrente por indicado")],
    [
      String(CARENCIA_CARTAO_DIAS),
      `${tx("dias depois do pagamento no cartão para a comissão liberar para saque (em USDC,")} ${CARENCIA_DIAS})`,
    ],
  ];
  const duvidas: Array<[string, string]> = [
    [
      tx("Quem pode participar?"),
      tx(
        "Qualquer pessoa com conta na NIDO. O link já vem pronto; não há inscrição nem aprovação.",
      ),
    ],
    [
      tx("Quanto eu ganho?"),
      `${pct}% ${tx("de cada assinatura de plano paga por quem criou a conta pelo seu link, incluindo as renovações.")}`,
    ],
    [
      tx("O que gera comissão?"),
      comStripe
        ? tx(
            "Assinaturas de qualquer plano, mensais ou anuais, e as renovações, no cartão ou em USDC. Compra de créditos avulsos e o plano gratuito não geram comissão.",
          )
        : tx(
            "Assinaturas de qualquer plano, mensais ou anuais, e as renovações. Compra de créditos avulsos e o plano gratuito não geram comissão.",
          ),
    ],
    [
      tx("Por quanto tempo uma indicação me paga?"),
      `${tx("Por até")} ${MESES_COMISSAO} ${tx("meses a partir da primeira assinatura, enquanto a pessoa continuar pagando.")}`,
    ],
    [
      tx("Quando posso sacar?"),
      `${tx("A comissão de pagamento no cartão fica em carência por")} ${CARENCIA_CARTAO_DIAS} ${tx("dias; a de pagamento em USDC, por")} ${CARENCIA_DIAS}. ${tx("A carência cobre reembolsos e contestações do pagamento. Depois disso a comissão fica disponível, respeitando o saque mínimo.")}`,
    ],
    ...(comStripe || comUsdc
      ? ([
          [
            tx("Como eu recebo?"),
            comStripe && comUsdc
              ? tx(
                  "Pelo Stripe, que transfere em reais, pela cotação do dia, para a sua conta de recebimento e repassa para o seu banco. A comissão de quem pagou em USDC também pode sair em USDC, para a sua carteira, na rede que você preferir; a de quem pagou no cartão sai só pelo Stripe.",
                )
              : comStripe
                ? tx(
                    "Pelo Stripe: a comissão vai em reais, pela cotação do dia, para a sua conta de recebimento no Stripe, que repassa para o seu banco.",
                  )
                : tx(
                    "A comissão de quem pagou em USDC sai em USDC, para a sua carteira, na rede que você escolher. Você informa o endereço na hora de sacar.",
                  ),
          ],
        ] as Array<[string, string]>)
      : []),
    [
      tx("E se o indicado pedir reembolso?"),
      tx(
        "Se o pagamento for estornado, a comissão é desfeita. Se você já tinha sacado, o valor é descontado das próximas comissões.",
      ),
    ],
    [
      tx("Posso indicar a mim mesmo?"),
      tx(
        "Não. Uma segunda conta sua, ou alguém na mesma rede de internet que você, não fica vinculada ao seu link.",
      ),
    ],
  ];
  const tituloSecao =
    "font-archivo text-[clamp(22px,7.4vw,28px)] sm:text-[clamp(28px,3.6vw,46px)] font-black uppercase leading-[0.95] tracking-[-0.02em] [font-stretch:125%]";
  const olho =
    "font-mono text-[11px] uppercase tracking-[0.18em] text-accent";

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-[clamp(44px,6vw,76px)] px-4 pb-16 pt-2 sm:px-6 lg:px-10">
      <section className="relative flex min-h-[clamp(440px,52vw,620px)] items-end overflow-hidden rounded-3xl border border-white/[0.07] bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/banner/afiliados-hero.jpg"
          alt={tx("Personagens da NIDO")}
          className="absolute inset-0 h-full w-full object-cover object-[62%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_top,#0b0a0a_4%,rgba(11,10,10,0.88)_30%,rgba(11,10,10,0.25)_62%,rgba(11,10,10,0)_80%)]" />
        <div className="relative flex max-w-[760px] flex-col gap-4 p-[clamp(24px,4vw,48px)]">
          <span className="flex h-[26px] items-center gap-2 self-start rounded-full border border-accent/40 bg-bg/80 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
            <Gift className="h-[13px] w-[13px]" />
            {tx("Indique e ganhe")}
          </span>
          <h1 className="text-balance font-archivo text-[clamp(38px,5.6vw,76px)] font-black uppercase leading-[0.9] tracking-[-0.02em] [font-stretch:125%]">
            {tx("Indique a NIDO AI STUDIO.")}
            <br />
            <span className="text-accent">
              {tx("Ganhe")} {pct}% {tx("todo mês.")}
            </span>
          </h1>
          <p className="max-w-[560px] text-pretty text-base leading-[1.55] text-[#d9d2c6]">
            {tx("Ganhe")} {pct}%{" "}
            {tx("de comissão, em dinheiro, por até")} {MESES_COMISSAO}{" "}
            {tx("meses em cada assinatura que vier do seu link.")}{" "}
            {comoReceber}
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1.5">
            {user === undefined ? (
              <Link
                href="/auth/login"
                className="flex h-[50px] items-center gap-2.5 whitespace-nowrap rounded-full bg-accent px-6 text-[15px] font-bold text-bg transition hover:bg-nido-yellow-hi"
              >
                {tx("Entrar para pegar meu link")}
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={copiarLink}
                disabled={!resumo}
                className="flex h-[50px] items-center gap-2.5 whitespace-nowrap rounded-full bg-accent px-6 text-[15px] font-bold text-bg transition hover:bg-nido-yellow-hi disabled:opacity-60"
              >
                {copiado ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copiado ? tx("Link copiado") : tx("Copiar meu link")}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Painel de quem indica: link, comissões, indicados e saques */}
      {/* grid-cols-1 (minmax(0,1fr)): sem ele, o link comprido — que não quebra — alarga a coluna além da tela. */}
      <section className="grid grid-cols-1 gap-6">
        <div className="flex max-w-[640px] flex-col gap-3">
          <span className={olho}>{tx("Seu painel")}</span>
          <h2 className={tituloSecao}>{tx("Seu link e seus ganhos")}</h2>
        </div>
        {user === undefined ? (
          <div className="card p-8 text-center text-ink-mute">
            <Link href="/auth/login" className="font-bold text-accent">
              {tx("Entre na sua conta")}
            </Link>{" "}
            {tx("para indicar amigos e ganhar comissão.")}
          </div>
        ) : null}

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

      {user === undefined ? null : !resumo ? (
        erroCarga ? null : (
          <div className="py-16 grid place-items-center text-ink-dim">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )
      ) : (
        <>
          {/* Link e código */}
          <section className="card p-5 sm:p-6 grid grid-cols-1 gap-4">
            <div className="label-cap">{tx("Seu link de indicação")}</div>
            <div className="flex flex-wrap items-center gap-2">
              {/* basis de 220px: no celular o botão desce para a linha de baixo, em vez de espremer o link. */}
              <code className="mono flex-1 basis-[220px] min-w-0 truncate rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[13.5px] text-ink">
                {resumo.link}
              </code>
              <Button
                variant="accent"
                onClick={copiarLink}
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
          <section className="card p-5 sm:p-6 grid grid-cols-1 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="label-cap">{tx("Comissões")}</div>
              {comStripe && resumo.stripe.conectado ? (
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
                {resumo.saldos.map((s) => {
                  const chave = `sacar-${s.moeda}`;
                  const opcoes = formasDoSaldo(s);
                  // Sem escolha ainda: o Stripe se a conta já está pronta; senão, o
                  // USDC (que saca sem cadastro); sem USDC, o Stripe.
                  const escolhida = formas[s.moeda];
                  const forma: FormaDeSaque | undefined =
                    escolhida && opcoes.includes(escolhida)
                      ? escolhida
                      : opcoes.includes("stripe") && resumo.stripe.pronto
                        ? "stripe"
                        : opcoes.includes("usdc")
                          ? "usdc"
                          : opcoes[0];
                  const rede =
                    redeSaque && redesUsdc.includes(redeSaque)
                      ? redeSaque
                      : (redesUsdc[0] ?? null);
                  const podeSacar =
                    forma === "stripe"
                      ? resumo.stripe.pronto
                      : forma === "usdc" && !!rede && !!carteiras[rede]?.trim();
                  // O que sai por este caminho: em USDC, só o que veio de USDC.
                  const valorDoCaminho =
                    forma === "usdc" ? s.porUsdc : s.disponivel;
                  return (
                    <div
                      key={chave}
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
                      {!forma ? (
                        <div className="text-[12px] text-ink-dim">
                          {tx(
                            "O saque deste saldo ainda não está disponível. O saldo fica guardado.",
                          )}
                        </div>
                      ) : (
                        <>
                          {opcoes.length > 1 ? (
                            <Pilulas
                              rotulo={tx("Como receber")}
                              valor={forma}
                              onChange={(f) =>
                                setFormas((v) => ({ ...v, [s.moeda]: f }))
                              }
                              opcoes={[
                                { id: "stripe", rotulo: tx("Stripe (banco)") },
                                { id: "usdc", rotulo: tx("USDC (carteira)") },
                              ]}
                            />
                          ) : null}
                          {forma === "stripe" && !resumo.stripe.pronto ? (
                            <div className="text-[12px] text-ink-dim">
                              {tx(
                                "Para sacar pelo Stripe, conecte sua conta de recebimento logo abaixo.",
                              )}
                            </div>
                          ) : forma === "stripe" && s.moeda === "USD" ? (
                            <div className="text-[12px] text-ink-dim">
                              {tx("Sai em reais, pela cotação do dia.")}
                            </div>
                          ) : null}
                          {forma === "usdc" && s.porUsdc < s.disponivel ? (
                            <div className="text-[12px] text-ink-dim">
                              {tx("Em USDC")}:{" "}
                              <span className="text-ink">
                                {dinheiro(s.porUsdc, s.moeda)}
                              </span>
                              .{" "}
                              {tx(
                                "A comissão de quem pagou no cartão sai só pelo Stripe.",
                              )}
                            </div>
                          ) : null}
                          {forma === "usdc" && rede ? (
                            <div className="grid gap-2">
                              {redesUsdc.length > 1 ? (
                                <Pilulas
                                  rotulo={tx("Rede")}
                                  valor={rede}
                                  onChange={setRedeSaque}
                                  opcoes={redesUsdc.map((r) => ({
                                    id: r,
                                    rotulo: nomeDaRede(r),
                                  }))}
                                />
                              ) : (
                                <div className="text-[12px] text-ink-dim">
                                  {tx("Rede")}: {nomeDaRede(rede)}
                                </div>
                              )}
                              <Input
                                value={carteiras[rede] ?? ""}
                                onChange={(e) =>
                                  setCarteiras((c) => ({
                                    ...c,
                                    [rede]: e.target.value,
                                  }))
                                }
                                placeholder={
                                  rede === "solana"
                                    ? tx("Endereço da sua carteira Solana")
                                    : tx("Endereço da sua carteira (0x…)")
                                }
                                spellCheck={false}
                                autoComplete="off"
                                className="mono text-[13px]"
                              />
                            </div>
                          ) : null}
                          <Button
                            variant="accent"
                            onClick={() => sacar(s, forma, rede)}
                            disabled={
                              valorDoCaminho < s.minimo ||
                              !podeSacar ||
                              ocupado === chave
                            }
                          >
                            {ocupado === chave ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : null}
                            {forma === "usdc"
                              ? tx("Sacar em USDC")
                              : tx("Sacar pelo Stripe")}
                          </Button>
                        </>
                      )}
                      {s.disponivel < 0 ? (
                        <div className="text-[12px] text-pink">
                          {tx(
                            "Uma comissão já sacada foi estornada. O valor será descontado das próximas.",
                          )}
                        </div>
                      ) : valorDoCaminho < s.minimo ? (
                        <div className="text-[12px] text-ink-dim">
                          {tx("Saque mínimo")}: {dinheiro(s.minimo, s.moeda)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[12.5px] text-ink-dim leading-relaxed">
              {tx("A comissão libera para saque")} {CARENCIA_CARTAO_DIAS}{" "}
              {tx("dias depois do pagamento no cartão, ou")} {CARENCIA_DIAS}{" "}
              {tx(
                "dias depois do pagamento em USDC. Se o pagamento for estornado, a comissão é desfeita.",
              )}
            </p>

            {/* Formas de saque: a conta do Stripe se prepara antes; o endereço USDC vai na hora. */}
            {comStripe ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg px-4 py-3">
                <Landmark className="w-4 h-4 text-accent shrink-0" />
                <span className="flex-1 basis-[180px] min-w-0 text-[13px] text-ink-mute">
                  {resumo.stripe.pronto
                    ? tx(
                        "Stripe: sua conta de recebimento está pronta. O saque vai para ela em reais, e o Stripe repassa para o seu banco.",
                      )
                    : resumo.stripe.conectado
                      ? tx(
                          "Falta terminar o cadastro da sua conta de recebimento no Stripe.",
                        )
                      : tx(
                          "Para sacar pelo Stripe, cadastre sua conta de recebimento (dados pessoais e conta bancária).",
                        )}
                </span>
                {resumo.stripe.pronto ? (
                  <Check className="w-4 h-4 text-ok shrink-0" />
                ) : (
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
                )}
              </div>
            ) : null}
            {comUsdc ? (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-bg px-4 py-3">
                <Wallet className="w-4 h-4 text-accent shrink-0" />
                <span className="min-w-0 text-[13px] text-ink-mute">
                  {tx("USDC: para a sua carteira, na rede que você escolher")} (
                  {redesUsdc.map(nomeDaRede).join(", ")}).{" "}
                  {tx(
                    "Vale para as comissões de quem pagou em USDC. Você informa o endereço na hora de sacar.",
                  )}
                </span>
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
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-5 sm:px-6 py-3"
                >
                  <span className="mono text-[12px] text-ink-dim">
                    {dia(s.quando)}
                  </span>
                  <span className="mono text-[13px] font-semibold text-ink">
                    {dinheiro(s.valor, s.moeda)}
                    {s.pago
                      ? ` → ${dinheiro(s.pago.valor, s.pago.moeda)}`
                      : null}
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
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex max-w-[640px] flex-col gap-3">
          <span className={olho}>{tx("Como funciona")}</span>
          <h2 className={tituloSecao}>{tx("3 passos para começar a ganhar")}</h2>
          <p className="text-[14.5px] leading-[1.55] text-ink-mute">
            {tx("Seu link já está ativo: é só compartilhar.")}
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
          {passos.map(([Icone, titulo, texto], i) => (
            <div key={titulo} className="card flex flex-col gap-3.5 p-6">
              <div className="flex items-center justify-between">
                <span className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-accent/10 text-accent">
                  <Icone className="h-[18px] w-[18px]" />
                </span>
                <span className="font-mono text-xs text-ink-dim">
                  0{i + 1}
                </span>
              </div>
              <span className="text-[16.5px] font-bold">{titulo}</span>
              <span className="text-[13.5px] leading-[1.55] text-ink-mute">
                {texto}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex max-w-[680px] flex-col gap-3">
          <span className={olho}>{tx("Simulador")}</span>
          <h2 className={tituloSecao}>{tx("Quanto você pode ganhar")}</h2>
          <p className="text-pretty text-[14.5px] leading-[1.55] text-ink-mute">
            {tx(
              "Cada nova indicação se soma às que já estão pagando, então a comissão cresce mês a mês. Ajuste os valores para estimar os primeiros 12 meses.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-3">
          <div className="flex flex-col gap-3">
            <div className="card flex flex-col">
              <label className="flex flex-col gap-3 p-[22px]">
                <span className="text-[13px] text-ink-mute">
                  {tx("Novas indicações por mês")}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold">
                    {simN} {tx("indicações")}
                  </span>
                  <span className="text-lg text-ink-dim">/ {tx("mês")}</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={simN}
                  onChange={(e) => setSimN(Number(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-3 border-t border-white/[0.07] p-[22px]">
                <span className="text-[13px] text-ink-mute">
                  {tx("Gasto médio por indicado por mês")}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold">
                    {dinheiro(simValor, moedaSim)}
                  </span>
                  <span className="text-lg text-ink-dim">
                    / {tx("indicado")}
                  </span>
                </span>
                <input
                  type="range"
                  min={precos[0]}
                  max={precos[2]}
                  value={simValor}
                  onChange={(e) => setSimValor(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-accent p-[22px] text-bg">
              <span className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">
                  {tx("Comissão estimada em 12 meses")}
                </span>
                <span className="font-archivo text-[clamp(30px,3.2vw,40px)] font-black leading-none [font-stretch:112%]">
                  {dinheiro(totalSim, moedaSim)}
                </span>
              </span>
            </div>
          </div>
          <div className="card flex min-h-[340px] flex-col gap-3 p-[22px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ink-mute">
                {tx("Comissão por mês")}
              </span>
              <span className="font-mono text-xs text-accent">
                {dinheiro(porMes[11], moedaSim)} {tx("no 12º mês")}
              </span>
            </div>
            <div className="grid min-h-[220px] flex-1 grid-cols-12 items-end gap-1.5 border-b border-white/10 bg-[repeating-linear-gradient(to_top,rgba(255,255,255,0.05)_0_1px,transparent_1px_25%)] pt-2">
              {porMes.map((v, i) => (
                <div
                  key={i}
                  title={`${tx("Mês")} ${i + 1}: ${dinheiro(v, moedaSim)}`}
                  className="min-h-[3px] rounded-t bg-[linear-gradient(to_top,#aa7d43,#fdf327)]"
                  style={{
                    height: `${((i + 1) / 12) * 100}%`,
                    opacity: 0.45 + (i / 11) * 0.55,
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-12 gap-1.5">
              {porMes.map((_, i) => (
                <span
                  key={i}
                  className="text-center font-mono text-[10.5px] text-ink-dim"
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </div>
        </div>
        <span className="text-[12.5px] text-ink-dim">
          {tx("Estimativa com comissão de")} {pct}%.{" "}
          {tx(
            "O valor real depende de renovações, cancelamentos e reembolsos.",
          )}
        </span>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex max-w-[680px] flex-col gap-3">
          <span className={olho}>{tx("Vantagens")}</span>
          <h2 className={tituloSecao}>{tx("Vai além da comissão")}</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-3">
          {vantagens.map(([Icone, titulo, texto]) => (
            <div key={titulo} className="card flex flex-col gap-3.5 p-6">
              <span className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-accent/10 text-accent">
                <Icone className="h-[18px] w-[18px]" />
              </span>
              <span className="text-base font-bold">{titulo}</span>
              <span className="text-[13.5px] leading-[1.55] text-ink-mute">
                {texto}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex max-w-[680px] flex-col gap-3">
          <span className={olho}>{tx("Modelo de comissão")}</span>
          <h2 className={tituloSecao}>
            {tx("O que você ganha por compartilhar um link")}
          </h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-0.5 overflow-hidden rounded-[20px] bg-white/[0.07]">
          {termos.map(([valor, rotulo]) => (
            <div
              key={rotulo}
              className="flex flex-col gap-3 bg-[#0e0c0d] p-[clamp(24px,3vw,40px)]"
            >
              <span className="font-archivo text-[clamp(56px,7vw,96px)] font-black leading-[0.9] tracking-[-0.03em] text-accent [font-stretch:125%]">
                {valor}
              </span>
              <span className="max-w-[260px] text-[15px] font-semibold leading-[1.4]">
                {rotulo}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex max-w-[880px] flex-col gap-5">
        <h2 className={tituloSecao}>{tx("Ficou alguma dúvida?")}</h2>
        <div className="flex flex-col">
          {duvidas.map(([pergunta, resposta], i) => (
            <div key={pergunta} className="border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setDuvida(duvida === i ? -1 : i)}
                aria-expanded={duvida === i}
                className="flex w-full items-center justify-between gap-4 py-[18px] text-left text-[15.5px] font-semibold transition hover:text-accent"
              >
                <span>{pergunta}</span>
                {duvida === i ? (
                  <ChevronUp className="h-[18px] w-[18px] shrink-0 text-ink-mute" />
                ) : (
                  <ChevronDown className="h-[18px] w-[18px] shrink-0 text-ink-mute" />
                )}
              </button>
              {duvida === i ? (
                <p className="max-w-[720px] pb-5 text-sm leading-[1.6] text-ink-mute">
                  {resposta}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/** Escolha em pílulas (forma de saque, rede). */
function Pilulas<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
}: {
  opcoes: Array<{ id: T; rotulo: string }>;
  valor: T;
  onChange: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="flex w-fit max-w-full flex-wrap gap-1 justify-self-start rounded-full border border-line bg-panel p-1"
    >
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-7 rounded-full px-3 text-[12px] font-semibold transition",
            valor === o.id
              ? "bg-accent/15 text-accent"
              : "text-ink-mute hover:text-ink",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
