"use client";

import { useState } from "react";
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
  bloqueioTrocaPremium,
  creditosTroca,
  creditosTrocaPremium,
  TROCA_POR_SEGUNDO_QUALIDADE,
} from "@/lib/planos";
import { DECLARACAO_VIDEO_LINK } from "@/lib/declaracoes";
import {
  custoTroca,
  custoTrocaPremium,
  KLING_TROCA,
  QUALIDADES_TROCA,
  SEEDANCE_TROCA,
  type QualidadeTroca,
} from "@/lib/video/precos";
import { Button } from "@/components/ui/Button";
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

type Motor = "kling" | "seedance";

const ROTULO_QUALIDADE: Record<QualidadeTroca, string> = {
  standard: "Standard",
  pro: "Pro",
  "4k": "4K",
};

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
  onEnviado: (job: { jobId: string; duracao: number }) => void;
}

/**
 * Troca a pessoa do vídeo pelo personagem, mantendo cenário, câmera e áudio. Dois motores:
 *  - Kling O3 Edit (fal.ai) — padrão, em Standard, Pro ou 4K; vídeos longos viram trechos de até 15s.
 *  - Seedance 2.5 (fal.ai) — premium; até 30s de uma vez, cenário e objetos mais fiéis.
 * Os dois podem remover legendas/textos da tela no mesmo passo.
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
  const [motor, setMotor] = useState<Motor>("kling");
  /** Formato do Kling O3 (só vale no motor padrão). */
  const [qualidade, setQualidade] = useState<QualidadeTroca>("pro");
  const [removerTexto, setRemoverTexto] = useState(false);
  /** Duração do vídeo inteiro. */
  const [duracaoTotal, setDuracao] = useState(
    link?.duracao ?? video?.duracao ?? 0,
  );
  /** Usar só os primeiros N segundos (0 = o vídeo inteiro). */
  const [corte, setCorte] = useState<0 | (typeof CORTES)[number]>(0);
  // Um corte só vale se for menor que o vídeo; senão é o vídeo inteiro.
  const cortando = corte > 0 && corte < duracaoTotal - 0.2;
  const duracao = cortando ? corte : duracaoTotal;
  const marcaForaDoCorte = cortando && marcas.some((m) => m.t > corte);
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
  /** Créditos e custo de `segundos` de vídeo no motor e formato escolhidos. */
  const precoDe = (segundos: number) => ({
    creditos: premium
      ? creditosTrocaPremium(segundos)
      : creditosTroca(segundos, qualidade),
    custo: premium
      ? custoTrocaPremium(segundos)
      : custoTroca(segundos, qualidade),
  });
  const { creditos, custo } = precoDe(duracao);
  // Trechos menores que o vídeo, do menor para o maior, e o vídeo inteiro por último.
  const opcoesDeCorte = [
    ...CORTES.filter((c) => c < duracaoTotal - 0.2),
    0 as const,
  ];
  const minimo = premium ? SEEDANCE_TROCA.minSegundos : KLING_TROCA.minSegundos;
  const curtoDemais = duracao > 0 && duracao < minimo;
  const bloqueio = conta
    ? ((duracao ? bloqueioTroca(conta.plano, duracao) : null) ??
      (premium ? bloqueioTrocaPremium(conta.plano) : null))
    : null;

  async function enviar() {
    if (marcas.length ? marcasSemImagem : !imagem)
      return setErro("Escolha a imagem do personagem.");
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
          imageKey: marcas.length ? undefined : imagem,
          pessoas: marcas.length
            ? marcas.map((m) => ({
                x: m.x,
                y: m.y,
                t: m.t,
                imageKey: m.imageKey,
              }))
            : undefined,
          motor,
          qualidade: premium ? undefined : qualidade,
          removerTexto,
          segundos: cortando ? corte : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        duracao?: number;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !body.jobId) {
        setErroCode(body.code ?? null);
        return setErro(txErro(body.error ?? `Falha ao enviar (HTTP ${res.status}).`));
      }
      onEnviado({ jobId: body.jobId, duracao: body.duracao ?? duracao });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const semBarra = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
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
          "h-[94vh] lg:h-[min(780px,92vh)] overflow-y-auto lg:overflow-hidden",
          semBarra,
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

        <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* Esquerda: o vídeo, ocupando a altura toda */}
          <section className="flex flex-col min-h-0 p-5 sm:p-6 gap-3 h-[62vh] lg:h-auto">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <span className="text-[13px] font-semibold text-ink">
                {tx("Quem trocar no vídeo")}
              </span>
              {link && (
                <span className="text-[12px] text-ink-dim truncate">
                  {link.plataforma}
                  {link.autor ? ` · @${link.autor}` : ""} ·{" "}
                  {link.duracao.toFixed(1)}
                  {tx("s · origem não é salva")}
                </span>
              )}
            </div>
            {srcVideo ? (
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
          <aside className="flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-line">
            <div
              className={cn(
                "flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 grid content-start gap-5",
                semBarra,
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
              {marcas.length === 0 && srcVideo ? (
                <div className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-3 text-[12px] text-ink-mute leading-relaxed">
                  <strong className="text-ink">
                    {tx("Tem mais de uma pessoa no vídeo?")}
                  </strong>{" "}
                  {tx(
                    "Clique em quem você quer trocar, direto no vídeo (até 3). Para cada uma você escolhe qual influencer entra no lugar — a IA acompanha a pessoa pelo vídeo todo, mesmo andando ou sentando.",
                  )}
                </div>
              ) : null}
              {marcas.length === 0 ? (
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
                              : `~US$ ${precoDe(seg).custo.toFixed(2)}`}
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
                <div className="text-[13px] font-semibold text-ink mb-2">
                  {tx("Motor")}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      [
                        "kling",
                        tx("Padrão"),
                        "Kling O3 Edit",
                        tx(
                          "Partes de 15s; a roupa inventada pode variar entre elas.",
                        ),
                      ],
                      [
                        "seedance",
                        tx("Premium"),
                        tx("Seedance 2.5"),
                        tx(
                          "Até 30s de uma vez; cenário, objetos e roupa mais fiéis. Recusa rostos reais.",
                        ),
                      ],
                    ] as const
                  ).map(([id, titulo, sub, dica]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMotor(id)}
                      title={dica}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition",
                        motor === id
                          ? "border-accent bg-accent/10"
                          : "border-line hover:border-line-strong",
                      )}
                    >
                      <div className="text-[13px] font-bold text-ink">
                        {titulo}
                      </div>
                      <div className="text-[11px] text-ink-dim">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {!premium && (
                <div>
                  <div className="text-[13px] font-semibold text-ink mb-2">
                    {tx("Formato")}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {QUALIDADES_TROCA.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQualidade(q)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left transition",
                          qualidade === q
                            ? "border-accent bg-accent/10"
                            : "border-line hover:border-line-strong",
                        )}
                      >
                        <div className="text-[13px] font-bold text-ink">
                          {ROTULO_QUALIDADE[q]}
                        </div>
                        <div className="text-[11px] text-ink-dim">
                          {conta
                            ? `${TROCA_POR_SEGUNDO_QUALIDADE[q]} ${tx("créditos/s")}`
                            : `US$ ${KLING_TROCA.porSegundo[q].toFixed(2)}/s`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

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

            <footer className="shrink-0 border-t border-line p-5 sm:p-6 grid gap-2">
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-ink-mute">
                  {duracao
                    ? cortando
                      ? `${duracao}s ${tx("de")} ${duracaoTotal.toFixed(1)}s`
                      : `${duracao.toFixed(1)}s de vídeo`
                    : tx("Calculando duração…")}
                </span>
                <strong className="text-ink">
                  {duracao
                    ? conta
                      ? `${creditos} créditos`
                      : `~US$ ${custo.toFixed(2)}`
                    : "…"}
                </strong>
              </div>
              <Button
                variant="accent"
                className="w-full justify-center"
                onClick={enviar}
                disabled={
                  enviando ||
                  (marcas.length ? marcasSemImagem : !imagem) ||
                  curtoDemais ||
                  marcaForaDoCorte ||
                  !!bloqueio ||
                  (!!link && !direitos)
                }
              >
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {enviando
                  ? tx("Preparando o vídeo…")
                  : tx("Gerar vídeo com o personagem")}
              </Button>
            </footer>
          </aside>
        </div>
      </div>
    </div>
  );
}
