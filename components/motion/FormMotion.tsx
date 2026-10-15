"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { avisarCreditos } from "@/components/creditos/CreditosProvider";
import { pilula } from "@/components/live/Preparar";
import { QuemAparece, type Quem } from "@/components/live/NovaSombra";
import { CriarProduto } from "@/components/produto/CriarProduto";
import { VideoReferencia, type ReferenciaEscolhida } from "./VideoReferencia";
import { QuemEntra, type ImagemEnviada } from "@/components/sombra/comum";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { SeletorModelo } from "@/components/ui/SeletorModelo";
import { cn } from "@/lib/cn";
import { DECLARACAO_REFERENCIA_MOTION } from "@/lib/declaracoes";
import { txErro } from "@/lib/i18n/erros";
import { tx } from "@/lib/i18n/tx";
import type { ItemMotion } from "@/lib/motion";
import type { ProdutoCriado } from "@/lib/produto-criado";
import type { Character } from "@/lib/types";
import {
  creditosMotion,
  esforcoDoModelo,
  estimativaMotion,
  MODELO_MOTION_PADRAO,
  MODELOS_MOTION,
  MODELOS_MOTION_IDS,
  ROTULO_ESFORCO,
  type EsforcoMotion,
  type ModeloMotion,
} from "@/worker/motion/modelos";
import {
  DURACOES_MOTION,
  duracaoDaReferencia,
  formatoMaisProximo,
  type FormatoMotion,
  type TipoMotion,
} from "@/worker/motion/tipos";

const TIPOS: Array<[TipoMotion, string]> = [
  ["site", "Site"],
  ["produto", "Produto"],
  ["influencer", "Influencer"],
  ["misto", "Influencer + produto ou site"],
  ["video", "A partir de um vídeo"],
];

/** No "a partir de um vídeo", o que mais entra no motion (opcional). */
const EXTRAS: Array<["produto" | "influencer" | "site", string]> = [
  ["produto", "Produto"],
  ["influencer", "Influencer"],
  ["site", "Site"],
];

const FORMATOS: Array<[FormatoMotion, string]> = [
  ["9:16", "9:16 · Reels, TikTok"],
  ["16:9", "16:9 · YouTube"],
  ["1:1", "1:1 · Feed"],
];


