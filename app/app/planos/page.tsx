"use client";

import { liberadoNaTela } from "@/lib/em-teste";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  HardDrive,
  Loader2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { useRecursos } from "@/components/RecursosProvider";
import { Button } from "@/components/ui/Button";
import { copyToClipboard } from "@/lib/export";
import { cn } from "@/lib/cn";
import {
  AVULSO_MAX,
  AVULSO_MIN,
  BONUS_USDC,
  CREDITOS_CORTAR_VIDEO,
  CREDITOS_LEGENDA,
  CREDITOS_POST_POR_REDE,
  CREDITOS_FIGURINHA,
  CREDITOS_TEXTO,
  creditosCriarVideo,
  FALADO_POR_SEGUNDO_MODELO,
  DESCONTO_ANUAL,
  PACOTES,
  PLANOS,
  PLANOS_PAGOS,
  pacoteMaisBarato,
  precoAvulso,
  PRECO_CREDITO,
  precoPlano,
  creditosRadar,
  TROCA_POR_SEGUNDO,
  TROCA_POR_SEGUNDO_QUALIDADE,
  TROCA_PREMIUM_POR_SEGUNDO,
  type Intervalo,
  type PacoteId,
  type PlanoPago,
} from "@/lib/planos";
import { recursosDoPlano } from "@/lib/planos-recursos";
import { tx } from "@/lib/i18n/tx";
import {
  dinheiro as dinheiroNaMoeda,
  localeAtual,
  moedaAtual,
  naMoeda,
} from "@/lib/moeda";
import { REDES_USDC, type RedeUsdc } from "@/lib/pagamentos/redes-usdc";
import {
  acompanharPagamento,
  aguardandoRede,
  useEnviado,
  useOutroEnviado,
} from "@/lib/pagamentos/enviados";
import type { TransferenciaEvm } from "@/lib/pagamentos/evm";
import {
  erroDaCarteira,
  IconeDaCarteira,
} from "@/components/carteira/CarteiraNaBarra";
import {
  conectarCarteira,
  desconectarCarteira,
  useCarteiras,
} from "@/lib/carteira";
import { enviarTransacaoEvm } from "@/lib/carteira/evm";
import { enviarTransacaoSolana } from "@/lib/carteira/solana";
import { CarteiraError } from "@/lib/nft/carteira-navegador";
import { abreviarEndereco } from "@/lib/nft/comum";
import { txErro } from "@/lib/i18n/erros";

type Compra =
  | { tipo: "plano"; plano: PlanoPago; intervalo: Intervalo }
  | { tipo: "pacote"; pacote: PacoteId }
  | { tipo: "avulso"; creditos: number };

/**
 * Os preços aparecem (e o cartão cobra) na moeda escolhida pelo usuário
 * (lib/moeda.ts); o idioma decide só a escrita dos números.
 */
