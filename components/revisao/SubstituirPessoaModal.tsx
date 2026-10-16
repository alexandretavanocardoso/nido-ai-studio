"use client";

import {
  ESTILOS_TROCA,
  ESTILOS_TROCA_IDS,
  type EstiloTroca,
} from "@/lib/video/estilos";
import { useEffect, useState } from "react";
import { Loader2, UserRound, X } from "lucide-react";
import type { Character, VideoArquivo } from "@/lib/types";
import { fileUrl } from "@/lib/storage/client";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import {
  bloqueioTroca,
  creditosPorSegundoTroca,
  creditosTroca,
  creditosTrocaOmni,
  creditosTrocaPremium,
  creditosTrocaRecast,
} from "@/lib/planos";
import { DECLARACAO_VIDEO_LINK } from "@/lib/declaracoes";
import {
  MODOS_TROCA,
  MODOS_TROCA_IDS,
  PEDIDO_TROCA_MAX,
  type ModoTroca,
} from "@/lib/video/modos";
import {
  custoPorSegundoTroca,
  custoTroca,
  custoTrocaOmni,
  custoTrocaPremium,
  custoTrocaRecast,
  MINIMO_TROCA,
  MODELOS_TROCA,
  MODELOS_TROCA_IDS,
  modeloTrocaLigado,
  resolucaoRecast,
  segundosCobradosTroca,
  trocaPorTomadas,
  type ModeloTroca,
} from "@/lib/video/precos";
import { Button } from "@/components/ui/Button";
import { SeletorModelo } from "@/components/ui/SeletorModelo";
import { AvisoRostoReal } from "@/components/sombra/comum";
import { cn } from "@/lib/cn";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import {
  buscarMascara,
  LinhaMarca,
  novaMarca,
  VideoMarcador,
  type Marca,
} from "@/components/revisao/MarcarPessoas";
import { useCharacters } from "@/lib/store";
import { useDuravel } from "@/lib/duravel";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";
import { dinheiro } from "@/lib/moeda";

/** Vídeo buscado por link (/api/videos/link): não está no S3, só na cópia temporária da IA. */
export interface VideoLink {
  linkId: string;
  url: string;
  plataforma: string;
  titulo: string | null;
  autor: string | null;
  thumb: string | null;
  /** Cópia temporária do vídeo (fal), pra pré-visualizar e marcar pessoas. */
  videoUrl: string | null;
  duracao: number;
}

interface Props {
  character: Character;
  /** Vídeo de origem: um arquivo da lista (S3) OU um link buscado. */
  video?: VideoArquivo;
  link?: VideoLink;
  onClose: () => void;
  onEnviado: (job: {
    jobId: string;
    duracao: number;
    /** Vídeo original guardado para o "antes e depois". */
    antesKey?: string;
    /** Outros personagens que entraram no vídeo (pessoas marcadas): o vídeo aparece no estúdio deles também. */
    outros: string[];
  }) => void;
}

/**
 * Troca a pessoa do vídeo pelo personagem, mantendo cenário, câmera e áudio.
 * O modelo é escolhido no rodapé (ver MODELOS_TROCA em lib/video/precos):
 *  - Kling O3 Edit (fal.ai), em Standard, Pro ou 4K; vídeos longos viram trechos de até 15s.
 *  - Seedance 2.5 (fal.ai); até 30s de uma vez, cenário e objetos mais fiéis.
 *  - Gemini Omni Flash (Google); trechos de até 10s, o mais barato.
 *  - MiniMax Recast (Sapiens), em 768p ou 1080p; até 30s de uma vez, só troca pessoas.
 * Todos podem remover legendas/textos da tela no mesmo passo.
 * Mostra o custo estimado antes de enviar.
 */
/** Trechos que dá para escolher em vez do vídeo inteiro (segundos, a partir do começo). */
const CORTES = [10, 15, 30] as const;

