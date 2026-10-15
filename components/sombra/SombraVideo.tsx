"use client";

import { useEffect, useState } from "react";
import { Film, Link2, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { useRecursos } from "@/components/RecursosProvider";
import {
  avisarCreditos,
  useCreditos,
} from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Button } from "@/components/ui/Button";
import { SeletorModelo } from "@/components/ui/SeletorModelo";
import { LinkVideoModal } from "@/components/revisao/LinkVideoModal";
import type { VideoLink } from "@/components/revisao/SubstituirPessoaModal";
import {
  buscarMascara,
  VideoMarcador,
  type Marca,
} from "@/components/revisao/MarcarPessoas";
import { cn } from "@/lib/cn";
import { DECLARACAO_VIDEO_LINK } from "@/lib/declaracoes";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { dinheiro } from "@/lib/moeda";
import {
  bloqueioTroca,
  creditosPorSegundoTroca,
  creditosTroca,
  creditosTrocaOmni,
  creditosTrocaPremium,
} from "@/lib/planos";
import { uploadFile } from "@/lib/storage/client";
import { STORAGE_KINDS } from "@/lib/storage/env";
import {
  custoPorSegundoTroca,
  custoTroca,
  custoTrocaOmni,
  custoTrocaPremium,
  MINIMO_TROCA,
  MODELOS_TROCA,
  MODELOS_TROCA_IDS,
  segundosCobradosTroca,
  trocaPorTomadas,
  type ModeloTroca,
} from "@/lib/video/precos";
import {
  AvisoRostoReal,
  EnviarOrigem,
  marcaSemPersonagem,
  Opcoes,
  PessoaMarcada,
  QuemEntra,
  type ImagemEnviada,
} from "./comum";

/** Trechos que dá para escolher em vez do vídeo inteiro (segundos, a partir do começo). */
const CORTES = [10, 15, 30] as const;

/**
 * Sombra em vídeo, sem personagem: envia o vídeo (ou cola o link, como no
 * Estúdio), marca quem trocar (até 3,
 * ou nenhuma = a pessoa principal) e envia a imagem de quem entra no lugar de
 * cada um. Mesma rota do Estúdio (/api/videos/substituir), sem `characterId`:
 * o vídeo fica no histórico da Sombra.
 */
