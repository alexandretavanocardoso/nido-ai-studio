"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Award,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  Wallet,
} from "lucide-react";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { IconeNft } from "@/components/nft/IconeNft";
import { Button } from "@/components/ui/Button";
import { IconeRede } from "@/components/ui/IconeRede";
import { cn } from "@/lib/cn";
import { status } from "@/lib/completion";
import { DECLARACAO_NFT } from "@/lib/declaracoes";
import { txErro } from "@/lib/i18n/erros";
import { idiomaAtual, tx } from "@/lib/i18n/tx";
import {
  aoMudarCarteiras,
  CarteiraError,
  carteirasDisponiveis,
  vincularCarteira,
  type CarteiraDisponivel,
} from "@/lib/nft/carteira-navegador";
import {
  ESCADAS,
  METRICAS_COM_BADGE,
  type MetricaBadge,
} from "@/lib/nft/badges";
import {
  abreviarEndereco,
  FAUCET_DEVNET,
  type BadgeDoPersonagem,
  type EstadoNft,
} from "@/lib/nft/comum";
import { imagemDoNft, temRetrato } from "@/lib/nft/imagem";
import type { MetadadosNft } from "@/lib/nft/metadados";
import { INFO_REDES } from "@/lib/social/redes";
import { fileUrl } from "@/lib/storage/client";
import type { Character } from "@/lib/types";

/** Enquanto a rede não fecha o mint, a tela pergunta de novo neste intervalo. */
const INTERVALO_MS = 5_000;
/** Enquanto algo está chegando (autores sendo lidos, badge sendo gravado). */
const INTERVALO_CHEGANDO_MS = 15_000;
/** Quando só resta esperar a próxima tentativa de leitura de um autor. */
const INTERVALO_ESPERA_MS = 60_000;
/**
 * Consultas seguidas esperando um badge entrar no NFT (3 minutos). Passou
 * disso, a gravação não está saindo: a tela para de perguntar e o cron cuida.
 */
const MAX_CONSULTAS_GRAVANDO = 12;
/** Tentativas automáticas de carregar o estado quando a primeira falha. */
const MAX_TENTATIVAS_DE_CARGA = 5;

const local = () => (idiomaAtual() === "en" ? "en-US" : "pt-BR");
const inteiro = (n: number) => n.toLocaleString(local());
/** "4,9982" — saldo em SOL, com até quatro casas. */
const emSol = (n: number) =>
  n.toLocaleString(local(), { maximumFractionDigits: 4 });

type Dentro = "geral" | "nft";
type Erro = {
  msg: string;
  code?: string;
  /** Onde mostrar: junto da carteira, do mint ou do cartão do NFT. */
  em: "carteira" | "mint" | "nft";
};

/**
 * Aba NFT do personagem (ao lado do Radar), com duas abas internas:
 *  - "Mint e badges": vincular a carteira, mintar e acompanhar os badges;
 *  - "Meu NFT": o NFT como o mundo vê (imagem, nome, traços, badges) — antes
 *    do mint, uma prévia.
 * O servidor minta e paga a taxa; aqui a carteira só assina uma mensagem para
 * provar que é do usuário.
 */