const dinheiro = (v: number) => dinheiroNaMoeda(v, { casas: 0 });
const dinheiroCentavos = (v: number) => dinheiroNaMoeda(v);
const num = (v: number, casas = 0) =>
  v.toLocaleString(localeAtual(), {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(localeAtual()) : "—";
/** O Stripe cobra em reais (o servidor converte o preço em dólar): dá cartão, Pix e boleto. */
const rotuloCartao = () => tx("Cartão, Pix ou boleto");
const precoPacote = (id: PacoteId) =>
  naMoeda({ BRL: PACOTES[id].precoBRL, USD: PACOTES[id].precoUSD });

export default function PlanosPage() {
  return (
    <main className="min-h-screen">
      <Suspense fallback={null}>
        <Conteudo />
      </Suspense>
    </main>
  );
}

function Conteudo() {
  const recursos = useRecursos();
  const { user } = useAuth();
  const { conta, recarregar } = useCreditos();
  // Stripe em teste: por enquanto só as contas admin compram por ele (lib/em-teste.ts).
  const stripeLigado = recursos.stripe && liberadoNaTela("stripe", conta);
  const params = useSearchParams();
  const [intervalo, setIntervalo] = useState<Intervalo>("mensal");
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [usdc, setUsdc] = useState<{ compra: Compra; titulo: string } | null>(
    null,
  );
  const retorno = params?.get("pagamento");

  useEffect(() => {
    if (retorno === "sucesso") {
      recarregar();
      // Pix/cartão confirmam em segundos; o webhook pode chegar um pouco depois.
      const t = setTimeout(recarregar, 4000);
      return () => clearTimeout(t);
    }
  }, [retorno, recarregar]);

  if (!recursos.login) {
    return (
      <Aviso>
        {tx("Planos e créditos exigem login configurado neste deploy.")}
      </Aviso>
    );
  }
  if (user === undefined) {
    return (
      <Aviso>
        <Link
          href="/auth/login"
          className="text-accent font-semibold hover:underline"
        >
          {tx("Entre na sua conta")}
        </Link>{" "}
        {tx("para ver seu plano e comprar créditos.")}
      </Aviso>
    );
  }

  async function pagarStripe(compra: Compra, chave: string) {
    setErro(null);
    setAbrindo(chave);
    try {
      const res = await fetch("/api/pagamentos/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...compra, moeda: "BRL" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.url)
        throw new Error(txErro(body.error ?? "Não consegui abrir o pagamento."));
      window.location.href = body.url;
    } catch (e) {
      setErro((e as Error).message);
      setAbrindo(null);
    }
  }

  async function gerenciar() {
    setErro(null);
    setAbrindo("portal");
    try {
      const res = await fetch("/api/pagamentos/stripe/portal", {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.url)
        throw new Error(txErro(body.error ?? "Não consegui abrir o portal."));
      window.location.href = body.url;
    } catch (e) {
      setErro((e as Error).message);
      setAbrindo(null);
    }
  }

  const semPagamento = !stripeLigado && !recursos.usdc;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-10">
      <header>
        <div className="eyebrow-accent mb-2 inline-flex items-center gap-1.5">
          <Zap className="w-3 h-3" /> {tx("Planos e créditos")}
        </div>
        <h1 className="display text-3xl sm:text-4xl text-ink uppercase leading-tight">
          {tx("Crie mais, pague pelo que usa")}
        </h1>
        <p className="text-ink-mute mt-2 max-w-2xl">
          {tx(
            "Toda geração com IA gasta créditos — o custo aparece antes de você gerar. Se a geração falhar, os créditos voltam na hora.",
          )}
        </p>
      </header>

      {retorno === "sucesso" && (
        <Banner tom="ok">
          {tx(
            "Pagamento recebido. Seus créditos aparecem em instantes — no boleto, depois da compensação (1 a 3 dias úteis).",
          )}
        </Banner>
      )}
      {retorno === "cancelado" && (
        <Banner>{tx("Pagamento cancelado. Nada foi cobrado.")}</Banner>
      )}
      {erro && <Banner tom="erro">{erro}</Banner>}
      {semPagamento && (
        <Banner>
          {tx("Os pagamentos ainda não estão configurados neste deploy.")}
        </Banner>
      )}

      {conta && (
        <section className="card p-5 grid sm:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="text-[11px] mono uppercase tracking-wider text-ink-dim">
              {tx("Seu plano")}
            </div>
            <div className="text-xl font-bold text-ink">
              {PLANOS[conta.plano].nome}
              {conta.intervalo ? (
                <span className="text-ink-dim font-normal text-sm">
                  {" "}
                  · {conta.intervalo}
                </span>
              ) : null}
            </div>
            <div className="text-sm text-ink-mute mt-1">
              <strong className="text-ink">
                {num(conta.total)} {tx("créditos")}
              </strong>{" "}
              ({num(conta.creditosPlano)} {tx("do plano +")}{" "}
              {num(conta.creditosAvulsos)} {tx("avulsos)")}
              {conta.plano !== "gratis" && (
                <>
                  {" "}
                  {tx("· próxima recarga")} {data(conta.proximaRecargaEm)} ·{" "}
                  {conta.assinaturaAtiva ? "renova" : tx("vale até")}{" "}
                  {data(conta.planoExpiraEm)}
                </>
              )}
            </div>
            <div className="text-[12px] text-ink-dim mt-1">
              {conta.personagens} de {PLANOS[conta.plano].personagens}{" "}
              personagens
              {conta.creditosAvulsos > 0 &&
                ` · avulsos valem até ${data(conta.avulsosExpiraEm)}`}
            </div>
            <Armazenamento
              usado={conta.armazenamento.usadoBytes}
              cota={conta.armazenamento.cotaBytes}
            />
          </div>
          {stripeLigado && conta.plano !== "gratis" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={gerenciar}
              disabled={abrindo === "portal"}
            >
              {abrindo === "portal" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CreditCard className="w-3.5 h-3.5" />
              )}
              {tx("Gerenciar assinatura")}
            </Button>
          )}
        </section>
      )}

      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="display text-xl uppercase text-ink">{tx("Planos")}</h2>
          <div className="flex gap-1 border border-line rounded-full p-1 bg-panel">
            {(["mensal", "anual"] as const).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIntervalo(i)}
                className={cn(
                  "px-4 h-8 rounded-full text-[12px] font-bold uppercase tracking-wider mono transition",
                  intervalo === i
                    ? "bg-accent text-bg"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                {i === "mensal"
                  ? tx("Mensal")
                  : `${tx("Anual")} −${Math.round(DESCONTO_ANUAL * 100)}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {PLANOS_PAGOS.map((id) => {
            const p = PLANOS[id];
            const atual = conta?.plano === id;
            const total = precoPlano(id, intervalo, moedaAtual());
            const mensalEquiv = intervalo === "anual" ? total / 12 : total;
            const compra: Compra = { tipo: "plano", plano: id, intervalo };
            return (
              <article
                key={id}
                className={cn(
                  "card p-5 flex flex-col gap-4",
                  id === "creator" && "border-accent/60 shadow-glow",
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-ink">{p.nome}</h3>
                    {id === "creator" && (
                      <span className="label-cap !text-accent">
                        {tx("Mais escolhido")}
                      </span>
                    )}
                    {atual && (
                      <span className="label-cap !text-ok">
                        {tx("Seu plano")}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-ink-mute">{tx(p.descricao)}</p>
                </div>
                <div>
                  <div className="text-3xl font-bold text-ink">
                    {dinheiro(mensalEquiv)}
                    <span className="text-sm font-normal text-ink-dim">
                      {tx("/mês")}
                    </span>
                  </div>
                  <div className="text-[12px] text-ink-dim">
                    {intervalo === "anual"
                      ? `${dinheiro(total)} ${tx("à vista por 12 meses")}`
                      : tx("cobrado todo mês no cartão")}
                    {recursos.usdc &&
                      (moedaAtual() === "USD"
                        ? ` · ${tx("mesmo valor em USDC")}`
                        : ` · ${tx("ou")} ${num(precoPlano(id, intervalo, "USD"))} USDC`)}
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-bg px-3.5 py-3">
                  <div className="font-bold text-ink inline-flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-accent" /> {num(p.creditos)}{" "}
                    {tx("créditos/mês")}
                  </div>
                  <div className="text-[12px] text-ink-mute mt-1 leading-relaxed">
                    ≈ {num(Math.floor(p.creditos / 5))} {tx("imagens · ou")}{" "}
                    {num(Math.floor(p.creditos / 10))}{" "}
                    {tx("Nano Banana Pro · ou")}{" "}
                    {num(Math.floor(p.creditos / TROCA_POR_SEGUNDO))}
                    {tx("s de troca de pessoa em vídeo")}
                  </div>
                </div>
                <ul className="grid gap-1.5 text-[13px] text-ink-mute flex-1">
                  {recursosDoPlano(id).map((r) => (
                    <li key={r} className="flex gap-2">
                      <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />{" "}
                      {r}
                    </li>
                  ))}
                </ul>
                <div className="grid gap-2">
                  {stripeLigado && (
                    <Button
                      variant={id === "creator" ? "accent" : "primary"}
                      onClick={() => pagarStripe(compra, `${id}-stripe`)}
                      disabled={!!abrindo}
                    >
                      {abrindo === `${id}-stripe` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      {intervalo === "mensal"
                        ? tx("Assinar com cartão")
                        : rotuloCartao()}
                    </Button>
                  )}
                  {recursos.usdc && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setUsdc({
                          compra,
                          titulo: `${tx("Plano")} ${p.nome} (${tx(intervalo === "mensal" ? "Mensal" : "Anual").toLowerCase()})`,
                        })
                      }
                      disabled={!!abrindo}
                    >
                      <Wallet className="w-4 h-4" /> {tx("Pagar com USDC · +")}
                      {Math.round(BONUS_USDC * 100)}
                      {tx("% créditos")}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {intervalo === "mensal" && recursos.usdc && (
          <p className="text-[12px] text-ink-dim mt-3">
            {tx(
              "Em USDC o plano mensal é pré-pago: vale 1 mês e não renova sozinho.",
            )}
          </p>
        )}
      </section>

      <section>
        <h2 className="display text-xl uppercase text-ink mb-1">
          {tx("Pacotes de créditos")}
        </h2>
        <p className="text-[13px] text-ink-mute mb-4">
          {tx(
            "Pra quando o plano acabar no meio do mês. Valem 12 meses e são usados depois dos créditos do plano.",
          )}
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          {(Object.keys(PACOTES) as PacoteId[]).map((id) => {
            const pk = PACOTES[id];
            const compra: Compra = { tipo: "pacote", pacote: id };
            return (
              <article key={id} className="card p-5 grid gap-3">
                <div className="font-bold text-ink text-lg inline-flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-accent" /> {num(pk.creditos)}{" "}
                  {tx("créditos")}
                </div>
                <div className="text-2xl font-bold text-ink">
                  {dinheiro(precoPacote(id))}
                  {recursos.usdc && moedaAtual() === "BRL" && (
                    <span className="text-[12px] font-normal text-ink-dim">
                      {" "}
                      · {tx("ou")} {num(pk.precoUSD)} USDC
                    </span>
                  )}
                </div>
                {stripeLigado && (
                  <Button
                    size="sm"
                    onClick={() => pagarStripe(compra, `${id}-stripe`)}
                    disabled={!!abrindo}
                  >
                    {abrindo === `${id}-stripe` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CreditCard className="w-3.5 h-3.5" />
                    )}
                    {rotuloCartao()}
                  </Button>
                )}
                {recursos.usdc && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setUsdc({
                        compra,
                        titulo: `${num(pk.creditos)} ${tx("créditos")}`,
                      })
                    }
                    disabled={!!abrindo}
                  >
                    <Wallet className="w-3.5 h-3.5" /> {tx("USDC · +")}
                    {Math.round(BONUS_USDC * 100)}%
                  </Button>
                )}
              </article>
            );
          })}
        </div>
        <CompraManual
          abrindo={abrindo}
          stripe={stripeLigado}
          usdc={recursos.usdc}
          onStripe={(compra) => pagarStripe(compra, "avulso-stripe")}
          onUsdc={(compra) =>
            setUsdc({
              compra,
              titulo: `${num(compra.creditos)} ${tx("créditos")}`,
            })
          }
        />
      </section>

      <TabelaCustos />

      {usdc && (
        <PagamentoUsdc
          compra={usdc.compra}
          titulo={usdc.titulo}
          onClose={() => setUsdc(null)}
        />
      )}
    </div>
  );
}

/** Quantidade livre de créditos (mínimo 100), no preço por crédito do menor pacote. */
function CompraManual(o: {
  abrindo: string | null;
  stripe: boolean;
  usdc: boolean;
  onStripe: (c: { tipo: "avulso"; creditos: number }) => void;
  onUsdc: (c: { tipo: "avulso"; creditos: number }) => void;
}) {
  const [texto, setTexto] = useState("200");
  const n = Number(texto);
  const valido = Number.isInteger(n) && n >= AVULSO_MIN && n <= AVULSO_MAX;
  const compra = { tipo: "avulso" as const, creditos: n };
  const melhor = valido ? pacoteMaisBarato(n) : null;
  return (
    <article className="card p-5 mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <div>
        <div className="font-bold text-ink text-lg inline-flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-accent" /> {tx("Outra quantidade")}
        </div>
        <p className="text-[13px] text-ink-mute mb-3">
          {tx("Escolha quantos créditos quer, a partir de")} {AVULSO_MIN}.{" "}
          {dinheiroCentavos(PRECO_CREDITO[moedaAtual()])} {tx("por crédito")}
          {o.usdc &&
            moedaAtual() === "BRL" &&
            ` (${num(PRECO_CREDITO.USD, 2)} USDC)`}
          {tx("; valem 12 meses como os pacotes.")}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="number"
            inputMode="numeric"
            min={AVULSO_MIN}
            max={AVULSO_MAX}
            step={50}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label={tx("Quantidade de créditos")}
            className="h-11 w-36 rounded-xl border border-line bg-bg px-3.5 text-ink font-bold mono focus:outline-none focus:border-accent"
          />
          <span className="text-ink-mute text-sm">{tx("créditos")}</span>
          {valido && (
            <span className="text-2xl font-bold text-ink">
              {dinheiroCentavos(precoAvulso(n, moedaAtual()))}
              {o.usdc && moedaAtual() === "BRL" && (
                <span className="text-[12px] font-normal text-ink-dim">
                  {" "}
                  · {tx("ou")} {num(precoAvulso(n, "USD"), 2)} USDC
                </span>
              )}
            </span>
          )}
        </div>
        {!valido && texto !== "" && (
          <p className="text-[12px] text-pink mt-2">
            {tx("Mínimo de")} {num(AVULSO_MIN)} {tx("e máximo de")}{" "}
            {num(AVULSO_MAX)} {tx("créditos, sem frações.")}
          </p>
        )}
        {melhor && (
          <p className="text-[12px] text-ink-dim mt-2">
            {tx("Dica: o pacote de")} {num(PACOTES[melhor].creditos)}{" "}
            {tx("créditos sai por")} {dinheiro(precoPacote(melhor))}{" "}
            {tx("— mais créditos pelo mesmo preço ou menos.")}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:min-w-52">
        {o.stripe && (
          <Button
            size="sm"
            onClick={() => o.onStripe(compra)}
            disabled={!valido || !!o.abrindo}
          >
            {o.abrindo === "avulso-stripe" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CreditCard className="w-3.5 h-3.5" />
            )}
            {rotuloCartao()}
          </Button>
        )}
        {o.usdc && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => o.onUsdc(compra)}
            disabled={!valido || !!o.abrindo}
          >
            <Wallet className="w-3.5 h-3.5" /> {tx("USDC · +")}
            {Math.round(BONUS_USDC * 100)}%
          </Button>
        )}
      </div>
    </article>
  );
}

function TabelaCustos() {
  const linhas: Array<[string, string]> = [
    ["Imagem padrão (Nano Banana, Seedream)", "5"],
    ["Imagem Flux.2 Pro", "8"],
    ["GPT Image (média / alta)", "7 / 20"],
    ["Nano Banana Pro", "10"],
    [
      "Trocar pessoa em vídeo · Kling O3 Standard / Pro / 4K (mínimo 3s)",
      `${TROCA_POR_SEGUNDO_QUALIDADE.standard} / ${TROCA_POR_SEGUNDO} / ${TROCA_POR_SEGUNDO_QUALIDADE["4k"]} ${tx("por segundo")}`,
    ],
    [
      "Trocar pessoa · Seedance 2.5 (mínimo 4s)",
      `${TROCA_PREMIUM_POR_SEGUNDO} ${tx("por segundo")}`,
    ],
    ["Criar vídeo · Gen-4 Turbo / Gen-4.5", tx("5 / 12 por segundo")],
    ["Criar vídeo · Veo 3.1 Fast (sem / com áudio)", tx("10 / 15 por segundo")],
    [
      "Criar vídeo · Wan 3.0",
      `${creditosCriarVideo("wan3", 1, false)} ${tx("por segundo")}`,
    ],
    [
      "Criar vídeo falado · com a voz do personagem (conforme o modelo)",
      `${Math.min(...Object.values(FALADO_POR_SEGUNDO_MODELO))}–${Math.max(...Object.values(FALADO_POR_SEGUNDO_MODELO))} ${tx("por segundo")}`,
    ],
    ["Editar legenda de vídeo", String(CREDITOS_LEGENDA)],
    ["Cortar vídeo", String(CREDITOS_CORTAR_VIDEO)],
    ["Figurinha de WhatsApp (criar ou trocar o personagem)", String(CREDITOS_FIGURINHA)],
    [
      "IA de texto · sugerir campo / checar / regenerar / expandir ficha",
      `${CREDITOS_TEXTO.sugerirCampo} / ${CREDITOS_TEXTO.checarConsistencia} / ${CREDITOS_TEXTO.regenerarSecao} / ${CREDITOS_TEXTO.expandirFicha}`,
    ],
    [
      "Escrever como o personagem (legendas, roteiro, respostas)",
      String(CREDITOS_TEXTO.escrever),
    ],
    [
      "Criar vídeo · transformar roteiro salvo em cena",
      String(CREDITOS_TEXTO.cenaDoRoteiro),
    ],
    [
      "Radar do dia · notícias / notícias + X",
      `${creditosRadar(false)} / ${creditosRadar(true)}`,
    ],
    ["Publicar ou agendar post (por rede)", String(CREDITOS_POST_POR_REDE)],
    ["Ficha manual e exportar (PNG, PDF, JSON)", "grátis"],
  ];
  return (
    <section>
      <h2 className="display text-xl uppercase text-ink mb-4">
        {tx("Quanto custa cada geração")}
      </h2>
      <div className="card overflow-hidden">
        {linhas.map(([acao, cr]) => (
          <div
            key={acao}
            className="flex justify-between gap-4 px-4 py-2.5 border-b border-line last:border-0 text-[13px]"
          >
            <span className="text-ink-mute">{acao}</span>
            <span className="font-bold text-ink mono whitespace-nowrap">
              {cr}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

interface CobrancaUsdc {
  id: string;
  rede: RedeUsdc;
  valor: number;
  valorTexto: string;
  link: string;
  qr: string;
  carteira: string;
  evm?: TransferenciaEvm;
}

function PagamentoUsdc({
  compra,
  titulo,
  onClose,
}: {
  compra: Compra;
  titulo: string;
  onClose: () => void;
}) {
  const { usdcRedes } = useRecursos();
  const redes = REDES_USDC.filter((r) => usdcRedes.includes(r.id));
  const [rede, setRede] = useState<RedeUsdc | null>(redes[0]?.id ?? null);
  /**
   * Abrir o modal não cria cobrança: ela só nasce quando a pessoa paga pela
   * carteira ou pede o QR. Até lá o valor mostrado é o preço de tabela.
   */
  const [cobranca, setCobranca] = useState<CobrancaUsdc | null>(null);
  const [criando, setCriando] = useState(false);
  const [status, setStatus] = useState<"pendente" | "pago" | "expirado">(
    "pendente",
  );
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  /** Hash/link da transação colado pelo usuário (na Solana, plano B da confirmação automática). */
  const [txPago, setTxPago] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const [erroTx, setErroTx] = useState<string | null>(null);
  /** Carteira do navegador (a da barra do topo): é dela que o pagamento sai. */
  const carteiras = useCarteiras();
  const [conectando, setConectando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [erroCarteira, setErroCarteira] = useState<string | null>(null);
  /** QR e transferência manual: só depois de pedidos. */
  const [outrasFormas, setOutrasFormas] = useState(false);
  /** A carteira já enviou o pagamento desta cobrança: lib/pagamentos/enviados.ts acompanha. */
  const enviado = useEnviado(cobranca?.id);
  const outroEnviado = useOutroEnviado(cobranca?.id);
  const acompanhando = !!enviado && !enviado.erro;
  const familia = rede === "solana" ? "solana" : "evm";
  const conectada = carteiras[familia];
  const instaladas = carteiras.instaladas[familia];
  const situacao = enviado?.pago ? "pago" : status;
  const info = REDES_USDC.find((r) => r.id === rede);
  const ocupado = criando || pagando || conectando;
  const precoTabela =
    compra.tipo === "pacote"
      ? PACOTES[compra.pacote].precoUSD
      : compra.tipo === "avulso"
        ? precoAvulso(compra.creditos, "USD")
        : precoPlano(compra.plano, compra.intervalo, "USD");

  function trocarRede(id: RedeUsdc) {
    if (id === rede) return;
    setRede(id);
    setCobranca(null);
    setStatus("pendente");
    setOutrasFormas(false);
    setErro(null);
    setTxPago("");
    setErroTx(null);
    setErroCarteira(null);
  }

  /** Cria a cobrança desta compra na rede escolhida (o servidor devolve a que já estiver em aberto). */
  async function criarCobranca(): Promise<CobrancaUsdc | null> {
    if (cobranca) return cobranca;
    if (!rede) return null;
    setErro(null);
    setCriando(true);
    try {
      const r = await fetch("/api/pagamentos/usdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...compra, rede }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(txErro(b.error ?? "Não consegui criar a cobrança."));
      setCobranca(b);
      return b as CobrancaUsdc;
    } catch (e) {
      setErro((e as Error).message);
      return null;
    } finally {
      setCriando(false);
    }
  }

  async function conectar(id: string) {
    setConectando(true);
    setErroCarteira(null);
    try {
      await conectarCarteira(familia, id);
    } catch (e) {
      setErroCarteira(
        erroDaCarteira(e, "Não foi possível conectar a carteira."),
      );
    } finally {
      setConectando(false);
    }
  }

  async function pagarComCarteira() {
    const c = carteiras[familia];
    if (!c) return;
    setPagando(true);
    setErroCarteira(null);
    try {
      const cob = await criarCobranca();
      // Reaberto com o pagamento desta cobrança já enviado: não paga de novo.
      if (!cob || aguardandoRede(cob.id)) return;
      let hash: string;
      if (cob.evm) hash = await enviarTransacaoEvm(c.id, c.endereco, cob.evm);
      else {
        const r = await fetch(`/api/pagamentos/usdc/${cob.id}/transacao`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pagador: c.endereco }),
        });
        const b = (await r.json().catch(() => ({}))) as {
          transacao?: string;
          cadeia?: string;
          error?: string;
        };
        if (!r.ok || !b.transacao || !b.cadeia)
          throw new CarteiraError(
            b.error ?? "Não consegui preparar o pagamento. Tente de novo.",
          );
        hash = await enviarTransacaoSolana(
          c.id,
          c.endereco,
          Uint8Array.from(atob(b.transacao), (ch) => ch.charCodeAt(0)),
          b.cadeia,
        );
      }
      acompanharPagamento(cob.id, hash);
    } catch (e) {
      setErroCarteira(
        erroDaCarteira(e, "Não consegui preparar o pagamento. Tente de novo."),
      );
    } finally {
      setPagando(false);
    }
  }

  async function abrirOutrasFormas() {
    if (await criarCobranca()) setOutrasFormas(true);
  }

  async function conferirTx() {
    if (!cobranca || !txPago.trim()) return;
    setConferindo(true);
    setErroTx(null);
    try {
      const r = await fetch(`/api/pagamentos/usdc/${cobranca.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx: txPago }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        status?: "pendente" | "pago" | "expirado";
        erro?: string;
      };
      if (b.status === "pago") {
        setStatus("pago");
        avisarCreditos();
      } else setErroTx(txErro(b.erro ?? "Não consegui conferir a transação."));
    } catch (e) {
      setErroTx((e as Error).message);
    } finally {
      setConferindo(false);
    }
  }

  useEffect(() => {
    // Com o pagamento enviado pela carteira, quem confere é o acompanhamento.
    if (!cobranca || status !== "pendente" || acompanhando) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/pagamentos/usdc/${cobranca.id}`, {
        cache: "no-store",
      }).catch(() => null);
      const b = (await r?.json().catch(() => null)) as {
        status?: "pendente" | "pago" | "expirado";
      } | null;
      if (b?.status === "pago") {
        setStatus("pago");
        avisarCreditos();
      } else if (b?.status === "expirado") setStatus("expirado");
    }, 5000);
    return () => clearInterval(t);
  }, [cobranca, status, acompanhando]);

  async function copiar(texto: string, qual: string) {
    if (await copyToClipboard(texto)) {
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 1500);
    }
  }
  const iconeCopia = (qual: string) =>
    copiado === qual ? (
      <Check className="w-3.5 h-3.5" />
    ) : (
      <Copy className="w-3.5 h-3.5" />
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-md p-6 relative max-h-[94dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink"
          aria-label={tx("Fechar")}
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="display text-xl text-ink uppercase mb-1">
          {tx("Pagar com USDC")}
        </h2>
        <p className="text-[13px] text-ink-mute mb-4">{titulo}</p>

        {situacao !== "pago" && !acompanhando && redes.length > 1 && (
          <div className="mb-4">
            <div className="label-cap mb-2">{tx("Rede")}</div>
            <div
              role="radiogroup"
              aria-label={tx("Rede")}
              className="flex flex-wrap gap-1.5"
            >
              {redes.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={rede === r.id}
                  onClick={() => trocarRede(r.id)}
                  disabled={ocupado}
                  className={cn(
                    "h-8 px-3 rounded-full text-[12px] font-semibold border transition disabled:opacity-60",
                    rede === r.id
                      ? "bg-accent text-bg border-accent"
                      : "border-line text-ink-mute hover:text-ink hover:border-line-strong",
                  )}
                >
                  {r.nome}
                </button>
              ))}
            </div>
            {rede === "ethereum" && (
              <p className="text-[11px] text-ink-dim mt-1.5">
                {tx(
                  "Na Ethereum a taxa da rede costuma ser alta — Base e Arbitrum saem bem mais baratas.",
                )}
              </p>
            )}
          </div>
        )}

        {erro && <Banner tom="erro">{erro}</Banner>}

        {info && situacao === "pendente" && (
          <div className="grid gap-3.5 justify-items-center text-center">
            {outroEnviado && (
              <Banner>
                {tx(
                  "Você tem um pagamento enviado aguardando a confirmação da rede. Espere os créditos entrarem antes de pagar de novo.",
                )}
              </Banner>
            )}
            <div>
              <div className="text-3xl font-bold text-ink tabular-nums">
                {cobranca?.valorTexto ?? precoTabela.toFixed(2)} {"USDC"}
              </div>
              <div className="text-[12px] text-ink-dim mt-0.5">
                {tx("na rede")} {info.nome}
              </div>
            </div>
            {acompanhando ? (
              <div className="grid gap-2 justify-items-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-accent" />
                <div className="text-sm font-bold text-ink">
                  {tx("Pagamento enviado")}
                </div>
                <p className="text-[12px] text-ink-mute">
                  {tx(
                    "Aguardando a rede confirmar — costuma levar menos de um minuto. Pode fechar esta janela: os créditos entram sozinhos.",
                  )}
                </p>
              </div>
            ) : (
              <>
                {instaladas.length > 0 && (
                  <div className="w-full grid gap-2 justify-items-center">
                    {conectada ? (
                      <>
                        <Button
                          variant="accent"
                          className="w-full"
                          onClick={pagarComCarteira}
                          disabled={ocupado}
                        >
                          {pagando ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <IconeDaCarteira carteira={conectada} />
                          )}
                          {tx("Pagar com")} {conectada.nome} ·{" "}
                          {abreviarEndereco(conectada.endereco)}
                        </Button>
                        <button
                          type="button"
                          onClick={() => desconectarCarteira(familia)}
                          disabled={ocupado}
                          className="text-[12px] font-semibold text-ink-mute hover:text-ink"
                        >
                          {tx("Usar outra carteira")}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="label-cap">
                          {tx("Conecte a carteira para pagar")}
                        </div>
                        <div className="flex gap-2 flex-wrap justify-center">
                          {instaladas.map((c) => (
                            <Button
                              key={c.id}
                              variant="ghost"
                              onClick={() => conectar(c.id)}
                              disabled={ocupado}
                            >
                              <IconeDaCarteira carteira={c} /> {c.nome}
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                    {(conectando || pagando) && (
                      <p className="text-[12px] text-ink-dim">
                        {tx("Aprove o pedido na janela da carteira…")}
                      </p>
                    )}
                    {(erroCarteira || enviado?.erro) && (
                      <p className="text-[12px] text-pink">
                        {erroCarteira ?? txErro(enviado?.erro ?? "")}
                      </p>
                    )}
                  </div>
                )}
                {cobranca && outrasFormas ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cobranca.qr}
                      alt={tx("QR code do pagamento")}
                      className="w-48 h-48 rounded-xl bg-white p-2"
                    />
                    <p className="text-[12px] text-ink-mute">
                      {tx("Escaneie com a carteira")} ({info.carteiras}){" "}
                      {info.evm
                        ? tx(
                            "— rede, token e valor já vêm preenchidos. Depois de pagar, cole abaixo o link ou o hash da transação.",
                          )
                        : tx("Pague o valor exato — a confirmação é automática.")}
                    </p>
                    <div className="flex gap-2 flex-wrap justify-center">
                      {!info.evm && (
                        <Button
                          variant="ghost"
                          onClick={() => copiar(cobranca.link, "link")}
                        >
                          {iconeCopia("link")} {tx("Copiar link")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => copiar(cobranca.valorTexto, "valor")}
                      >
                        {iconeCopia("valor")} {tx("Valor")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => copiar(cobranca.carteira, "carteira")}
                      >
                        {iconeCopia("carteira")} {tx("Endereço")}
                      </Button>
                    </div>
                    <p className="text-[11px] text-ink-dim">
                      {tx("Envie só USDC pela rede")} {info.nome}
                      {tx(". Outro token ou outra rede não é reconhecido.")}
                    </p>
                    {!info.evm && (
                      <div className="inline-flex items-center gap-2 text-[12px] text-ink-dim">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                        {tx("Aguardando o pagamento na rede…")}
                      </div>
                    )}
                    <form
                      className="w-full grid gap-2 text-left"
                      onSubmit={(e) => {
                        e.preventDefault();
                        conferirTx();
                      }}
                    >
                      <label
                        className="text-[12px] font-semibold text-ink"
                        htmlFor="tx-pago"
                      >
                        {info.evm
                          ? tx("Já pagou? Cole o link ou o hash da transação")
                          : tx(
                              "Pagou sem o QR? Cole o link ou o hash da transação",
                            )}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="tx-pago"
                          value={txPago}
                          onChange={(e) => setTxPago(e.target.value)}
                          placeholder={
                            info.evm
                              ? tx("Ex.: https://basescan.org/tx/0x… ou 0x…")
                              : tx("Ex.: https://solscan.io/tx/… ou o hash")
                          }
                          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-[13px] text-ink placeholder:text-ink-dim focus:outline-none focus:border-accent"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <Button
                          type="submit"
                          variant="accent"
                          disabled={conferindo || !txPago.trim()}
                        >
                          {conferindo ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            tx("Confirmar")
                          )}
                        </Button>
                      </div>
                      {erroTx ? (
                        <p className="text-[12px] text-pink">{erroTx}</p>
                      ) : (
                        <p className="text-[11px] text-ink-dim">
                          {tx(
                            "Conferimos na rede: destino, valor e se a transação foi feita depois desta cobrança. Cada transação vale para um pagamento só.",
                          )}
                        </p>
                      )}
                    </form>
                  </>
                ) : instaladas.length > 0 ? (
                  <button
                    type="button"
                    onClick={abrirOutrasFormas}
                    disabled={ocupado}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-mute underline underline-offset-2 hover:text-ink disabled:opacity-60"
                  >
                    {criando && !pagando && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    {tx("Pagar com QR ou transferência")}
                  </button>
                ) : (
                  // Sem carteira instalada (celular, por exemplo): o QR é o caminho.
                  <Button
                    variant="accent"
                    onClick={abrirOutrasFormas}
                    disabled={ocupado}
                  >
                    {criando && <Loader2 className="w-4 h-4 animate-spin" />}
                    {tx("Pagar com QR ou transferência")}
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {situacao === "pago" && (
          <div className="grid gap-3 justify-items-center text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-ok" />
            <div className="text-lg font-bold text-ink">
              {tx("Pagamento confirmado")}
            </div>
            <p className="text-[13px] text-ink-mute">
              {tx("Os créditos já estão na sua conta, com o bônus de +5%.")}
            </p>
            <Button variant="accent" onClick={onClose}>
              {tx("Fechar")}
            </Button>
          </div>
        )}

        {situacao === "expirado" && (
          <Banner tom="erro">
            {tx(
              "Esta cobrança expirou. Feche e gere outra — nada foi cobrado.",
            )}
          </Banner>
        )}
      </div>
    </div>
  );
}

const gb = (b: number) =>
  `${(b / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;

/** Barra de uso do armazenamento + "Liberar espaço" (apaga arquivos que nenhum personagem usa mais). */
function Armazenamento({ usado, cota }: { usado: number; cota: number }) {
  const { recarregar } = useCreditos();
  const [liberando, setLiberando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pct = cota ? Math.min(100, (usado / cota) * 100) : 0;

  async function liberar() {
    setLiberando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/storage/liberar", { method: "POST" });
      const b = (await r.json().catch(() => ({}))) as {
        apagados?: number;
        liberadoBytes?: number;
        error?: string;
      };
      if (!r.ok) throw new Error(txErro(b.error ?? "Não consegui liberar espaço."));
      setMsg(
        b.apagados
          ? `${b.apagados} arquivo(s) apagados · ${gb(b.liberadoBytes ?? 0)} liberados.`
          : "Nada para liberar: todos os arquivos estão em uso.",
      );
      recarregar();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setLiberando(false);
    }
  }

  return (
    <div className="mt-3 max-w-md">
      <div className="flex items-center justify-between text-[12px] text-ink-mute mb-1">
        <span className="inline-flex items-center gap-1.5">
          <HardDrive className="w-3.5 h-3.5" /> {gb(usado)} de {gb(cota)}
        </span>
        <button
          type="button"
          onClick={liberar}
          disabled={liberando}
          className="text-accent font-semibold hover:underline disabled:opacity-50"
        >
          {liberando ? tx("Liberando…") : tx("Liberar espaço")}
        </button>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            pct > 90 ? "bg-pink" : "bg-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-ink-dim mt-1">
        {msg ??
          tx(
            "Imagens e vídeos removidos dos personagens são apagados automaticamente em até 24h — ou agora, em “Liberar espaço”.",
          )}
      </p>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center text-ink-mute">
      {children}
    </div>
  );
}

function Banner({
  children,
  tom,
}: {
  children: React.ReactNode;
  tom?: "ok" | "erro";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        tom === "ok" && "border-ok/30 bg-ok/10 text-ok",
        tom === "erro" && "border-pink/40 bg-pink/10 text-pink",
        !tom && "border-line bg-panel text-ink-mute",
      )}
    >
      {children}
    </div>
  );
}