export function SubstituirPessoaModal({
  character,
  video,
  link,
  onClose,
  onEnviado,
}: Props) {
  const recursos = useRecursos();
  const opcoes = useImagensPersonagem(character);
  const [imagem, setImagem] = useState<string | null>(opcoes[0]?.key ?? null);
  /** Pessoas marcadas no vídeo (vazio = a IA troca a pessoa principal). */
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const personagens = useCharacters((s) => s.characters);
  const srcVideo = video ? fileUrl(video.key) : (link?.videoUrl ?? null);
  const marcasSemImagem = marcas.some((m) => !m.imageKey);
  const [removerTexto, setRemoverTexto] = useState(false);
  /** Estilo visual do vídeo: realista ou redesenhado (desenho, anime, 3D). */
  const [estilo, setEstilo] = useState<EstiloTroca>("realista");
  /** O que muda: o personagem, personagem e cena, só a cena ou só um detalhe. */
  const [modo, setModo] = useState<ModoTroca>("personagem");
  /** O Recast só troca pessoas: não muda a cena nem o estilo. */
  const recastServe = modo === "personagem" && estilo === "realista";
  /** Modelo da troca: o motor e, no Kling, o formato; no Recast, a resolução. */
  const [modeloEscolhido, setModeloTroca] = useState<ModeloTroca>("kling_pro");
  // Com outra cena ou outro estilo, o Recast escolhido dá lugar ao Kling O3 Pro
  // (e volta se o usuário voltar a só trocar a pessoa).
  const modeloTroca =
    MODELOS_TROCA[modeloEscolhido].motor === "recast" && !recastServe
      ? "kling_pro"
      : modeloEscolhido;
  const { motor } = MODELOS_TROCA[modeloTroca];
  const qualidade = MODELOS_TROCA[modeloTroca].qualidade ?? "pro";
  const resolucao = resolucaoRecast(modeloTroca);
  /** Pedido escrito (o lugar novo, o detalhe a mudar…). */
  const [pedido, setPedido] = useState("");
  const comPersonagem = MODOS_TROCA[modo].personagem;
  const faltaPedido = MODOS_TROCA[modo].pedidoObrigatorio && !pedido.trim();
  /** De onde vem a roupa: do personagem, ou a do vídeo (só a cabeça muda). */
  const [roupa, setRoupa] = useState<"personagem" | "foto">("personagem");
  /** Duração do vídeo inteiro. */
  const [duracaoTotal, setDuracao] = useState(
    link?.duracao ?? video?.duracao ?? 0,
  );
  /** Usar só os primeiros N segundos (0 = o vídeo inteiro). */
  const [corte, setCorte] = useState<0 | (typeof CORTES)[number]>(0);
  // Um corte só vale se for menor que o vídeo; senão é o vídeo inteiro.
  const cortando = corte > 0 && corte < duracaoTotal - 0.2;
  const duracao = cortando ? corte : duracaoTotal;
  const marcaForaDoCorte =
    comPersonagem && cortando && marcas.some((m) => m.t > corte);
  /** Com link: declaração obrigatória de direito de uso do vídeo. */
  const [direitos, setDireitos] = useState(false);
  const [enviando, setEnviando] = useDuravel<boolean>(
    `troca-video:${video?.id ?? link?.linkId}:enviando`,
    false,
    "Preparando o vídeo da troca",
  );
  const [erro, setErro] = useDuravel<string | null>(
    `troca-video:${video?.id ?? link?.linkId}:erro`,
    null,
  );

  const { conta } = useCreditos();
  const [erroCode, setErroCode] = useDuravel<string | null>(
    `troca-video:${video?.id ?? link?.linkId}:erroCode`,
    null,
  );
  const premium = motor === "seedance";
  /**
   * Cortes de câmera do vídeo (s). Num vídeo de cortes rápidos o motor Padrão
   * processa cada tomada sozinha e cobra mais segundos do que o vídeo tem.
   */
  const [cortes, setCortes] = useState<number[]>([]);
  const videoKey = link ? undefined : video?.key;
  const linkId = link?.linkId;
  useEffect(() => {
    if (!videoKey && !linkId) return;
    let vivo = true;
    fetch("/api/videos/cortes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoKey, linkId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { cortes?: number[] } | null) => {
        if (vivo && Array.isArray(b?.cortes)) setCortes(b.cortes);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [videoKey, linkId]);
  /** Só os cortes dentro dos `segundos` usados (o servidor corta o vídeo antes de medir). */
  const cortesAte = (segundos: number) =>
    cortes.filter((c) => c < segundos - 0.05);
  /** Créditos e custo de `segundos` de vídeo no motor e formato escolhidos. */
  const precoDe = (segundos: number) => {
    if (premium)
      return {
        creditos: creditosTrocaPremium(segundos),
        custo: custoTrocaPremium(segundos),
      };
    if (motor === "omni")
      return {
        creditos: creditosTrocaOmni(segundos),
        custo: custoTrocaOmni(segundos),
      };
    if (motor === "recast")
      return {
        creditos: creditosTrocaRecast(segundos, resolucao),
        custo: custoTrocaRecast(segundos, resolucao),
      };
    // Padrão: os segundos que o motor processa (iguais aos do vídeo, salvo
    // cortes rápidos — que só vão tomada por tomada no modo "personagem").
    const cobrados =
      modo === "personagem"
        ? segundosCobradosTroca(cortesAte(segundos), segundos)
        : segundos;
    return {
      creditos: creditosTroca(cobrados, qualidade),
      custo: custoTroca(cobrados, qualidade),
    };
  };
  const { creditos, custo } = precoDe(duracao);
  /** Tomadas do vídeo, quando ele vai tomada por tomada (só no motor Padrão). */
  const tomadas =
    motor !== "kling" || !duracao || modo !== "personagem"
      ? null
      : trocaPorTomadas(cortesAte(duracao), duracao);
  // Trechos menores que o vídeo, do menor para o maior, e o vídeo inteiro por último.
  const opcoesDeCorte = [
    ...CORTES.filter((c) => c < duracaoTotal - 0.2),
    0 as const,
  ];
  const minimo = MINIMO_TROCA[motor];
  const curtoDemais = duracao > 0 && duracao < minimo;
  const bloqueio =
    conta && duracao ? bloqueioTroca(conta.plano, duracao) : null;

  async function enviar() {
    if (comPersonagem && (marcas.length ? marcasSemImagem : !imagem))
      return setErro("Escolha a imagem do personagem.");
    if (faltaPedido) return setErro("Escreva o que mudar no vídeo.");
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/videos/substituir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          videoKey: link ? undefined : video?.key,
          linkId: link?.linkId,
          direitos: link ? direitos : undefined,
          imageKey: !comPersonagem || marcas.length ? undefined : imagem,
          pessoas: comPersonagem && marcas.length
            ? marcas.map((m) => ({
                x: m.x,
                y: m.y,
                t: m.t,
                imageKey: m.imageKey,
                // Imagem enviada na hora não é de personagem nenhum.
                characterId:
                  m.imageKey === m.enviada ? undefined : m.characterId,
              }))
            : undefined,
          motor,
          qualidade: motor === "kling" ? qualidade : undefined,
          resolucao: motor === "recast" ? resolucao : undefined,
          removerTexto,
          estilo,
          roupa,
          modo,
          pedido: pedido.trim() || undefined,
          segundos: cortando ? corte : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        duracao?: number;
        error?: string;
        code?: string;
        antesKey?: string | null;
      };
      avisarCreditos();
      if (!res.ok || !body.jobId) {
        setErroCode(body.code ?? null);
        return setErro(txErro(body.error ?? `Falha ao enviar (HTTP ${res.status}).`));
      }
      onEnviado({
        jobId: body.jobId,
        duracao: body.duracao ?? duracao,
        antesKey: body.antesKey ?? undefined,
        outros: comPersonagem
          ? [...new Set(marcas.map((m) => m.characterId))].filter(
              (id) => id !== character.id,
            )
          : [],
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  // Barra fina mas visível: no celular é ela que mostra que o modal rola.
  const barraFina =
    "[scrollbar-width:thin] [scrollbar-color:#3a3a3a_transparent] [&::-webkit-scrollbar]:w-1.5";
  const listaPersonagens = personagens.length ? personagens : [character];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "card w-full max-w-5xl relative flex flex-col rounded-t-3xl sm:rounded-3xl",
          "h-[94dvh] lg:h-[min(780px,92dvh)] overflow-y-auto lg:overflow-hidden",
          barraFina,
        )}
      >
        {/* Cabeçalho */}
        <header className="flex items-start gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-line shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-ink">
              {tx("Trocar pessoa pelo personagem")}
            </h2>
            <p className="text-[13px] text-ink-mute mt-0.5">
              {tx(
                "Mantém cenário, câmera e áudio; troca só quem você escolher. Leva 3 a 10 min — pode fechar, o vídeo aparece na lista.",
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-line hover:border-ink text-ink-mute hover:text-ink shrink-0"
            aria-label={tx("Fechar")}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Lê a duração pra estimar o custo (o servidor mede de novo). */}
        {video && (
          <video
            src={fileUrl(video.key)}
            preload="metadata"
            className="hidden"
            onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
          />
        )}

        {/* Abaixo de lg o modal inteiro rola (uma rolagem só); no lg cada coluna cabe na altura. */}
        <div className="grid lg:flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* Esquerda: o vídeo, ocupando a altura toda */}
          <section className="flex flex-col min-h-0 p-5 sm:p-6 gap-3 h-[62dvh] lg:h-auto">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <span className="text-[13px] font-semibold text-ink">
                {comPersonagem ? tx("Quem trocar no vídeo") : tx("Vídeo")}
              </span>
              {link && (
                <span className="text-[12px] text-ink-dim truncate">
                  {link.plataforma}
                  {link.autor ? ` · @${link.autor}` : ""} ·{" "}
                  {link.duracao.toFixed(1)}
                  {tx("s · o trecho original fica guardado para o antes e depois")}
                </span>
              )}
            </div>
            {srcVideo && !comPersonagem ? (
              // Ninguém a trocar: não tem o que marcar, é só para assistir.
              <video
                src={srcVideo}
                controls
                playsInline
                className="flex-1 min-h-0 w-full rounded-xl bg-black object-contain"
              />
            ) : srcVideo ? (
              <div className="flex-1 min-h-0">
                <VideoMarcador
                  src={srcVideo}
                  marcas={marcas}
                  onMarcar={(x, y, t) => {
                    const nova = novaMarca(x, y, t, character);
                    setMarcas((m) => [...m, nova]);
                    void buscarMascara(
                      link ? { linkId: link.linkId } : { videoKey: video?.key },
                      nova,
                    ).then((r) =>
                      setMarcas((m) =>
                        m.map((z) => (z.id === nova.id ? { ...z, ...r } : z)),
                      ),
                    );
                  }}
                  onRemover={(id) =>
                    setMarcas((m) => m.filter((x) => x.id !== id))
                  }
                />
              </div>
            ) : link?.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={link.thumb}
                alt=""
                className="flex-1 min-h-0 object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
            ) : null}
          </section>

          {/* Direita: opções + botão fixo embaixo */}
          <aside className="flex flex-col lg:min-h-0 border-t lg:border-t-0 lg:border-l border-line">
            <div
              className={cn(
                "p-5 sm:p-6 grid content-start gap-5 lg:flex-1 lg:min-h-0 lg:overflow-y-auto",
                barraFina,
              )}
            >
              {link ? (
                <label className="flex items-start gap-2.5 text-[12px] text-ink cursor-pointer rounded-xl border border-line bg-panel px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={direitos}
                    onChange={(e) => setDireitos(e.target.checked)}
                    className="accent-accent h-4 w-4 mt-0.5 shrink-0"
                  />
                  <span>
                    {DECLARACAO_VIDEO_LINK}{" "}
                    <span className="text-ink-dim">{tx("(obrigatório)")}</span>
                  </span>
                </label>
              ) : null}
              <div>
                <div className="mb-2 text-[13px] font-semibold text-ink">
                  {tx("O que mudar")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MODOS_TROCA_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setModo(id)}
                      aria-pressed={modo === id}
                      title={tx(MODOS_TROCA[id].nota)}
                      className={cn(
                        "h-8 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold transition",
                        modo === id
                          ? "border-accent bg-accent text-bg"
                          : "border-line text-ink-mute hover:border-line-strong hover:text-ink",
                      )}
                    >
                      {tx(MODOS_TROCA[id].label)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-ink-dim">
                  {tx(MODOS_TROCA[modo].nota)}
                </p>
                <textarea
                  value={pedido}
                  onChange={(e) =>
                    setPedido(e.target.value.slice(0, PEDIDO_TROCA_MAX))
                  }
                  rows={2}
                  placeholder={tx(MODOS_TROCA[modo].exemplo)}
                  aria-label={tx("Pedido")}
                  className="mt-2 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-ink-dim focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-ink-dim">
                  {MODOS_TROCA[modo].pedidoObrigatorio
                    ? tx("Obrigatório neste modo.")
                    : tx("Opcional: algo a mais que a IA deve fazer.")}
                </p>
              </div>
              {comPersonagem && marcas.length === 0 && srcVideo ? (
                <div className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-3 text-[12px] text-ink-mute leading-relaxed">
                  <strong className="text-ink">
                    {tx("Tem mais de uma pessoa no vídeo?")}
                  </strong>{" "}
                  {tx(
                    "Clique em quem você quer trocar, direto no vídeo (até 3). Para cada uma você escolhe qual influencer entra no lugar — a IA acompanha a pessoa pelo vídeo todo, mesmo andando ou sentando.",
                  )}
                </div>
              ) : null}
              {!comPersonagem ? null : marcas.length === 0 ? (
                <div>
                  <div className="text-[13px] font-semibold text-ink mb-2">
                    {tx("Personagem")}
                  </div>
                  <EscolherImagemPersonagem
                    compacto
                    opcoes={opcoes}
                    valor={imagem}
                    onChange={setImagem}
                  />
                  <p className="text-[11px] text-ink-dim mt-1.5">
                    {tx(
                      "De corpo inteiro e de frente funciona melhor (o fundo é removido sozinho).",
                    )}
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="text-[13px] font-semibold text-ink">
                    {marcas.length === 1
                      ? tx("Pessoa marcada")
                      : `${marcas.length} pessoas marcadas`}
                  </div>
                  {marcas.map((m, i) => (
                    <LinhaMarca
                      key={m.id}
                      numero={i + 1}
                      marca={m}
                      origem={
                        srcVideo ? { tipo: "video", src: srcVideo } : undefined
                      }
                      personagens={listaPersonagens}
                      onChange={(mud) =>
                        setMarcas((all) =>
                          all.map((x) =>
                            x.id === m.id ? { ...x, ...mud } : x,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              )}

              {duracaoTotal > CORTES[0] + 0.2 ? (
                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold text-ink">
                      {tx("Duração")}
                    </span>
                    <span className="text-[11px] text-ink-dim">
                      {tx("contada do começo do vídeo")}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {opcoesDeCorte.map((c) => {
                      const ativo = cortando ? corte === c : c === 0;
                      const seg = c === 0 ? duracaoTotal : c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCorte(c)}
                          aria-pressed={ativo}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-left transition",
                            ativo
                              ? "border-accent bg-accent/10"
                              : "border-line hover:border-line-strong",
                          )}
                        >
                          <div className="text-[13px] font-bold text-ink">
                            {c === 0
                              ? `${tx("Inteiro")} · ${Math.round(duracaoTotal)}s`
                              : `${c}s`}
                          </div>
                          <div className="text-[11px] text-ink-dim">
                            {conta
                              ? `${precoDe(seg).creditos} ${tx("créditos")}`
                              : `~${dinheiro(precoDe(seg).custo, { de: "USD" })}`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {marcaForaDoCorte ? (
                    <p className="mt-2 text-[12px] text-pink">
                      {tx("Marque as pessoas dentro dos primeiros")} {corte}s{" "}
                      {tx("do vídeo, ou escolha um trecho maior.")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-[13px] font-semibold text-ink">
                  {tx("Estilo do vídeo")}
                </div>
                {/* Pílulas que quebram linha: o nome de cada estilo aparece inteiro. */}
                <div className="flex flex-wrap gap-1.5">
                  {ESTILOS_TROCA_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setEstilo(id)}
                      aria-pressed={estilo === id}
                      title={tx(ESTILOS_TROCA[id].nota)}
                      className={cn(
                        "h-8 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold transition",
                        estilo === id
                          ? "border-accent bg-accent text-bg"
                          : "border-line text-ink-mute hover:border-line-strong hover:text-ink",
                      )}
                    >
                      {tx(ESTILOS_TROCA[id].label)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-ink-dim">
                  {tx(ESTILOS_TROCA[estilo].nota)} ·{" "}
                  {estilo === "realista"
                    ? tx("só a pessoa muda")
                    : tx("o vídeo inteiro é redesenhado neste estilo")}
                </p>
              </div>

              {comPersonagem ? (
              <div>
                <div className="mb-2 text-[13px] font-semibold text-ink">
                  {tx("Roupa")}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["personagem", "Do personagem", "Ele entra com o look dele"],
                      ["foto", "Do vídeo", "Só a cabeça muda; a roupa original fica"],
                    ] as const
                  ).map(([id, titulo, nota]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRoupa(id)}
                      aria-pressed={roupa === id}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left transition",
                        roupa === id
                          ? "border-accent bg-accent/10"
                          : "border-line hover:border-line-strong",
                      )}
                    >
                      <div className="text-[13px] font-bold text-ink">
                        {tx(titulo)}
                      </div>
                      <div className="text-[11px] text-ink-dim">{tx(nota)}</div>
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              <label className="inline-flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={removerTexto}
                  onChange={(e) => setRemoverTexto(e.target.checked)}
                  className="accent-accent h-4 w-4"
                />
                {tx("Remover legendas e textos da tela")}
              </label>

              {link ? null : (
                <p className="text-[11px] text-ink-dim flex gap-1.5">
                  <UserRound className="w-3.5 h-3.5 shrink-0 mt-px" />
                  {tx(
                    "Use só vídeos que você tem direito de usar e sinalize que o personagem é sintético.",
                  )}
                </p>
              )}

              {tomadas ? (
                <div className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-3 text-[12px] text-ink-mute leading-relaxed">
                  <strong className="text-ink">
                    {tx("Vídeo com cortes rápidos")} · {tomadas.length}{" "}
                    {tx("tomadas")}
                  </strong>{" "}
                  {tx(
                    "Cada tomada é trocada separadamente, e as mais curtas contam como 3 segundos cada — por isso o valor é maior que o da duração do vídeo. Tomada em que a pessoa marcada não aparece fica como no original e não é cobrada. Pode levar mais tempo que o normal.",
                  )}
                </div>
              ) : null}
              {curtoDemais && (
                <p className="text-[12px] text-pink">
                  {tx("O vídeo precisa ter pelo menos")} {minimo}s.
                </p>
              )}
              {bloqueio ? (
                <ErroGeracao mensagem={bloqueio} code="PLANO" />
              ) : null}
              {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}
            </div>

            {/* Preso embaixo enquanto o modal rola (abaixo de lg): modelo, preço e botão sempre à vista. */}
            <footer className="sticky bottom-0 z-10 bg-[#131112] lg:static shrink-0 border-t border-line p-5 sm:p-6 grid gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <SeletorModelo
                  rotulo={tx("Modelo")}
                  valor={modeloTroca}
                  onChange={setModeloTroca}
                  // Do mais caro para o mais barato (o Omni só com a chave do Gemini,
                  // o Recast com a do Sapiens e só quando é para trocar a pessoa).
                  opcoes={MODELOS_TROCA_IDS.filter(
                    (id) =>
                      modeloTrocaLigado(id, recursos) &&
                      (MODELOS_TROCA[id].motor !== "recast" || recastServe),
                  )
                    .sort(
                      (a, b) =>
                        creditosPorSegundoTroca(b) - creditosPorSegundoTroca(a),
                    )
                    .map((id) => ({
                      id,
                      label: MODELOS_TROCA[id].label,
                      nota: tx(MODELOS_TROCA[id].nota),
                      preco: conta
                        ? `${creditosPorSegundoTroca(id)} ${tx("créditos/s")}`
                        : `${dinheiro(custoPorSegundoTroca(id), { de: "USD" })}/s`,
                    }))}
                />
                <div className="min-w-0">
                  <div className="text-[15px] font-bold leading-tight text-ink">
                    {duracao
                      ? conta
                        ? `${tomadas ? `${tx("até")} ` : ""}${creditos} ${tx("créditos")}`
                        : `~${dinheiro(custo, { de: "USD" })}`
                      : "…"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-mute">
                    {duracao
                      ? cortando
                        ? `${duracao}s ${tx("de")} ${duracaoTotal.toFixed(1)}s`
                        : `${duracao.toFixed(1)}s ${tx("de vídeo")}`
                      : tx("Calculando duração…")}
                  </div>
                </div>
              </div>
              {MODELOS_TROCA[modeloTroca].recusaRostoReal ? <AvisoRostoReal /> : null}
              <Button
                variant="accent"
                className="w-full justify-center"
                onClick={enviar}
                disabled={
                  enviando ||
                  (comPersonagem &&
                    (marcas.length ? marcasSemImagem : !imagem)) ||
                  faltaPedido ||
                  curtoDemais ||
                  marcaForaDoCorte ||
                  !!bloqueio ||
                  (!!link && !direitos)
                }
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {enviando
                  ? tx("Preparando o vídeo…")
                  : comPersonagem
                    ? tx("Gerar vídeo com o personagem")
                    : tx("Gerar vídeo")}
              </Button>
            </footer>
          </aside>
        </div>
      </div>
    </div>
  );
}