export function SombraVideo({
  onEnviado,
}: {
  onEnviado: (jobId: string) => void;
}) {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const [video, setVideo] = useState<{ key: string; src: string } | null>(null);
  /** Vídeo por link (/api/videos/link): no lugar do arquivo enviado. */
  const [link, setLink] = useState<VideoLink | null>(null);
  const [colandoLink, setColandoLink] = useState(false);
  /** Com link: declaração obrigatória de direito de uso do vídeo. */
  const [direitos, setDireitos] = useState(false);
  const [enviandoVideo, setEnviandoVideo] = useState<number | null>(null);
  const [duracaoTotal, setDuracao] = useState(0);
  const [cortes, setCortes] = useState<number[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [quem, setQuem] = useState<Record<string, ImagemEnviada>>({});
  const [principal, setPrincipal] = useState<ImagemEnviada | null>(null);
  const [modeloTroca, setModeloTroca] = useState<ModeloTroca>("kling_pro");
  const { motor } = MODELOS_TROCA[modeloTroca];
  const qualidade = MODELOS_TROCA[modeloTroca].qualidade ?? "pro";
  const premium = motor === "seedance";
  const [roupa, setRoupa] = useState<"personagem" | "foto">("personagem");
  const [removerTexto, setRemoverTexto] = useState(false);
  const [corte, setCorte] = useState<0 | (typeof CORTES)[number]>(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCode, setErroCode] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Cortes de câmera: num vídeo de cortes rápidos o motor Padrão vai tomada
  // por tomada e cobra mais segundos do que o vídeo tem.
  const videoKey = video?.key;
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

  /** Origem do vídeo para a silhueta e para a troca: o arquivo ou o link. */
  const origem = link ? { linkId: link.linkId } : { videoKey: video?.key };
  /** O que tocar na tela (link sem prévia: só a capa, e a IA troca a pessoa principal). */
  const srcVideo = video?.src ?? link?.videoUrl ?? null;
  const cortando = corte > 0 && corte < duracaoTotal - 0.2;
  const duracao = cortando ? corte : duracaoTotal;
  const marcaForaDoCorte = cortando && marcas.some((m) => m.t > corte);
  const cortesAte = (s: number) => cortes.filter((c) => c < s - 0.05);
  const precoDe = (segundos: number) =>
    premium
      ? {
          creditos: creditosTrocaPremium(segundos),
          custo: custoTrocaPremium(segundos),
        }
      : motor === "omni"
        ? {
            creditos: creditosTrocaOmni(segundos),
            custo: custoTrocaOmni(segundos),
          }
        : {
            creditos: creditosTroca(
              segundosCobradosTroca(cortesAte(segundos), segundos),
              qualidade,
            ),
            custo: custoTroca(
              segundosCobradosTroca(cortesAte(segundos), segundos),
              qualidade,
            ),
          };
  const { creditos, custo } = precoDe(duracao);
  const tomadas =
    motor !== "kling" || !duracao
      ? null
      : trocaPorTomadas(cortesAte(duracao), duracao);
  const opcoesDeCorte = [
    ...CORTES.filter((c) => c < duracaoTotal - 0.2),
    0 as const,
  ];
  const minimo = MINIMO_TROCA[motor];
  const curtoDemais = duracao > 0 && duracao < minimo;
  const bloqueio =
    conta && duracao ? bloqueioTroca(conta.plano, duracao) : null;
  const falta = marcas.length ? marcas.some((m) => !quem[m.id]) : !principal;

  if (!recursos.fal)
    return (
      <p className="text-[13px] text-ink-dim">
        {tx("A troca em vídeo não está configurada (FAL_KEY).")}
      </p>
    );

  async function escolherVideo(file: File) {
    const regras = STORAGE_KINDS.videos;
    if (!(regras.types as readonly string[]).includes(file.type))
      return setErro(tx("Envie um vídeo MP4, MOV ou WebM."));
    if (file.size > regras.maxBytes)
      return setErro(tx("O vídeo passa de 500 MB."));
    setErro(null);
    setAviso(null);
    setEnviandoVideo(0);
    try {
      const key = await uploadFile(file, "videos", (p) => setEnviandoVideo(p));
      setVideo({ key, src: URL.createObjectURL(file) });
      setLink(null);
      setDuracao(0);
      setCortes([]);
      setCorte(0);
      setMarcas([]);
      setQuem({});
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviandoVideo(null);
    }
  }

  function usarLink(l: VideoLink) {
    setColandoLink(false);
    setLink(l);
    setVideo(null);
    setDireitos(false);
    setDuracao(l.duracao);
    setCortes([]);
    setCorte(0);
    setMarcas([]);
    setQuem({});
    setErro(null);
    setAviso(null);
  }

  async function enviar() {
    if ((!video && !link) || falta || (link && !direitos)) return;
    setErro(null);
    setErroCode(null);
    setAviso(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/videos/substituir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...origem,
          direitos: link ? direitos : undefined,
          imageKey: marcas.length ? undefined : principal?.key,
          pessoas: marcas.length
            ? marcas.map((m) => ({
                x: m.x,
                y: m.y,
                t: m.t,
                imageKey: quem[m.id].key,
              }))
            : undefined,
          motor,
          qualidade: motor === "kling" ? qualidade : undefined,
          removerTexto,
          roupa,
          segundos: cortando ? corte : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
        code?: string;
      };
      avisarCreditos();
      if (!res.ok || !body.jobId) {
        setErroCode(body.code ?? null);
        return setErro(
          txErro(body.error ?? `Falha ao enviar (HTTP ${res.status}).`),
        );
      }
      setAviso(
        tx(
          "Vídeo enviado. Leva de 3 a 10 minutos; ele aparece no histórico abaixo e você recebe um aviso quando ficar pronto.",
        ),
      );
      onEnviado(body.jobId);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const modalLink = colandoLink ? (
    <LinkVideoModal
      onClose={() => setColandoLink(false)}
      onEncontrado={usarLink}
    />
  ) : null;

  if (!video && !link)
    return (
      <div className="grid gap-3">
        <EnviarOrigem
          titulo={tx("Envie o vídeo")}
          texto={tx(
            "Clique ou arraste um vídeo (MP4, MOV ou WebM, até 60s). Depois marque quem trocar e envie a imagem de quem entra no lugar — cenário, câmera e áudio ficam iguais.",
          )}
          accept="video/mp4,video/quicktime,video/webm"
          enviando={enviandoVideo}
          onArquivo={escolherVideo}
          icone={<Film className="h-6 w-6" />}
        />
        <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-ink-mute">
          {tx("ou")}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setColandoLink(true)}
          >
            <Link2 className="h-4 w-4" /> {tx("Colar o link de um vídeo")}
          </Button>
        </div>
        {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}
        {modalLink}
      </div>
    );

  return (
    <section className="grid overflow-hidden rounded-2xl border border-line bg-panel lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Lê a duração para estimar o custo (o servidor mede de novo). O link já traz a dele. */}
      {video ? (
        <video
          src={video.src}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration || 0)}
        />
      ) : null}
      {modalLink}

      {/* Esquerda: o vídeo, para marcar quem trocar */}
      <div className="flex h-[62svh] min-h-0 flex-col gap-2 p-4 sm:p-5 lg:h-[680px]">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
            {link
              ? `${link.plataforma}${link.autor ? ` · @${link.autor}` : ""}`
              : tx("Quem trocar no vídeo")}
          </span>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setColandoLink(true)}
              disabled={enviando || enviandoVideo !== null}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-mute hover:text-ink disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" />
              {link ? tx("Outro link") : tx("Colar link")}
            </button>
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-ink-mute hover:text-ink",
                (enviando || enviandoVideo !== null) &&
                  "pointer-events-none opacity-50",
              )}
            >
              {enviandoVideo !== null ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {enviandoVideo !== null
                ? `${Math.round(enviandoVideo * 100)}%`
                : tx("Outro vídeo")}
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void escolherVideo(f);
                }}
              />
            </label>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {!srcVideo ? (
            // Link sem prévia: não dá para marcar; a IA troca a pessoa principal.
            link?.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={link.thumb}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full rounded-xl object-contain"
              />
            ) : (
              <div className="grid h-full place-items-center rounded-xl bg-black p-6 text-center text-[13px] text-ink-dim">
                {tx("Vídeo carregado (sem prévia disponível).")}
              </div>
            )
          ) : (
            <VideoMarcador
              src={srcVideo}
              marcas={marcas}
              onMarcar={(x, y, t) => {
                const nova = marcaSemPersonagem(x, y, t);
                setMarcas((m) => [...m, nova]);
                void buscarMascara(origem, nova).then((r) =>
                  setMarcas((m) =>
                    m.map((z) => (z.id === nova.id ? { ...z, ...r } : z)),
                  ),
                );
              }}
              onRemover={(id) => setMarcas((m) => m.filter((x) => x.id !== id))}
            />
          )}
        </div>
      </div>

      {/* Direita: quem entra, opções, preço e botão */}
      <aside className="flex min-h-0 flex-col border-t border-line lg:h-[680px] lg:border-l lg:border-t-0">
        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-4 sm:p-5">
          {link ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-bg px-3 py-2.5 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={direitos}
                onChange={(e) => setDireitos(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span>
                {DECLARACAO_VIDEO_LINK}{" "}
                <span className="text-ink-dim">{tx("(obrigatório)")}</span>
              </span>
            </label>
          ) : null}
          {marcas.length === 0 ? (
            <div className="grid gap-2">
              <div className="text-[13px] font-semibold text-ink">
                {tx("Quem entra no lugar")}
              </div>
              <QuemEntra valor={principal} onChange={setPrincipal} />
              <p className="text-[11px] text-ink-dim">
                {tx(
                  "Sem marcar ninguém, a IA troca a pessoa principal do vídeo. Mais de uma pessoa? Pause e clique em cada uma.",
                )}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {marcas.map((m, i) => (
                <PessoaMarcada
                  key={m.id}
                  numero={i + 1}
                  valor={quem[m.id] ?? null}
                  onChange={(v) => setQuem((q) => ({ ...q, [m.id]: v }))}
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

          <Opcoes
            titulo={tx("Roupa")}
            valor={roupa}
            onChange={setRoupa}
            opcoes={[
              [
                "personagem",
                tx("Da imagem enviada"),
                tx("Entra com o look da imagem"),
              ],
              [
                "foto",
                tx("Do vídeo"),
                tx("Só a cabeça muda; a roupa original fica"),
              ],
            ]}
          />

          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={removerTexto}
              onChange={(e) => setRemoverTexto(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            {tx("Remover legendas e textos da tela")}
          </label>

          <p className="text-[11px] text-ink-dim">
            {tx(
              "Use só vídeos e imagens que você tem direito de usar e sinalize quando o resultado for sintético.",
            )}
          </p>

          {tomadas ? (
            <div className="rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-3 text-[12px] leading-relaxed text-ink-mute">
              <strong className="text-ink">
                {tx("Vídeo com cortes rápidos")} · {tomadas.length}{" "}
                {tx("tomadas")}
              </strong>{" "}
              {tx(
                "Cada tomada é trocada separadamente, e as mais curtas contam como 3 segundos cada — por isso o valor é maior que o da duração do vídeo. Tomada em que a pessoa marcada não aparece fica como no original e não é cobrada. Pode levar mais tempo que o normal.",
              )}
            </div>
          ) : null}
          {curtoDemais ? (
            <p className="text-[12px] text-pink">
              {tx("O vídeo precisa ter pelo menos")} {minimo}s.
            </p>
          ) : null}
          {bloqueio ? <ErroGeracao mensagem={bloqueio} code="PLANO" /> : null}
          {erro ? <ErroGeracao mensagem={erro} code={erroCode} /> : null}
          {aviso ? (
            <p className="rounded-xl border border-ok/40 bg-ok/10 px-3.5 py-3 text-[12.5px] text-ok">
              {aviso}
            </p>
          ) : null}
        </div>

        <footer className="grid shrink-0 gap-2 border-t border-line p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <SeletorModelo
              rotulo={tx("Modelo")}
              valor={modeloTroca}
              onChange={setModeloTroca}
              // Do mais caro para o mais barato (o Omni só com a chave do Gemini).
              opcoes={MODELOS_TROCA_IDS.filter(
                (id) => MODELOS_TROCA[id].motor !== "omni" || recursos.gemini,
              )
                .sort(
                  (a, b) => creditosPorSegundoTroca(b) - creditosPorSegundoTroca(a),
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
              falta ||
              curtoDemais ||
              marcaForaDoCorte ||
              !!bloqueio ||
              (!!link && !direitos)
            }
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {enviando ? tx("Preparando o vídeo…") : tx("Gerar vídeo")}
          </Button>
        </footer>
      </aside>
    </section>
  );
}