/** O pedido de um motion novo. Cria o pedido na fila do worker e avisa a tela. */
export function FormMotion({
  personagens,
  onCriado,
}: {
  personagens: Character[];
  onCriado: (m: ItemMotion) => void;
}) {
  const [tipo, setTipo] = useState<TipoMotion>("produto");
  const [url, setUrl] = useState("");
  const [produto, setProduto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [fotos, setFotos] = useState<Array<ImagemEnviada | null>>([null]);
  /** De onde vem o produto: fotos enviadas ou um produto criado em 3D (o mesmo da tela de vídeo de produto). */
  const [origem, setOrigem] = useState<"foto" | "criar">("foto");
  const [criado, setCriado] = useState<ProdutoCriado | null>(null);
  /** O que o produto criado escreveu nos campos (trocar de produto só sobrescreve isso). */
  const [auto, setAuto] = useState({ nome: "", descricao: "" });
  const [quem, setQuem] = useState<Quem>({ characterId: personagens[0]?.id ?? null, imageKey: null });
  const [foto, setFoto] = useState<ImagemEnviada | null>(null);
  const [recortar, setRecortar] = useState(true);
  const [brief, setBrief] = useState("");
  const [formato, setFormato] = useState<FormatoMotion>("9:16");
  const [duracao, setDuracao] = useState<number>(15);
  const [modelo, setModelo] = useState<ModeloMotion>(MODELO_MOTION_PADRAO);
  const [esforco, setEsforco] = useState<EsforcoMotion>(MODELOS_MOTION[MODELO_MOTION_PADRAO].padrao);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** "A partir de um vídeo": o vídeo de referência, o áudio dele como música e o material que entra junto. */
  const [referencia, setReferencia] = useState<ReferenciaEscolhida | null>(null);
  const [usarAudio, setUsarAudio] = useState(true);
  const [extras, setExtras] = useState({ produto: false, influencer: false, site: false });

  const ehVideo = tipo === "video";
  const usaSite = tipo === "site" || tipo === "misto" || (ehVideo && extras.site);
  const usaProduto = tipo === "produto" || tipo === "misto" || (ehVideo && extras.produto);
  const usaInfluencer = tipo === "influencer" || tipo === "misto" || (ehVideo && extras.influencer);
  /** Com vídeo de referência, o motion dura o mesmo que ele. */
  const segundosReferencia = ehVideo && referencia ? referencia.duracao : 0;
  const keysProduto =
    origem === "criar"
      ? criado
        ? [criado.imageKey]
        : []
      : fotos.filter((f): f is ImagemEnviada => !!f).map((f) => f.key);
  const esforcos: readonly EsforcoMotion[] = MODELOS_MOTION[modelo].esforcos;

  // Imagens que o modelo vai ver: as enviadas (e os recortes) e as fotos do site.
  const imagens =
    (usaProduto ? keysProduto.length : 0) * (recortar ? 2 : 1) +
    (usaInfluencer && quem.imageKey ? (recortar ? 2 : 1) : 0) +
    (usaSite && url.trim() ? 3 : 0);
  const estimativa = estimativaMotion(modelo, esforco, imagens, segundosReferencia);

  const temProduto = produto.trim().length >= 2 && keysProduto.length > 0;
  const temSite = url.trim().length >= 4;
  const pronto =
    tipo === "site"
      ? temSite
      : tipo === "produto"
        ? temProduto
        : tipo === "influencer"
          ? !!quem.imageKey
          : tipo === "video"
            ? !!referencia &&
              (!extras.produto || temProduto) &&
              (!extras.influencer || !!quem.imageKey) &&
              (!extras.site || temSite)
            : !!quem.imageKey && (temProduto || temSite);

  function escolherModelo(m: ModeloMotion) {
    setModelo(m);
    const lista: readonly EsforcoMotion[] = MODELOS_MOTION[m].esforcos;
    if (!lista.includes(esforco)) setEsforco(MODELOS_MOTION[m].padrao);
  }

  async function gerar() {
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch("/api/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          brief,
          formato,
          duracao: ehVideo && referencia ? duracaoDaReferencia(referencia.duracao) : duracao,
          modelo,
          esforco,
          recortar,
          ...(ehVideo && referencia
            ? {
                referencia: {
                  key: referencia.key,
                  origem: referencia.origem,
                  url: referencia.url,
                  titulo: referencia.titulo,
                  usarAudio,
                  declaracao: DECLARACAO_REFERENCIA_MOTION,
                },
              }
            : {}),
          ...(usaSite && temSite ? { site: { url: url.trim() } } : {}),
          ...(usaProduto && temProduto ? { produto: { nome: produto, descricao, keys: keysProduto } } : {}),
          ...(usaInfluencer && quem.imageKey
            ? { influencer: { characterId: quem.characterId, imageKey: quem.imageKey } }
            : {}),
        }),
      });
      const b = await r.json().catch(() => ({}));
      avisarCreditos();
      if (!r.ok) return setErro(txErro(b.error ?? `Falha (HTTP ${r.status}).`));
      onCriado(b.motion);
    } catch {
      setErro(tx("Sem conexão. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="label-cap">{tx("O que mostrar")}</span>
        <div className="flex flex-wrap gap-1.5">
          {TIPOS.map(([t, rotulo]) => (
            <button key={t} type="button" onClick={() => setTipo(t)} className={cn(pilula(tipo === t), "h-8 px-3 cursor-pointer")}>
              {tx(rotulo)}
            </button>
          ))}
        </div>
      </div>

      {ehVideo ? (
        <>
          <div className="grid gap-2">
            <span className="label-cap">{tx("Vídeo de referência")}</span>
            <VideoReferencia
              valor={referencia}
              onChange={(r) => {
                setReferencia(r);
                // O formato acompanha o do vídeo (dá para trocar embaixo).
                if (r) setFormato(formatoMaisProximo(r.largura, r.altura));
              }}
              usarAudio={usarAudio}
              onUsarAudio={setUsarAudio}
            />
          </div>
          <div className="grid gap-2">
            <span className="label-cap">
              {tx("Colocar no motion")} <span className="font-normal normal-case tracking-normal text-ink-dim">· {tx("opcional")}</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EXTRAS.map(([e, rotulo]) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={extras[e]}
                  onClick={() => setExtras((x) => ({ ...x, [e]: !x[e] }))}
                  className={cn(pilula(extras[e]), "h-8 px-3 cursor-pointer")}
                >
                  {tx(rotulo)}
                </button>
              ))}
            </div>
            <span className="text-[12px] text-ink-dim">
              {tx("O que você escolher entra no lugar do conteúdo do vídeo. Sem nada, o motion recria o vídeo.")}
            </span>
          </div>
        </>
      ) : null}

      {usaInfluencer ? (
        <div className="grid gap-2">
          <span className="label-cap">{tx("Influencer")}</span>
          <QuemAparece personagens={personagens} valor={quem} onChange={setQuem} foto={foto} onFoto={setFoto} />
        </div>
      ) : null}

      {usaProduto ? (
        <div className="grid gap-2">
          <span className="label-cap">{tx("Produto")}</span>
          <Input
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            maxLength={120}
            placeholder={tx("Nome do produto")}
          />
          <Input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={400}
            placeholder={tx("O que é e o que tem de bom (opcional)")}
          />
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["foto", "Foto"],
                ["criar", "Criar produto"],
              ] as const
            ).map(([o, rotulo]) => (
              <button key={o} type="button" onClick={() => setOrigem(o)} className={cn(pilula(origem === o), "h-8 px-3 cursor-pointer")}>
                {tx(rotulo)}
              </button>
            ))}
          </div>
          {origem === "criar" ? (
            <CriarProduto
              escolhido={criado?.id ?? null}
              onEscolher={(p) => {
                setCriado(p);
                if (!p) return;
                // Preenche nome e descrição sem apagar o que a pessoa escreveu.
                const nome = p.nome.slice(0, 120);
                const desc = p.descricao.slice(0, 400);
                if (!produto.trim() || produto === auto.nome) setProduto(nome);
                if (!descricao.trim() || descricao === auto.descricao) setDescricao(desc);
                setAuto({ nome, descricao: desc });
              }}
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {fotos.map((f, i) => (
                <QuemEntra
                  key={i}
                  valor={f}
                  onChange={(nova) =>
                    setFotos((l) => {
                      const lista = l.map((x, j) => (j === i ? nova : x));
                      // Até 3 fotos: a próxima vaga aparece quando esta é enviada.
                      return lista.length < 3 && lista.every(Boolean) ? [...lista, null] : lista;
                    })
                  }
                  textos={{
                    enviada: "Foto do produto",
                    enviar: "Enviar uma foto do produto",
                    dica: "Até 3 fotos. Fundo limpo, o produto inteiro.",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {usaSite ? (
        <label className="grid gap-1.5">
          <span className="label-cap">{tx("Site")}</span>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://" inputMode="url" />
          <span className="text-[12px] text-ink-dim">
            {tx("O worker abre o site, tira fotos no computador e no celular e lê os textos e as cores.")}
          </span>
        </label>
      ) : null}

      {usaProduto || usaInfluencer ? (
        <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
          <input type="checkbox" checked={recortar} onChange={(e) => setRecortar(e.target.checked)} />
          {tx("Recortar o fundo das fotos (para flutuarem na animação)")}
        </label>
      ) : null}

      <label className="grid gap-1.5">
        <span className="label-cap">
          {tx("O que o motion deve dizer")}
          {ehVideo ? <span className="font-normal normal-case tracking-normal text-ink-dim"> · {tx("opcional")}</span> : null}
        </span>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          maxLength={3000}
          placeholder={
            ehVideo
              ? tx("O que mudar em relação ao vídeo: textos, marca, cores, chamada final… Vazio: recria o vídeo com o seu material.")
              : tx("Mensagem, textos na tela, chamada final, estilo, cores… Ex.: lançamento do tênis Aurora, leve e confortável, frete grátis, termina com “Compre agora”.")
          }
        />
      </label>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <div className="grid gap-2">
          <span className="label-cap">{tx("Formato")}</span>
          <div className="flex flex-wrap gap-1.5">
            {FORMATOS.map(([f, rotulo]) => (
              <button key={f} type="button" onClick={() => setFormato(f)} className={cn(pilula(formato === f), "h-8 px-3 cursor-pointer")}>
                {tx(rotulo)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <span className="label-cap">{tx("Duração")}</span>
          {ehVideo ? (
            <span className="flex h-8 items-center text-[13px] text-ink-mute">
              {referencia ? `${tx("Igual ao vídeo")} · ${duracaoDaReferencia(referencia.duracao)}s` : tx("Igual ao vídeo")}
            </span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {DURACOES_MOTION.map((d) => (
                <button key={d} type="button" onClick={() => setDuracao(d)} className={cn(pilula(duracao === d), "h-8 px-3 cursor-pointer")}>
                  {d}s
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <span className="label-cap">{tx("Esforço")}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {esforcos.map((e) => (
            <button key={e} type="button" onClick={() => setEsforco(e)} className={cn(pilula(esforco === e), "h-8 px-3 cursor-pointer")}>
              {tx(ROTULO_ESFORCO[e])}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-ink-dim">
          {tx("Mais esforço: o modelo pensa mais antes de escrever — animação mais caprichada, mais cara e mais demorada.")}
        </span>
      </div>

      {erro ? <p className="text-[13px] text-pink">{erro}</p> : null}

      <div className="-mx-4 -mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-4 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
        <div className="mr-auto flex flex-wrap items-center gap-3">
          <SeletorModelo
            opcoes={MODELOS_MOTION_IDS.map((m) => ({
              id: m,
              label: MODELOS_MOTION[m].rotulo,
              nota: tx(MODELOS_MOTION[m].nota),
              preco: `~${creditosMotion(estimativaMotion(m, esforcoDoModelo(m, esforco), imagens, segundosReferencia))} ${tx("créditos")}`,
            }))}
            valor={modelo}
            onChange={escolherModelo}
            rotulo={tx("Modelo")}
          />
          <span className="text-[12px] text-ink-dim" title={tx("Estimativa, reservada ao gerar. Quando ficar pronto, vale o custo real: a sobra volta e, se passar, cobra a diferença.")}>
            ~{creditosMotion(estimativa)} {tx("créditos")}
          </span>
        </div>
        <Button onClick={() => void gerar()} disabled={!pronto || enviando}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {tx("Gerar motion")}
        </Button>
      </div>
    </div>
  );
}