export function NftPersonagem({ character }: { character: Character }) {
  const characterId = character.id;
  const completo = status(character) === "completo";
  const { conta, recarregar: recarregarCreditos } = useCreditos();
  const [estado, setEstado] = useState<EstadoNft | null>(null);
  const [dentro, setDentro] = useState<Dentro>("geral");
  const [carteiras, setCarteiras] = useState<CarteiraDisponivel[]>([]);
  const [trocando, setTrocando] = useState(false);
  const [aceito, setAceito] = useState(false);
  const [ocupado, setOcupado] = useState<
    "carteira" | "mint" | "arte" | null
  >(null);
  const [erro, setErro] = useState<Erro | null>(null);
  /** Metadados públicos do NFT (o que carteiras e explorers leem). */
  const [meta, setMeta] = useState<MetadadosNft | null>(null);
  /** Por que o estado não carregou (404 = o personagem ainda não está salvo na conta). */
  const [falha, setFalha] = useState<"nao_achou" | "erro" | null>(null);
  const [tentativas, setTentativas] = useState(0);
  /** Consultas seguidas feitas só para ver um badge entrar no NFT. */
  const [consultasGravando, setConsultasGravando] = useState(0);
  const vivo = useRef(true);

  const carregar = useCallback(async (): Promise<EstadoNft | null> => {
    try {
      const res = await fetch(`/api/nft/personagem/${characterId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (vivo.current) setFalha(res.status === 404 ? "nao_achou" : "erro");
        return null;
      }
      const b = (await res.json()) as EstadoNft;
      if (vivo.current) {
        setEstado(b);
        setFalha(null);
      }
      return b;
    } catch {
      if (vivo.current) setFalha("erro"); // sem rede
      return null;
    }
  }, [characterId]);

  useEffect(() => {
    vivo.current = true;
    carregar();
    setCarteiras(carteirasDisponiveis());
    const tirar = aoMudarCarteiras(() => setCarteiras(carteirasDisponiveis()));
    return () => {
      vivo.current = false;
      tirar();
    };
  }, [carregar]);

  const mint = estado?.mint ?? null;
  const mintado = mint?.status === "confirmado";
  const asset = mintado ? mint.asset : null;
  const confirmando =
    mint?.status === "preparando" || mint?.status === "enviado";
  // Badge conquistado que ainda não está no NFT: a gravação sai em seguida.
  const gravando =
    mintado &&
    !!estado?.badges.some((b) => b.status === "conquistado" && !b.naRede);
  const lendoAutores = !!estado?.lendoAutores;
  const autoresDepois = estado?.autoresDepois ?? 0;
  useEffect(() => {
    if (!gravando) setConsultasGravando(0);
  }, [gravando]);
  const esperandoGravar =
    gravando && consultasGravando < MAX_CONSULTAS_GRAVANDO;
  useEffect(() => {
    const chegando = confirmando || esperandoGravar || lendoAutores;
    // Leitura de autor que falhou: o app tenta de novo em minutos, e é a
    // consulta da tela que dispara a nova tentativa.
    if (!chegando && !autoresDepois) return;
    const soGravando = esperandoGravar && !confirmando && !lendoAutores;
    const t = setInterval(
      () => {
        if (soGravando) setConsultasGravando((n) => n + 1);
        carregar();
      },
      confirmando
        ? INTERVALO_MS
        : chegando
          ? INTERVALO_CHEGANDO_MS
          : INTERVALO_ESPERA_MS,
    );
    return () => clearInterval(t);
  }, [confirmando, esperandoGravar, lendoAutores, autoresDepois, carregar]);

  // A primeira carga falhou: tenta de novo sozinha, cada vez com mais espaço.
  useEffect(() => {
    if (estado || !falha || tentativas >= MAX_TENTATIVAS_DE_CARGA) return;
    const t = setTimeout(
      () => {
        setTentativas((n) => n + 1);
        carregar();
      },
      Math.min(30_000, 3_000 * 2 ** tentativas),
    );
    return () => clearTimeout(t);
  }, [estado, falha, tentativas, carregar]);

  // O NFT como o mundo vê: os mesmos metadados públicos que carteiras e explorers leem.
  useEffect(() => {
    if (!asset || dentro !== "nft") return;
    let valido = true;
    fetch(`/api/nft/meta/${asset}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: MetadadosNft | null) => {
        if (valido && b) setMeta(b);
      })
      .catch(() => {});
    return () => {
      valido = false;
    };
  }, [asset, dentro, mint?.imagemVersao]);

  async function conectar(nome: string) {
    setErro(null);
    setOcupado("carteira");
    try {
      await vincularCarteira(nome);
      setTrocando(false);
      await carregar();
    } catch (e) {
      setErro({
        msg:
          e instanceof CarteiraError
            ? `${txErro(e.message)}${e.detalhe ? ` (${e.detalhe})` : ""}`
            : tx("Não foi possível conectar a carteira."),
        em: "carteira",
      });
    } finally {
      setOcupado(null);
    }
  }

  async function mintar() {
    setErro(null);
    setOcupado("mint");
    try {
      const res = await fetch("/api/nft/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, consentimento: true }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok)
        setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
          em: "mint",
        });
      setAceito(false);
    } catch {
      // A resposta se perdeu, mas o mint pode ter saído: o estado abaixo mostra.
    } finally {
      avisarCreditos();
      recarregarCreditos();
      const novo = await carregar();
      // Mintou: mostra o NFT.
      if (novo?.mint?.status === "confirmado") setDentro("nft");
      setOcupado(null);
    }
  }

  /** Escolhe, entre as opções geradas, a arte que vai para o NFT. */
  async function escolherArte(key: string) {
    setErro(null);
    try {
      const res = await fetch(`/api/nft/personagem/${characterId}/arte`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
          em: "mint",
        });
      await carregar();
    } catch {
      setErro({ msg: tx("Não foi possível escolher a arte."), em: "mint" });
    }
  }

  /** Gera cinco opções de arte do NFT (só antes do mint). */
  async function gerarArte(em: Erro["em"]) {
    setErro(null);
    setOcupado("arte");
    try {
      const res = await fetch(`/api/nft/personagem/${characterId}/arte`, {
        method: "POST",
      });
      const b = await res.json().catch(() => ({}));
      avisarCreditos();
      recarregarCreditos();
      if (!res.ok)
        return setErro({
          msg: txErro(b.error ?? `Falha (HTTP ${res.status}).`),
          code: b.code,
          em,
        });
      await carregar();
    } catch {
      setErro({ msg: tx("Não foi possível gerar as artes do NFT."), em });
    } finally {
      setOcupado(null);
    }
  }

  if (!estado)
    return falha ? (
      <section className="card p-5 sm:p-7 grid gap-3 text-[14px] text-ink-mute">
        <p>
          {falha === "nao_achou"
            ? tx(
                "Este personagem ainda não está salvo na sua conta. Assim que ele sincronizar, o NFT aparece aqui.",
              )
            : tx("Não foi possível carregar o NFT do influencer.")}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => {
            setTentativas(0);
            carregar();
          }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> {tx("Tentar de novo")}
        </Button>
      </section>
    ) : (
      <section className="card p-5 sm:p-7 flex items-center gap-3 text-[14px] text-ink-mute">
        <Loader2 className="w-4 h-4 animate-spin" />
        {tx("Carregando o NFT do influencer…")}
      </section>
    );

  const semCreditos = !!conta && conta.total < estado.custo;
  // A arte do NFT é feita a partir do retrato, e é ela que fica pública.
  const retrato = imagemDoNft(character);
  const arte = estado.arte;
  const podeMintar =
    !mintado &&
    !confirmando &&
    !estado.bloqueio &&
    !!estado.carteira &&
    completo &&
    !!arte &&
    estado.mintDisponivel &&
    !semCreditos;

  return (
    <section className="card p-5 sm:p-7 grid gap-6">
      <header>
        <h2 className="text-2xl font-bold text-ink tracking-tight">
          {tx("NFT do influencer")}
          {estado.rede === "devnet" ? (
            <span className="ml-2.5 rounded-full border border-line px-2 py-0.5 text-[11px] font-bold tracking-normal text-ink-mute align-middle">
              {tx("rede de teste")}
            </span>
          ) : null}
        </h2>
        <p className="text-[15px] text-ink-mute mt-1 max-w-3xl">
          {tx(
            "Registre este influencer na Solana como um NFT que fica na sua carteira e não pode ser transferido. As marcas que ele bate em views, curtidas, comentários, reposts, quotes e salvos viram badges gravados no NFT.",
          )}
        </p>
        {estado.rede === "devnet" ? (
          <p className="mt-2 flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-dim">
            {tx(
              "Rede de teste (devnet): para ver o NFT, deixe a carteira em devnet. Mintar não exige SOL.",
            )}
            <a
              href={FAUCET_DEVNET}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
            >
              {tx("Faucet de SOL de teste")}{" "}
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        ) : null}
      </header>

      <div
        role="tablist"
        aria-label={tx("NFT do influencer")}
        className="inline-flex w-fit gap-1 rounded-full border border-line bg-panel p-1"
      >
        {(
          [
            ["geral", tx("Mint e badges")],
            ["nft", mintado ? tx("Meu NFT") : tx("Prévia do NFT")],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={dentro === id}
            onClick={() => setDentro(id)}
            className={cn(
              "h-9 rounded-full px-4 text-[13px] font-semibold transition",
              dentro === id
                ? "bg-accent text-bg"
                : "text-ink-mute hover:text-ink",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {dentro === "nft" ? (
        <CartaoDoNft
          character={character}
          estado={estado}
          meta={meta}
          onMintar={() => setDentro("geral")}
          erro={erro?.em === "nft" ? erro : null}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Passo
              numero={1}
              titulo={tx("Carteira")}
              feito={!!estado.carteira}
              rotuloFeito={tx("Conectada")}
            >
              {estado.carteira && !trocando ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-bg/40 px-3.5 py-3">
                  <Wallet className="w-4 h-4 text-ok shrink-0" />
                  <span
                    className="mono text-[14px] text-ink"
                    title={estado.carteira}
                  >
                    {abreviarEndereco(estado.carteira)}
                  </span>
                  <span
                    className="text-[13px] text-ink-mute tabular-nums"
                    title={tx("Saldo da carteira nesta rede")}
                  >
                    {estado.saldoSol === null
                      ? tx("saldo indisponível")
                      : `${emSol(estado.saldoSol)} SOL`}
                  </span>
                  {!confirmando ? (
                    <button
                      type="button"
                      onClick={() => setTrocando(true)}
                      className="ml-auto text-[13px] font-semibold text-accent hover:underline"
                    >
                      {tx("Trocar")}
                    </button>
                  ) : null}
                </div>
              ) : carteiras.length ? (
                <div className="flex flex-wrap items-center gap-2">
                  {carteiras.map((c) => (
                    <Button
                      key={c.nome}
                      variant="ghost"
                      size="sm"
                      disabled={ocupado !== null}
                      onClick={() => conectar(c.nome)}
                    >
                      {ocupado === "carteira" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.icone} alt="" className="h-4 w-4 rounded" />
                      )}
                      {c.nome}
                    </Button>
                  ))}
                  {trocando ? (
                    <button
                      type="button"
                      onClick={() => setTrocando(false)}
                      className="text-[13px] font-semibold text-ink-mute hover:text-ink"
                    >
                      {tx("Cancelar")}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="text-[13px] text-ink-mute">
                  {tx(
                    "Instale a Phantom, a Solflare, a Backpack ou a MetaMask neste navegador para conectar a carteira.",
                  )}
                </p>
              )}
              <p className="text-[12px] leading-relaxed text-ink-dim">
                {estado.carteira && !trocando
                  ? tx(
                      "Você não precisa de SOL para mintar: o mint é pago em créditos e a taxa da rede fica por conta da NIDO.",
                    )
                  : tx(
                      "A carteira só assina uma mensagem para provar que é sua. Não é uma transação e não tem custo.",
                    )}
                {mintado && trocando
                  ? ` ${tx("O NFT já mintado continua na carteira em que foi criado.")}`
                  : ""}
              </p>
              {erro?.em === "carteira" ? (
                <ErroGeracao mensagem={erro.msg} code={erro.code} />
              ) : null}
            </Passo>

            <Passo
              numero={2}
              titulo={tx("Mint")}
              feito={mintado}
              rotuloFeito={tx("Mintado")}
            >
              {mintado && mint ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-ok/30 bg-ok/10 px-3.5 py-3 text-[14px]">
                  <span className="inline-flex items-center gap-2 font-semibold text-ok">
                    <CheckCircle2 className="w-4 h-4" /> {tx("NFT mintado")}
                  </span>
                  <span className="mono text-ink-mute" title={mint.asset}>
                    {abreviarEndereco(mint.asset)}
                  </span>
                  <a
                    href={mint.linkAsset}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
                  >
                    {tx("Ver na rede")} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : confirmando ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-bg/40 px-3.5 py-3 text-[14px] text-ink">
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  {tx("Confirmando o mint na rede. Pode levar alguns minutos.")}
                  {mint?.linkTransacao ? (
                    <a
                      href={mint.linkTransacao}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
                    >
                      {tx("Ver a transação")}{" "}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null}
                </div>
              ) : (
                <>
                  {mint?.status === "falhou" && mint.assinatura ? (
                    <p className="text-[13px] text-pink">
                      {tx(
                        "O último mint não entrou na rede e os créditos foram devolvidos. Você pode tentar de novo.",
                      )}
                    </p>
                  ) : null}
                  {retrato && !estado.bloqueio ? (
                    <div className="grid gap-2.5 rounded-xl border border-line bg-bg/40 px-3.5 py-3">
                      <p className="text-[13px] text-ink">
                        {tx(
                          "A arte do NFT é o retrato do personagem redesenhado no estilo da coleção. Você gera 5 opções e escolhe uma; é ela que vai para a sua carteira.",
                        )}
                      </p>
                      {estado.artes.length ? (
                        <ul className="grid grid-cols-5 gap-2">
                          {estado.artes.map((k, i) => (
                            <li key={k}>
                              <button
                                type="button"
                                disabled={ocupado !== null}
                                aria-pressed={k === arte}
                                title={`${tx("Arte")} ${i + 1}`}
                                onClick={() => escolherArte(k)}
                                className={cn(
                                  "relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition disabled:opacity-60",
                                  k === arte
                                    ? "border-accent shadow-glow"
                                    : "border-line hover:border-ink/50",
                                )}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={fileUrl(k)}
                                  alt={`${tx("Arte")} ${i + 1}`}
                                  className="h-full w-full object-cover"
                                />
                                {k === arte ? (
                                  <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-bg">
                                    <Check className="h-3 w-3" />
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <p className="text-[12px] leading-relaxed text-pink">
                        {tx(
                          "Atenção: depois do mint a imagem não pode mais ser trocada. A arte mantém o rosto e os traços do retrato: se o personagem se parece com uma pessoa real, a imagem dela fica num registro público que não pode ser apagado. Só gere e minte com a autorização dessa pessoa.",
                        )}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-fit"
                        disabled={ocupado !== null}
                        onClick={() => gerarArte("mint")}
                      >
                        {ocupado === "arte" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5" />
                        )}
                        {ocupado === "arte"
                          ? tx("Gerando as 5 artes… (até 2 minutos)")
                          : `${estado.artes.length ? tx("Gerar outras 5 artes") : tx("Gerar 5 artes do NFT")} · ${estado.custoArte} ${tx("créditos")}`}
                      </Button>
                    </div>
                  ) : null}
                  {estado.bloqueio ? (
                    <ErroGeracao
                      mensagem={txErro(estado.bloqueio)}
                      code="PLANO"
                    />
                  ) : !estado.mintDisponivel ? (
                    <p className="text-[13px] text-pink">
                      {tx(
                        "O mint está indisponível no momento. Tente de novo mais tarde.",
                      )}
                    </p>
                  ) : !completo ? (
                    <p className="text-[13px] text-ink-mute">
                      {tx(
                        "Complete o personagem (nome e pelo menos uma imagem) para mintar.",
                      )}
                    </p>
                  ) : !retrato ? (
                    <p className="text-[13px] text-ink-mute">
                      {tx(
                        "Gere o retrato do personagem em Estúdio → Imagens para mintar: ele é a imagem do NFT.",
                      )}
                    </p>
                  ) : !arte ? (
                    <p className="text-[13px] text-ink-mute">
                      {estado.artes.length
                        ? tx("Escolha uma das artes para mintar.")
                        : tx("Gere as artes do NFT e escolha uma para mintar.")}
                    </p>
                  ) : !estado.carteira ? (
                    <p className="text-[13px] text-ink-mute">
                      {tx("Conecte uma carteira para mintar.")}
                    </p>
                  ) : (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-bg/40 px-3.5 py-3 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={aceito}
                        onChange={(e) => setAceito(e.target.checked)}
                        className="accent-accent h-4 w-4 mt-0.5 shrink-0"
                      />
                      <span>
                        {DECLARACAO_NFT}{" "}
                        <span className="text-ink-dim">
                          {tx(
                            "(obrigatório — a declaração fica registrada na sua conta)",
                          )}
                        </span>
                      </span>
                    </label>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button
                      variant="accent"
                      onClick={mintar}
                      disabled={!podeMintar || !aceito || ocupado !== null}
                    >
                      {ocupado === "mint" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <IconeNft className="w-4 h-4" />
                      )}
                      {ocupado === "mint"
                        ? tx("Mintando… (até 1 minuto)")
                        : `${tx("Mintar NFT")} · ${estado.custo} ${tx("créditos")}`}
                    </Button>
                    {conta ? (
                      <span
                        className={cn(
                          "text-[13px] tabular-nums",
                          semCreditos ? "text-pink" : "text-ink-mute",
                        )}
                      >
                        {semCreditos
                          ? tx("Créditos insuficientes:")
                          : tx("Seu saldo:")}{" "}
                        {inteiro(conta.total)} {tx("créditos")}
                        {semCreditos ? (
                          <>
                            {" · "}
                            <Link
                              href="/app/planos"
                              className="font-bold underline"
                            >
                              {tx("Ver planos e créditos")}
                            </Link>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-start gap-3">
                    <p className="text-[12px] leading-relaxed text-ink-dim">
                      {tx(
                        "Ficam públicos: nome, bio, a arte do NFT e os traços principais do personagem. O modelo treinado, a voz e as referências continuam privados.",
                      )}{" "}
                      <button
                        type="button"
                        onClick={() => setDentro("nft")}
                        className="font-semibold text-accent hover:underline"
                      >
                        {tx("Ver a prévia")}
                      </button>
                    </p>
                  </div>
                </>
              )}
              {erro?.em === "mint" ? (
                <ErroGeracao mensagem={erro.msg} code={erro.code} />
              ) : null}
            </Passo>
          </div>

          <VitrineDeBadges estado={estado} mintado={mintado} />
        </>
      )}
    </section>
  );
}

/** Um passo do caminho (carteira, mint): número que vira um "feito" verde. */
function Passo({
  numero,
  titulo,
  feito,
  rotuloFeito,
  children,
}: {
  numero: number;
  titulo: string;
  feito: boolean;
  rotuloFeito: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-3 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular-nums",
            feito ? "bg-ok/15 text-ok" : "bg-card text-ink-mute",
          )}
        >
          {feito ? <Check className="h-3.5 w-3.5" /> : numero}
        </span>
        <h3 className="text-[15px] font-semibold text-ink">{titulo}</h3>
        {feito ? (
          <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-ok">
            {rotuloFeito}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Texto técnico (endereço) com o botão de copiar. */
function Copiavel({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title={texto}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1200);
        } catch {
          /* sem permissão de área de transferência: o endereço está no title */
        }
      }}
      className="inline-flex items-center gap-1.5 mono text-[13px] text-ink hover:text-accent"
    >
      {abreviarEndereco(texto)}
      {copiado ? (
        <Check className="h-3 w-3 text-ok" />
      ) : (
        <Copy className="h-3 w-3 text-ink-dim" />
      )}
    </button>
  );
}

function Dado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="label-cap">{rotulo}</dt>
      <dd className="mt-1 text-[14px] text-ink truncate">{children}</dd>
    </div>
  );
}

/** Traços que são do personagem (os de badges e de views aparecem na vitrine). */
const ehTraco = (t: string) =>
  !/^((Views|Likes|Comments|Reposts|Quotes|Saves)( badge)?|Badges|Minted|Synthetic)$/.test(
    t,
  );

/**
 * O NFT como o mundo vê. Depois do mint, sai dos metadados públicos — os mesmos
 * que carteiras e explorers leem — e da imagem pública. Antes do mint, é uma
 * prévia com a arte que será publicada.
 */
function CartaoDoNft({
  character,
  estado,
  meta,
  onMintar,
  erro,
}: {
  character: Character;
  estado: EstadoNft;
  meta: MetadadosNft | null;
  onMintar: () => void;
  erro: Erro | null;
}) {
  const mint = estado.mint?.status === "confirmado" ? estado.mint : null;
  // A imagem pública fica em cache; a versão (do servidor) muda quando ela é trocada.
  const src = mint
    ? `/api/nft/meta/${mint.asset}/imagem?v=${mint.imagemVersao}`
    : estado.arte
      ? fileUrl(estado.arte)
      : null;
  const nome =
    meta?.name ?? (character.identidade.nome.trim() || tx("Sem nome"));
  const descricao = mint
    ? (meta?.description ?? "")
    : (character.identidade.bio ?? "").trim();
  const tracos = (meta?.attributes ?? []).filter((a) => ehTraco(a.trait_type));
  const conquistados = estado.badges.filter((b) => b.status === "conquistado");
  // Fora do app, imagem e traços vêm do endereço gravado no NFT. Rodando em
  // outro endereço (localhost), só aparecem lá quando esta versão for publicada.
  const origemPublica = (() => {
    try {
      return meta?.external_url ? new URL(meta.external_url).origin : null;
    } catch {
      return null;
    }
  })();
  const foraDoAr =
    !!origemPublica &&
    typeof window !== "undefined" &&
    origemPublica !== window.location.origin;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* Quadrado, como a arte do NFT: num quadro mais alto ela era cortada dos lados. */}
      <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-3xl border border-line bg-panel">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={nome}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="grid h-full place-items-center gap-2 text-ink-dim">
            <span className="grid justify-items-center gap-2 text-[13px]">
              <ImageIcon className="h-6 w-6" />
              {tx("Sem imagem")}
            </span>
          </div>
        )}
        {!mint ? (
          <span className="absolute left-3 top-3 rounded-full bg-bg/80 px-2.5 py-1 text-[11px] font-bold text-ink backdrop-blur">
            {tx("Prévia")}
          </span>
        ) : null}
      </div>

      <div className="grid min-w-0 content-start gap-5">
        <div>
          <div className="label-cap">Metaplex Core · NIDO Influencers</div>
          <h3 className="mt-1 break-words text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {nome}
          </h3>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Selo>{tx("Intransferível")}</Selo>
            <Selo>{tx("Sintético")}</Selo>
            {(mint?.rede ?? estado.rede) === "devnet" ? (
              <Selo>{tx("rede de teste")}</Selo>
            ) : null}
          </div>
        </div>

        {descricao ? (
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink-mute">
            {descricao}
          </p>
        ) : null}

        {mint ? (
          <dl className="grid gap-x-6 gap-y-3 rounded-2xl border border-line bg-panel/60 p-4 sm:grid-cols-2">
            <Dado rotulo={tx("Dono")}>
              <Copiavel texto={mint.carteira} />
            </Dado>
            <Dado rotulo={tx("Endereço do NFT")}>
              <Copiavel texto={mint.asset} />
            </Dado>
            <Dado rotulo={tx("Mintado em")}>
              {new Date(mint.criadoEm).toLocaleDateString(local())}
            </Dado>
            <Dado rotulo={tx("Rede")}>
              {mint.rede === "devnet" ? "Solana devnet" : "Solana"}
            </Dado>
          </dl>
        ) : null}

        {tracos.length ? (
          <div className="grid gap-2">
            <div className="label-cap">{tx("Traços")}</div>
            <ul className="flex flex-wrap gap-1.5">
              {tracos.map((t) => (
                <li
                  key={t.trait_type}
                  className="max-w-full rounded-xl border border-line bg-panel/60 px-3 py-1.5 text-[12px]"
                  title={String(t.value)}
                >
                  <span className="text-ink-dim">{t.trait_type}</span>{" "}
                  <span className="font-semibold text-ink">{t.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-2">
          <div className="label-cap">{tx("Badges")}</div>
          {conquistados.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {conquistados.map((b) => (
                <li
                  key={b.id}
                  title={nomeDoBadge(b)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3 py-1.5 text-[12px] font-bold text-ink"
                >
                  <Award className="h-3.5 w-3.5 text-accent" />
                  {b.rotulo} {ESCADAS[b.metrica].pluralEn}
                  {b.naRede ? (
                    <CheckCircle2 className="h-3 w-3 text-ok" />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-dim">
              {tx(
                "Nenhum badge ainda. Eles vêm das marcas de views, curtidas, comentários, reposts, quotes e salvos.",
              )}
            </p>
          )}
        </div>

        {mint ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <a
                href={mint.linkAsset}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
              >
                {tx("Ver na rede")} <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={`/api/nft/meta/${mint.asset}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline"
              >
                {tx("Metadados públicos")} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {foraDoAr ? (
              <p className="max-w-2xl rounded-xl border border-line bg-panel/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-mute">
                {tx(
                  "Carteiras e explorers buscam a imagem e os traços deste NFT em",
                )}{" "}
                <span className="mono text-ink">{origemPublica}</span>.{" "}
                {tx(
                  "Você está em outro endereço: lá fora eles só aparecem quando esta versão do app estiver publicada nesse endereço.",
                )}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="max-w-2xl text-[13px] leading-relaxed text-ink-mute">
              {tx(
                "É assim que o NFT vai aparecer. A imagem é a arte que você escolher, e não muda depois do mint; os traços e os badges entram depois do mint.",
              )}
              {!temRetrato(character)
                ? ` ${tx("Este personagem ainda não tem um retrato gerado: gere um em Estúdio → Imagens para ele ser a imagem do NFT.")}`
                : ""}
            </p>
            <Button variant="accent" onClick={onMintar} className="w-fit">
              <IconeNft className="w-4 h-4" /> {tx("Ir para o mint")}
            </Button>
          </div>
        )}
        {erro ? <ErroGeracao mensagem={erro.msg} code={erro.code} /> : null}
      </div>
    </div>
  );
}

function Selo({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-ink-mute">
      {children}
    </span>
  );
}

/** "5 mil views" em português, "5K views" em inglês. */
const nomeDoBadge = (b: BadgeDoPersonagem) =>
  idiomaAtual() === "en" ? b.nomeEn : b.nome;

/** O que a medalha quer dizer agora (vai na dica). */
function situacaoDoBadge(b: BadgeDoPersonagem, mintado: boolean): string {
  if (b.status === "conquistado")
    return b.naRede
      ? tx("Gravado no NFT")
      : mintado
        ? tx("Conquistado — sendo gravado no NFT")
        : tx("Conquistado — entra no NFT quando você mintar");
  return b.status === "aguardando"
    ? tx("Marca batida — em conferência pela equipe")
    : tx("Ainda não conquistado");
}

/**
 * Vitrine dos badges: uma aba por métrica (views, curtidas…), cada uma com
 * quantos badges já saíram, e a escada da métrica escolhida em medalhas. O nome
 * curto ("5K", "1M") nunca é cortado; o nome inteiro e a situação ficam na dica
 * de cada medalha. Embaixo, a conta do influencer em cada rede e o que ficou de
 * fora da conta.
 */
function VitrineDeBadges({
  estado,
  mintado,
}: {
  estado: EstadoNft;
  mintado: boolean;
}) {
  const en = idiomaAtual() === "en";
  const [metrica, setMetrica] = useState<MetricaBadge>(METRICAS_COM_BADGE[0]);
  const conquistados = estado.badges.filter(
    (b) => b.status === "conquistado",
  ).length;
  const escada = ESCADAS[metrica];
  const daMetrica = estado.badges.filter((b) => b.metrica === metrica);

  return (
    <div className="grid gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="label-cap">{tx("Badges")}</div>
        <div className="text-[12px] text-ink-mute tabular-nums">
          {conquistados} {tx("de")} {estado.badges.length} {tx("conquistados")}
        </div>
      </div>

      <div className="grid gap-4 rounded-2xl border border-line bg-panel/60 p-3 sm:p-4">
        {/* No celular as abas rolam de lado. */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div
            role="tablist"
            aria-label={tx("Badges")}
            className="flex w-max gap-1 rounded-full border border-line bg-bg/40 p-1"
          >
            {METRICAS_COM_BADGE.map((m) => {
              const todos = estado.badges.filter((b) => b.metrica === m);
              const ganhos = todos.filter(
                (b) => b.status === "conquistado",
              ).length;
              const ativa = m === metrica;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => setMetrica(m)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-full pl-3.5 pr-2 text-[13px] font-semibold transition",
                    ativa ? "bg-accent text-bg" : "text-ink-mute hover:text-ink",
                  )}
                >
                  {en ? ESCADAS[m].tituloEn : ESCADAS[m].titulo}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums",
                      ativa
                        ? "bg-bg/15 text-bg"
                        : ganhos
                          ? "bg-accent/15 text-accent"
                          : "bg-card text-ink-dim",
                    )}
                  >
                    {ganhos}/{todos.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div role="tabpanel" className="grid gap-3 px-1 pb-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[20px] font-bold leading-none tracking-tight text-ink tabular-nums">
              {inteiro(estado.totais[metrica] ?? 0)}
            </span>
            <span className="text-[13px] text-ink-mute">
              {en ? escada.pluralEn : escada.plural}
            </span>
            {escada.nota ? (
              <span className="basis-full text-[12px] leading-relaxed text-ink-dim">
                {en ? escada.notaEn : escada.nota}
              </span>
            ) : null}
          </div>

          <ul className="grid grid-cols-5 gap-2 lg:grid-cols-10">
            {daMetrica.map((b) => {
              const conquistado = b.status === "conquistado";
              const aguardando = b.status === "aguardando";
              return (
                <li
                  key={b.id}
                  title={`${nomeDoBadge(b)} — ${situacaoDoBadge(b, mintado)}`}
                  className={cn(
                    "relative flex flex-col items-center gap-2 rounded-2xl border px-1 py-3.5 text-center",
                    conquistado
                      ? "border-accent/50 bg-accent/[0.07]"
                      : aguardando
                        ? "border-line-strong bg-bg/60"
                        : "border-line bg-bg/40",
                  )}
                >
                  {b.naRede ? (
                    <CheckCircle2
                      aria-label={tx("Gravado no NFT")}
                      className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-ok"
                    />
                  ) : null}
                  <span
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-full",
                      conquistado
                        ? "bg-accent text-bg shadow-glow"
                        : aguardando
                          ? "bg-card text-ink-mute"
                          : "bg-card text-ink-dim",
                    )}
                  >
                    {conquistado ? (
                      <Award className="h-4 w-4" />
                    ) : aguardando ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[15px] font-bold leading-none tabular-nums",
                      conquistado
                        ? "text-ink"
                        : aguardando
                          ? "text-ink-mute"
                          : "text-ink-dim",
                    )}
                  >
                    {b.rotulo}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-dim">
            <span className="inline-flex items-center gap-1.5">
              <Award className="h-3 w-3 text-accent" /> {tx("Conquistado")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-ok" /> {tx("Gravado no NFT")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> {tx("Em conferência")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> {tx("Bloqueado")}
            </span>
          </div>
        </div>
      </div>

      <ContasDoInfluencer estado={estado} />
    </div>
  );
}

/**
 * De que conta de rede vêm os números do influencer, e por que algum post
 * ficou de fora. Em cada rede vale uma conta só: a conectada, ou a do primeiro
 * post cadastrado por link.
 */
function ContasDoInfluencer({ estado }: { estado: EstadoNft }) {
  const r = estado.resumo;
  const avisos: string[] = [];
  const posts = (n: number) =>
    `${n} ${n === 1 ? tx("post") : tx("posts")}`;
  if (r) {
    if (r.semAutor && !estado.lendoAutores)
      avisos.push(
        `${posts(r.semAutor)} ${tx("por link esperando a leitura de quem publicou: não contam por enquanto. O app tenta ler de novo em alguns minutos, com esta aba aberta.")}`,
      );
    if (r.outraConta)
      avisos.push(
        `${posts(r.outraConta)} ${tx("não contam: são de outra conta que não a do influencer naquela rede.")}`,
      );
    if (r.outroPersonagem)
      avisos.push(
        `${posts(r.outroPersonagem)} ${tx("não contam: a conta que publicou já é de outro personagem.")}`,
      );
    if (r.autorOculto)
      avisos.push(
        `${posts(r.autorOculto)} ${tx("não contam: não deu para saber quem publicou. No LinkedIn, só com a conta conectada.")}`,
      );
    if (r.semConta)
      avisos.push(
        `${posts(r.semConta)} ${tx("publicados pelo app não contam: a rede não tem conta conectada a este personagem.")}`,
      );
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5">
      <div className="label-cap">{tx("Contas do influencer")}</div>
      {r?.contas.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {r.contas.map((c) => (
            <li
              key={c.rede}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-bg/40 px-3 py-1.5 text-[12px]"
            >
              <IconeRede rede={c.rede} className="text-ink-mute" />
              <span className="truncate font-semibold text-ink">
                {c.usuario.startsWith("id:")
                  ? INFO_REDES[c.rede].nome
                  : `@${c.usuario}`}
              </span>
              <span
                className={cn(
                  "text-[11px] font-bold uppercase tracking-wide",
                  c.origem === "conectada" ? "text-ok" : "text-ink-dim",
                )}
              >
                {c.origem === "conectada"
                  ? tx("conectada")
                  : tx("pelo 1º link")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-mute">
          {tx(
            "Nenhuma conta ainda. Cadastre no Dashboard o link de um post do influencer: a conta que publicou vira a conta dele naquela rede.",
          )}
        </p>
      )}

      {estado.lendoAutores ? (
        <p className="flex items-center gap-2 text-[13px] text-ink">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
          {tx(
            "Lendo na rede quem publicou os posts cadastrados por link. Os números aparecem em instantes.",
          )}
        </p>
      ) : null}
      {avisos.length ? (
        <ul className="grid gap-1 text-[12px] leading-relaxed text-ink-mute">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}

      <p className="max-w-3xl text-[12px] leading-relaxed text-ink-dim">
        {tx(
          "Em cada rede vale uma conta: a conectada em Estúdio → Publicar, ou a do primeiro post cadastrado por link. Só os posts dela contam, e cada conta serve a um personagem só. Números digitados à mão não contam. Com conta não conectada, as marcas mais altas passam por conferência.",
        )}
      </p>
    </div>
  );
}
