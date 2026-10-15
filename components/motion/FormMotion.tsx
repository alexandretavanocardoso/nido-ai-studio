"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { pilula } from "@/components/live/Preparar";
import { QuemAparece, type Quem } from "@/components/live/NovaSombra";
import { QuemEntra, type ImagemEnviada } from "@/components/sombra/comum";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { tx } from "@/lib/i18n/tx";
import type { ItemMotion } from "@/lib/motion";
import type { Character } from "@/lib/types";
import {
  estimativaMotion,
  MODELO_MOTION_PADRAO,
  MODELOS_MOTION,
  MODELOS_MOTION_IDS,
  ROTULO_ESFORCO,
  type EsforcoMotion,
  type ModeloMotion,
} from "@/worker/motion/modelos";
import { DURACOES_MOTION, type FormatoMotion, type TipoMotion } from "@/worker/motion/tipos";

const TIPOS: Array<[TipoMotion, string]> = [
  ["site", "Site"],
  ["produto", "Produto"],
  ["influencer", "Influencer"],
  ["misto", "Influencer + produto ou site"],
];

const FORMATOS: Array<[FormatoMotion, string]> = [
  ["9:16", "9:16 · Reels, TikTok"],
  ["16:9", "16:9 · YouTube"],
  ["1:1", "1:1 · Feed"],
];

const usd = (v: number) => `US$ ${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`.replace(".", ",");

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

  const usaSite = tipo === "site" || tipo === "misto";
  const usaProduto = tipo === "produto" || tipo === "misto";
  const usaInfluencer = tipo === "influencer" || tipo === "misto";
  const keysProduto = fotos.filter((f): f is ImagemEnviada => !!f).map((f) => f.key);
  const esforcos: readonly EsforcoMotion[] = MODELOS_MOTION[modelo].esforcos;

  // Imagens que o modelo vai ver: as enviadas (e os recortes) e as fotos do site.
  const imagens =
    (usaProduto ? keysProduto.length : 0) * (recortar ? 2 : 1) +
    (usaInfluencer && quem.imageKey ? (recortar ? 2 : 1) : 0) +
    (usaSite && url.trim() ? 3 : 0);
  const estimativa = estimativaMotion(modelo, esforco, imagens);

  const temProduto = produto.trim().length >= 2 && keysProduto.length > 0;
  const temSite = url.trim().length >= 4;
  const pronto =
    tipo === "site"
      ? temSite
      : tipo === "produto"
        ? temProduto
        : tipo === "influencer"
          ? !!quem.imageKey
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
      const r = await fetch("/api/admin/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          brief,
          formato,
          duracao,
          modelo,
          esforco,
          recortar,
          ...(usaSite && temSite ? { site: { url: url.trim() } } : {}),
          ...(usaProduto && temProduto ? { produto: { nome: produto, descricao, keys: keysProduto } } : {}),
          ...(usaInfluencer && quem.imageKey
            ? { influencer: { characterId: quem.characterId, imageKey: quem.imageKey } }
            : {}),
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(b.error ?? `Falha (HTTP ${r.status}).`);
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
        <span className="label-cap">{tx("O que o motion deve dizer")}</span>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          maxLength={3000}
          placeholder={tx("Mensagem, textos na tela, chamada final, estilo, cores… Ex.: lançamento do tênis Aurora, leve e confortável, frete grátis, termina com “Compre agora”.")}
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
          <div className="flex flex-wrap gap-1.5">
            {DURACOES_MOTION.map((d) => (
              <button key={d} type="button" onClick={() => setDuracao(d)} className={cn(pilula(duracao === d), "h-8 px-3 cursor-pointer")}>
                {d}s
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <span className="label-cap">{tx("Modelo")}</span>
        <Select value={modelo} onChange={(e) => escolherModelo(e.target.value as ModeloMotion)} aria-label={tx("Modelo")}>
          {MODELOS_MOTION_IDS.map((m) => (
            <option key={m} value={m}>
              {MODELOS_MOTION[m].rotulo} — {tx(MODELOS_MOTION[m].nota)} · US$ {MODELOS_MOTION[m].entrada} / {MODELOS_MOTION[m].saida}{" "}
              {tx("por milhão de tokens")}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-ink-dim">{tx("Esforço")}</span>
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
        <span className="mr-auto text-[12.5px] text-ink-dim">
          {tx("Estimativa")}: ~{usd(estimativa)} · {tx("o custo real aparece quando ficar pronto")}
        </span>
        <Button onClick={() => void gerar()} disabled={!pronto || enviando}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {tx("Gerar motion")}
        </Button>
      </div>
    </div>
  );
}
