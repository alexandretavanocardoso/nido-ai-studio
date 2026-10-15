"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, Wand2, X } from "lucide-react";
import type { VideoDeProduto } from "@/app/api/produto/route";
import { useAuth } from "@/components/auth/AuthProvider";
import { avisarCreditos, useCreditos } from "@/components/creditos/CreditosProvider";
import { ErroGeracao } from "@/components/creditos/ErroGeracao";
import { Colunas, pilula } from "@/components/live/Preparar";
import { QuemAparece, type Quem } from "@/components/live/NovaSombra";
import { VozBiblioteca, type VozEscolhida } from "@/components/live/VozBiblioteca";
import { useRecursos } from "@/components/RecursosProvider";
import { QuemEntra, type ImagemEnviada } from "@/components/sombra/comum";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { SeletorModelo } from "@/components/ui/SeletorModelo";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import { dinheiro } from "@/lib/moeda";
import { bloqueioCriarVideo, bloqueioVideoFalado, PLANOS } from "@/lib/planos";
import {
  cenasDoProduto,
  creditosProduto,
  custoProduto,
  DURACOES_PRODUTO,
  MAX_FOTOS_PRODUTO,
  MODELOS_FALADO_PRODUTO,
  MODELOS_MUDO_PRODUTO,
  PRODUTO_MAX_CARACTERES,
  type CenaProduto,
  type ModoProduto,
} from "@/lib/produto";
import { useCharacters } from "@/lib/store";
import type { Character } from "@/lib/types";
import {
  MODELOS_CRIAR,
  MODELOS_FALADO,
  modeloPadraoCriar,
  provedorCriar,
  provedorFalado,
  type ModeloCriar,
  type ModeloFalado,
} from "@/lib/video/precos";
import { EscolherMusica, type MusicaEscolhida } from "@/components/musica/EscolherMusica";
import { HistoricoProduto } from "./HistoricoProduto";
import { RoteiroProduto } from "./RoteiroProduto";

/** Ideias rápidas de cenário (preenchem o campo). */
const CENARIOS = [
  "num quarto aconchegante com luz natural",
  "numa cozinha moderna e clara",
  "num estúdio com fundo liso colorido",
  "ao ar livre, num parque ensolarado",
  "num banheiro claro, em frente ao espelho",
];

/**
 * /app/produto — vídeo de produto: o influencer (um personagem ou uma foto)
 * mostrando e usando o produto, com ou sem fala, até 60s. Primeiro a IA monta
 * as cenas (dá para editar), depois o vídeo é gerado cena a cena.
 */
export function VideoProduto() {
  const { user } = useAuth();
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const personagens = useCharacters((s) => s.characters);

  const [quem, setQuem] = useState<Quem>({
    characterId: personagens[0]?.id ?? null,
    imageKey: null,
  });
  const [foto, setFoto] = useState<ImagemEnviada | null>(null);
  /** Fotos do produto: a primeira é obrigatória; a vaga seguinte aparece quando a anterior é enviada. */
  const [fotosProduto, setFotosProduto] = useState<Array<ImagemEnviada | null>>([null]);
  const produtoKeys = fotosProduto.filter((f): f is ImagemEnviada => !!f).map((f) => f.key);
  const [produto, setProduto] = useState("");
  const [cenario, setCenario] = useState("");
  const [detalhes, setDetalhes] = useState("");
  const [modo, setModo] = useState<ModoProduto>("falado");
  const [falas, setFalas] = useState("");
  const [voz, setVoz] = useState<VozEscolhida | null>(null);
  const [duracao, setDuracao] = useState<number>(15);
  const [vertical, setVertical] = useState(true);
  const [audio, setAudio] = useState(false);
  const [musica, setMusica] = useState<MusicaEscolhida | null>(null);

  // Só os modelos que algum serviço configurado neste deploy gera.
  const falados = MODELOS_FALADO_PRODUTO.filter(
    (m) => recursos.voz && recursos[provedorFalado(m)],
  );
  const mudos = MODELOS_MUDO_PRODUTO.filter((m) => provedorCriar(m, recursos));
  const [modeloFalado, setModeloFalado] = useState<ModeloFalado>(
    falados.includes("seedance20_mini") ? "seedance20_mini" : (falados[0] ?? "seedance20_mini"),
  );
  const [modeloMudo, setModeloMudo] = useState<ModeloCriar>(() => {
    const padrao = modeloPadraoCriar(recursos);
    return mudos.includes(padrao) ? padrao : (mudos[0] ?? padrao);
  });
  const modelo = modo === "falado" ? modeloFalado : modeloMudo;

  /** Cenas montadas pela IA, e para qual escolha (modo, modelo, duração) foram montadas. */
  const [cenas, setCenas] = useState<CenaProduto[] | null>(null);
  const [planoDe, setPlanoDe] = useState("");
  const [montando, setMontando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; code?: string } | null>(null);
  const [videos, setVideos] = useState<VideoDeProduto[]>([]);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/produto", { cache: "no-store" }).catch(() => null);
    const b = await r?.json().catch(() => null);
    if (r?.ok && b) setVideos(b.videos ?? []);
  }, []);
  useEffect(() => {
    if (user) void carregar();
  }, [user, carregar]);

  const chave = `${modo}:${modelo}:${duracao}`;
  const segundos = cenasDoProduto(modo, modelo, duracao);
  const pro = conta ? PLANOS[conta.plano].qualidadePro : true;
  const comAudio = modo === "mudo" && MODELOS_CRIAR[modeloMudo].audio && audio;
  const preco = (m: string) => {
    const o = { modo, modelo: m, duracao, audio: comAudio, pro };
    return conta
      ? `${creditosProduto(o)} ${tx("créditos")}`
      : `~${dinheiro(custoProduto(o), { de: "USD" })}`;
  };
  const bloqueio = !conta
    ? null
    : modo === "falado"
      ? bloqueioVideoFalado(conta.plano)
      : bloqueioCriarVideo(conta.plano, modeloMudo, comAudio);
  const semModelo = modo === "falado" ? !falados.length : !mudos.length;
  const prontoParaMontar =
    !!quem.imageKey && produtoKeys.length > 0 && produto.trim().length >= 2 && !semModelo;
  const cenasValem = !!cenas && planoDe === chave;
  const prontoParaGerar =
    cenasValem &&
    !bloqueio &&
    cenas!.every((c) => c.cena.trim().length >= 3) &&
    (modo === "mudo" || (!!voz && cenas!.every((c) => (c.fala ?? "").trim().length >= 2)));

  async function montar() {
    setErro(null);
    setMontando(true);
    try {
      const r = await fetch("/api/produto/roteiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto,
          cenario,
          detalhes,
          falas: modo === "falado" ? falas : "",
          modo,
          modelo,
          duracao,
          // A IA olha as fotos para descrever o produto como ele é.
          imageKey: quem.imageKey ?? undefined,
          produtoKeys,
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) return setErro({ mensagem: txErro(b.error ?? `Falha (HTTP ${r.status}).`), code: b.code });
      setCenas(b.cenas);
      setPlanoDe(chave);
      avisarCreditos();
    } catch {
      setErro({ mensagem: tx("Sem conexão. Tente de novo.") });
    } finally {
      setMontando(false);
    }
  }

  async function gerar() {
    if (!cenas || !produtoKeys.length || !quem.imageKey) return;
    setErro(null);
    setGerando(true);
    try {
      const r = await fetch("/api/produto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: quem.characterId,
          imageKey: quem.imageKey,
          produtoKeys,
          produto,
          modo,
          modelo,
          duracao,
          vertical,
          audio: comAudio,
          voiceId: modo === "falado" ? voz?.voiceId : undefined,
          cenas: cenas.map((c) => (modo === "falado" ? c : { cena: c.cena })),
          musica: musica ?? undefined,
        }),
      });
      const b = await r.json().catch(() => ({}));
      avisarCreditos();
      if (!r.ok) return setErro({ mensagem: txErro(b.error ?? `Falha (HTTP ${r.status}).`), code: b.code });
      setCenas(null);
      await carregar();
    } catch {
      setErro({ mensagem: tx("Sem conexão. Tente de novo.") });
    } finally {
      setGerando(false);
    }
  }

  const opcoesModelo =
    modo === "falado"
      ? falados.map((id) => ({ id, label: MODELOS_FALADO[id].label, nota: tx(MODELOS_FALADO[id].nota), preco: preco(id) }))
      : mudos.map((id) => ({ id, label: MODELOS_CRIAR[id].label, nota: tx(MODELOS_CRIAR[id].nota), preco: preco(id) }));
  const character = personagens.find((c) => c.id === quem.characterId) ?? null;

  return (
    <main className="mx-auto grid w-full max-w-[1240px] gap-6 px-4 pb-16 pt-2 sm:px-6 lg:px-10">
      <header className="grid gap-1">
        <h1 className="display text-2xl uppercase text-ink">{tx("Vídeo de produto")}</h1>
        <p className="max-w-2xl text-[14px] text-ink-mute">
          {tx("O influencer mostrando e usando o seu produto, com ou sem fala, em até 60 segundos.")}
        </p>
      </header>

      {user === null ? null : !user ? (
        <div className="card p-8 text-center text-ink-mute">
          <Link href="/auth/login" className="font-bold text-accent">
            {tx("Entre na sua conta")}
          </Link>
        </div>
      ) : !recursos.armazenamento ? (
        <p className="text-[13px] text-ink-dim">{tx("O vídeo de produto precisa do armazenamento configurado.")}</p>
      ) : (
        <>
          <section className="card grid gap-6 p-4 sm:p-6">
            <Colunas
              imagem={
                <>
                  <div className="grid gap-2">
                    <span className="label-cap">{tx("Quem aparece")}</span>
                    <QuemAparece
                      personagens={personagens}
                      valor={quem}
                      onChange={(q) => {
                        setQuem(q);
                        if (q.characterId !== quem.characterId) setVoz(null);
                      }}
                      foto={foto}
                      onFoto={setFoto}
                    />
                  </div>
                  <div className="grid gap-2">
                    <span className="label-cap">{tx("Produto")}</span>
                    {fotosProduto.map((f, i) => (
                      <div key={i} className="relative">
                        <QuemEntra
                          valor={f}
                          onChange={(nova) =>
                            setFotosProduto((l) => {
                              const lista = l.map((x, j) => (j === i ? nova : x));
                              // A próxima vaga aparece quando esta é enviada (até MAX_FOTOS_PRODUTO).
                              return lista.length < MAX_FOTOS_PRODUTO && lista.every(Boolean) ? [...lista, null] : lista;
                            })
                          }
                          textos={
                            i === 0
                              ? {
                                  enviada: "Foto do produto",
                                  enviar: "Enviar a foto do produto",
                                  dica: "O produto inteiro, com o rótulo legível. Fundo limpo funciona melhor.",
                                }
                              : {
                                  enviada: "Outra foto do produto",
                                  enviar: "Enviar outra foto (opcional)",
                                  dica: "Outro ângulo ou um detalhe (rótulo, textura). Ajuda a IA a acertar o produto.",
                                }
                          }
                        />
                        {i > 0 && f ? (
                          <button
                            type="button"
                            onClick={() =>
                              setFotosProduto((l) => {
                                const resto = l.filter((_, j) => j !== i);
                                return resto.every(Boolean) && resto.length < MAX_FOTOS_PRODUTO ? [...resto, null] : resto;
                              })
                            }
                            aria-label={tx("Remover foto")}
                            title={tx("Remover foto")}
                            className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-line bg-bg text-ink-mute hover:text-ink cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              }
              resto={
                <>
                  <label className="grid gap-1.5">
                    <span className="label-cap">{tx("Qual é o produto")}</span>
                    <Input
                      value={produto}
                      onChange={(e) => setProduto(e.target.value)}
                      maxLength={PRODUTO_MAX_CARACTERES}
                      placeholder={tx("Ex.: Tênis Aurora, de couro branco, para o dia a dia")}
                    />
                  </label>

                  <div className="grid gap-1.5">
                    <span className="label-cap">{tx("Cenário")}</span>
                    <Input
                      value={cenario}
                      onChange={(e) => setCenario(e.target.value)}
                      maxLength={400}
                      placeholder={tx("Onde o vídeo acontece (vazio: a IA escolhe)")}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {CENARIOS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setCenario(tx(s))}
                          className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-mute hover:border-line-strong hover:text-ink cursor-pointer"
                        >
                          {tx(s)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <span className="label-cap">{tx("Fala")}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["falado", "Com fala"],
                          ["mudo", "Sem fala"],
                        ] as const
                      ).map(([m, rotulo]) => (
                        <button key={m} type="button" onClick={() => setModo(m)} className={cn(pilula(modo === m), "h-8 px-3 cursor-pointer")}>
                          {tx(rotulo)}
                        </button>
                      ))}
                    </div>
                    {modo === "falado" ? (
                      <>
                        <Textarea
                          value={falas}
                          onChange={(e) => setFalas(e.target.value)}
                          rows={3}
                          maxLength={1000}
                          placeholder={tx("O que a pessoa fala. Deixe vazio e a IA escreve a partir do produto.")}
                        />
                        <EscolherVoz character={character} valor={voz} onChange={setVoz} />
                      </>
                    ) : null}
                  </div>

                  <label className="grid gap-1.5">
                    <span className="label-cap">{tx("Detalhes")}</span>
                    <Textarea
                      value={detalhes}
                      onChange={(e) => setDetalhes(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder={tx("Como usa o produto, o que destacar, o estilo do vídeo… (opcional)")}
                    />
                  </label>

                  <div className="grid gap-2">
                    <span className="label-cap">{tx("Música de fundo")} <span className="font-normal normal-case tracking-normal text-ink-dim">· {tx("opcional")}</span></span>
                    <EscolherMusica
                      valor={musica}
                      onChange={setMusica}
                      dica={modo === "falado" ? "A música fica mais baixa enquanto a pessoa fala." : undefined}
                    />
                  </div>

                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <div className="grid gap-2">
                      <span className="label-cap">{tx("Duração")}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {DURACOES_PRODUTO.map((d) => (
                          <button key={d} type="button" onClick={() => setDuracao(d)} className={cn(pilula(duracao === d), "h-8 px-3 cursor-pointer")}>
                            {d}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <span className="label-cap">{tx("Formato")}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            [true, "Em pé · 9:16"],
                            [false, "Deitado · 16:9"],
                          ] as const
                        ).map(([v, rotulo]) => (
                          <button key={rotulo} type="button" onClick={() => setVertical(v)} className={cn(pilula(vertical === v), "h-8 px-3 cursor-pointer")}>
                            {tx(rotulo)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {modo === "mudo" && MODELOS_CRIAR[modeloMudo].audio ? (
                    <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                      <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
                      {tx("Som ambiente gerado pelo modelo")}
                    </label>
                  ) : null}
                </>
              }
            />

            <div className="-mx-4 -mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-4 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
              {semModelo ? (
                <span className="mr-auto text-[13px] text-ink-dim">
                  {modo === "falado"
                    ? tx("Nenhum modelo de vídeo falado configurado neste servidor.")
                    : tx("Nenhum modelo de vídeo configurado neste servidor.")}
                </span>
              ) : (
                <div className="mr-auto flex flex-wrap items-center gap-3">
                  <SeletorModelo
                    opcoes={opcoesModelo}
                    valor={modelo}
                    onChange={(id) => (modo === "falado" ? setModeloFalado(id as ModeloFalado) : setModeloMudo(id as ModeloCriar))}
                    rotulo={tx("Modelo")}
                  />
                  <span className="text-[12px] text-ink-dim">
                    {segundos.length} {segundos.length > 1 ? tx("cenas") : tx("cena")} · {preco(modelo)}
                  </span>
                </div>
              )}
              <Button variant={cenasValem ? "ghost" : "primary"} onClick={() => void montar()} disabled={!prontoParaMontar || montando || gerando}>
                {montando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {cenasValem ? tx("Montar de novo") : tx("Montar cenas")}
              </Button>
            </div>
          </section>

          {bloqueio ? <p className="text-[13px] text-pink">{tx(bloqueio)}</p> : null}
          {erro ? <ErroGeracao mensagem={erro.mensagem} code={erro.code} /> : null}

          {cenas ? (
            <RoteiroProduto
              cenas={cenas}
              onChange={setCenas}
              segundos={segundos}
              falado={modo === "falado"}
              aviso={
                !cenasValem ? (
                  <span className="text-pink">
                    {tx("Você mudou a duração, o modelo ou a fala: monte as cenas de novo.")}
                  </span>
                ) : (
                  `${cenas.length} ${cenas.length > 1 ? tx("cenas") : tx("cena")} · ${tx("Edite o que quiser antes de gerar.")}`
                )
              }
              rodape={
              <div className="-mx-4 -mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-4 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
                <span className="mr-auto text-[12.5px] text-ink-dim">
                  {modo === "falado" && !voz
                    ? tx("Escolha a voz para gerar.")
                    : tx("O vídeo fica pronto em alguns minutos e aparece abaixo.")}
                </span>
                <Button onClick={() => void gerar()} disabled={!prontoParaGerar || gerando || montando}>
                  {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {gerando ? tx("Preparando as cenas…") : `${tx("Gerar vídeo")} · ${preco(modelo)}`}
                </Button>
              </div>
              }
            />
          ) : null}

          <HistoricoProduto videos={videos} onMudou={carregar} />
        </>
      )}
    </main>
  );
}

/** A voz da fala: uma do personagem ou uma pronta da biblioteca. */
function EscolherVoz({
  character,
  valor,
  onChange,
}: {
  character: Character | null;
  valor: VozEscolhida | null;
  onChange: (v: VozEscolhida | null) => void;
}) {
  const [vozes, setVozes] = useState<VozEscolhida[]>([]);
  const [biblioteca, setBiblioteca] = useState(false);

  useEffect(() => {
    if (!character) return setVozes([]);
    let vivo = true;
    fetch(`/api/voz/${encodeURIComponent(character.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { vozes: [] }))
      .then((b: { vozes?: VozEscolhida[] }) => {
        if (!vivo) return;
        const lista = [
          ...(character.vozBiblioteca ? [character.vozBiblioteca] : []),
          ...(b.vozes ?? []).filter((v) => v.voiceId !== character.vozBiblioteca?.voiceId),
        ];
        setVozes(lista);
        // A voz do personagem já vem escolhida.
        if (lista[0]) onChange(lista[0]);
      })
      .catch(() => vivo && setVozes([]));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  const daLista = valor && vozes.some((v) => v.voiceId === valor.voiceId);
  return (
    <div className="grid gap-2">
      {vozes.length ? (
        <Select
          value={daLista ? valor!.voiceId : ""}
          onChange={(e) => onChange(vozes.find((v) => v.voiceId === e.target.value) ?? null)}
          aria-label={tx("Voz")}
        >
          {!daLista ? <option value="">{valor ? valor.nome : tx("Escolha uma voz")}</option> : null}
          {vozes.map((v) => (
            <option key={v.voiceId} value={v.voiceId}>
              {v.nome}
            </option>
          ))}
        </Select>
      ) : valor ? (
        <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
          <span className="text-ink-dim">{tx("Voz")}:</span>
          <b className="text-ink">{valor.nome}</b>
        </div>
      ) : null}
      {vozes.length || valor ? (
        <button
          type="button"
          onClick={() => setBiblioteca((b) => !b)}
          className="justify-self-start text-[12px] font-semibold text-accent hover:underline cursor-pointer"
        >
          {biblioteca ? tx("Fechar vozes prontas") : tx("Escolher uma voz pronta")}
        </button>
      ) : null}
      {biblioteca || (!vozes.length && !valor) ? (
        <VozBiblioteca
          onEscolher={(v) => {
            onChange(v);
            setBiblioteca(false);
          }}
        />
      ) : null}
    </div>
  );
}
