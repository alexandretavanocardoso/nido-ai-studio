"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MousePointerClick, Pause, Play, X } from "lucide-react";
import { nanoid } from "nanoid";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/cn";
import {
  EscolherImagemPersonagem,
  useImagensPersonagem,
} from "@/components/revisao/EscolherImagemPersonagem";
import { tx } from "@/lib/i18n/tx";
import { txErro } from "@/lib/i18n/erros";

export interface Marca {
  id: string;
  /** Clique em frações do quadro (0–1). */
  x: number;
  y: number;
  /** Instante do vídeo (s) em que a pessoa foi marcada. */
  t: number;
  characterId: string;
  imageKey: string | null;
  /** Silhueta da pessoa (PNG): indefinido = buscando · null = não deu, fica só o ponto. */
  mascara?: string | null;
  /** Por que a silhueta não veio (quando o servidor soube dizer). */
  aviso?: string;
}

export const MAX_MARCAS = 3;
export const CORES_MARCA = ["#dfff2a", "#38bdf8", "#f472b6"];

/** Primeira imagem do personagem (retrato gerado primeiro), pra já vir escolhida. */
export function primeiraImagem(c: Character | undefined): string | null {
  if (!c) return null;
  const doPersonagem = (c.geradas ?? []).filter((g) => g.tipo !== "troca");
  const retrato =
    doPersonagem.find((g) => g.tipo === "retrato") ?? doPersonagem[0];
  return retrato?.key ?? c.visual.referencias.find((r) => r.key)?.key ?? null;
}

export function novaMarca(
  x: number,
  y: number,
  t: number,
  personagem: Character,
): Marca {
  return {
    id: nanoid(6),
    x,
    y,
    t,
    characterId: personagem.id,
    imageKey: primeiraImagem(personagem),
  };
}

/** Pede a silhueta da pessoa clicada (só visual: se falhar, vem `mascara: null`). */
export async function buscarMascara(
  origem: { videoKey?: string; linkId?: string; fotoKey?: string },
  p: Pick<Marca, "x" | "y" | "t">,
): Promise<Pick<Marca, "mascara" | "aviso">> {
  try {
    const res = await fetch("/api/pessoas/marcar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...origem, x: p.x, y: p.y, t: p.t }),
      // Nunca deixa a marca "carregando" pra sempre: passou disso, fica só o ponto.
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      mascara?: string | null;
      aviso?: string;
    };
    return res.ok
      ? { mascara: body.mascara ?? null, aviso: body.aviso }
      : { mascara: null };
  } catch {
    return { mascara: null };
  }
}

/**
 * A marca por cima do quadro: a pessoa inteira pintada na cor da marca e, no
 * ponto clicado, o botão de desmarcar.
 */
function MarcaNoQuadro({
  marca,
  cor,
  onRemover,
}: {
  marca: Marca;
  cor: string;
  onRemover: () => void;
}) {
  const recorte = marca.mascara ? `url(${marca.mascara})` : null;
  return (
    <>
      {recorte ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background: cor,
            maskImage: recorte,
            WebkitMaskImage: recorte,
            maskSize: "100% 100%",
            WebkitMaskSize: "100% 100%",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
          }}
        />
      ) : null}
      <button
        type="button"
        onClick={onRemover}
        title={tx("Desmarcar")}
        aria-label={tx("Desmarcar")}
        className="absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full grid place-items-center text-bg shadow-lg ring-2 ring-black/40"
        style={{
          left: `${marca.x * 100}%`,
          top: `${marca.y * 100}%`,
          background: cor,
        }}
      >
        {marca.mascara === undefined ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <X className="w-3.5 h-3.5" strokeWidth={3} />
        )}
      </button>
    </>
  );
}

/** Aviso de que a silhueta não pôde ser desenhada (a marca continua valendo). */
function AvisoSilhueta({ marcas }: { marcas: Marca[] }) {
  const aviso = marcas.find((m) => m.aviso)?.aviso;
  return aviso ? (
    <p className="text-[12px] text-pink text-center shrink-0">
      {tx("Não deu para destacar a pessoa inteira:")} {txErro(aviso)}
    </p>
  ) : null;
}

/** Tamanho do elemento (atualiza ao redimensionar). */
function useTamanho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setTam({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, tam] as const;
}

/**
 * O vídeo ocupando todo o espaço disponível (sem cortar e sem rolagem), com
 * controle de tempo. Clique numa pessoa marca quem trocar (até 3): a pessoa
 * inteira fica pintada na cor da marca.
 */
export function VideoMarcador({
  src,
  marcas,
  onMarcar,
  onRemover,
}: {
  src: string;
  marcas: Marca[];
  onMarcar: (x: number, y: number, t: number) => void;
  onRemover: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [areaRef, area] = useTamanho<HTMLDivElement>();
  const [proporcao, setProporcao] = useState(9 / 16);
  const [duracao, setDuracao] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);
  /** O navegador não conseguiu abrir o vídeo (arquivo fora do ar ou formato que ele não toca). */
  const [semVideo, setSemVideo] = useState(false);
  /**
   * O arquivo da conta passa por uma rota que confere a sessão e redireciona
   * para o S3; de vez em quando essa primeira resposta falha e o vídeo não
   * abre. Antes de avisar, tenta de novo (até 3 vezes), sem usar o cache.
   */
  const [tentativa, setTentativa] = useState(0);
  const fonte =
    tentativa && src.startsWith("/")
      ? `${src}${src.includes("?") ? "&" : "?"}r=${tentativa}`
      : src;

  // Maior caixa com a proporção do vídeo que cabe na área.
  const largura = area.w && area.h ? Math.min(area.w, area.h * proporcao) : 0;
  const altura = largura / proporcao;

  function clicar(e: React.MouseEvent<HTMLDivElement>) {
    if (marcas.length >= MAX_MARCAS) return;
    const r = e.currentTarget.getBoundingClientRect();
    const v = videoRef.current;
    v?.pause();
    onMarcar(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      v?.currentTime ?? 0,
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div ref={areaRef} className="flex-1 min-h-0 grid place-items-center">
        <div
          className="relative rounded-xl overflow-hidden bg-black"
          style={{ width: largura, height: altura }}
        >
          <video
            ref={videoRef}
            src={fonte}
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-fill"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight)
                setProporcao(v.videoWidth / v.videoHeight);
              setDuracao(v.duration || 0);
              v.currentTime = Math.min(1, (v.duration || 0) / 3);
            }}
            onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
            onPlay={() => setTocando(true)}
            onPause={() => setTocando(false)}
            onLoadedData={() => setSemVideo(false)}
            onError={() => {
              if (tentativa < 3 && src.startsWith("/"))
                setTimeout(() => setTentativa((t) => t + 1), 700 * (tentativa + 1));
              else setSemVideo(true);
            }}
          />
          {semVideo ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-black p-5 text-center">
              <p className="text-[13px] leading-relaxed text-ink-mute">
                {tx(
                  "O navegador não conseguiu abrir este vídeo (arquivo indisponível ou formato que ele não toca, como HEVC/H.265). A troca ainda funciona: sem marcar ninguém, a IA troca a pessoa principal.",
                )}
              </p>
            </div>
          ) : null}
          <div
            className={cn(
              "absolute inset-0",
              marcas.length < MAX_MARCAS && "cursor-crosshair",
            )}
            onClick={clicar}
            role="button"
            aria-label={tx("Clique na pessoa que deve ser trocada")}
          />
          {/* A marca só aparece no quadro em que foi feita: ela identifica QUEM é a
              pessoa (a IA acompanha essa pessoa pelo vídeo todo, mesmo se mexendo). */}
          {marcas.map((m, i) =>
            Math.abs(tempo - m.t) < 0.35 ? (
              <MarcaNoQuadro
                key={m.id}
                marca={m}
                cor={CORES_MARCA[i]}
                onRemover={() => onRemover(m.id)}
              />
            ) : null,
          )}

          {/* Convite pra marcar (até a primeira marca). */}
          {marcas.length === 0 && (
            // Vídeo em pé deixa a caixa estreita: o aviso quebra em duas linhas em vez de ser cortado; com menos de 150px (celular deitado) fica só o ícone.
            <div className="pointer-events-none absolute inset-x-2 top-3 flex justify-center [container-type:inline-size]">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-2xl bg-black/75 px-3 py-1.5 text-[12px] font-semibold leading-tight text-white shadow-lg animate-pulse">
                <MousePointerClick className="w-4 h-4 shrink-0 text-accent" />
                <span className="hidden [@container(min-width:150px)]:inline">
                  {tx("Clique em quem você quer trocar")}
                </span>
              </span>
            </div>
          )}

          {/* Marcas feitas em outro momento: atalho pra voltar até elas. */}
          {marcas.some((m) => Math.abs(tempo - m.t) >= 0.35) && (
            <div className="absolute left-2 bottom-2 flex flex-wrap gap-1.5">
              {marcas.map((m, i) =>
                Math.abs(tempo - m.t) >= 0.35 ? (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (v) {
                        v.pause();
                        v.currentTime = m.t;
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-black/75 pl-1 pr-2 py-0.5 text-[11px] text-white hover:bg-black"
                    title={tx("Ver onde esta pessoa foi marcada")}
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: CORES_MARCA[i] }}
                    />
                    {tx("marcada em")} {m.t.toFixed(1)}s
                  </button>
                ) : null,
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() =>
            tocando
              ? videoRef.current?.pause()
              : // Sem fonte tocável o play() rejeita: o aviso já está na tela.
                void videoRef.current?.play().catch(() => setSemVideo(true))
          }
          className="h-8 w-8 rounded-full border border-line grid place-items-center text-ink-mute hover:text-ink shrink-0"
          aria-label={tocando ? tx("Pausar") : tx("Tocar")}
        >
          {tocando ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={duracao || 0}
          step={0.05}
          value={tempo}
          onChange={(e) => {
            const v = videoRef.current;
            if (v) v.currentTime = Number(e.target.value);
          }}
          aria-label={tx("Momento do vídeo")}
        />
        <span className="text-[11px] text-ink-dim tabular-nums shrink-0 w-12 text-right">
          {tempo.toFixed(1)}/{duracao.toFixed(0)}s
        </span>
      </div>
      <AvisoSilhueta marcas={marcas} />
      <p className="text-[12px] text-ink-dim text-center shrink-0">
        {marcas.length === 0
          ? tx(
              "Pause num momento em que a pessoa aparece bem e clique nela. Sem marcar ninguém, a IA troca a pessoa principal.",
            )
          : marcas.length < MAX_MARCAS
            ? tx(
                "A IA acompanha cada pessoa marcada pelo vídeo inteiro, mesmo se ela se mexer. Clique em outra pessoa para trocar mais de uma · clique no X para desmarcar.",
              )
            : `Máximo de ${MAX_MARCAS} pessoas por vídeo.`}
      </p>
    </div>
  );
}

/** De onde a pessoa foi marcada: o vídeo ou a foto de origem. */
export interface OrigemMarca {
  tipo: "video" | "foto";
  src: string;
}

/** Tamanho da miniatura da pessoa marcada (px). */
const MINI = { w: 48, h: 72 };

/** Onde a pessoa está no quadro, lido da silhueta (frações 0–1) + proporção do quadro. */
interface CaixaSilhueta {
  x: number;
  y: number;
  w: number;
  h: number;
  proporcao: number;
}

/** Caixa que envolve a silhueta (a máscara é um PNG local, dá pra ler os pixels). */
function useCaixaDaSilhueta(mascara: string | null | undefined) {
  const [caixa, setCaixa] = useState<CaixaSilhueta | null>(null);
  useEffect(() => {
    setCaixa(null);
    if (!mascara) return;
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx || !w || !h) return;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, w, h).data;
      let x0 = w;
      let y0 = h;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (px[(y * w + x) * 4 + 3] > 127) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      if (vivo && x1 >= x0 && y1 >= y0)
        setCaixa({
          x: x0 / w,
          y: y0 / h,
          w: (x1 - x0 + 1) / w,
          h: (y1 - y0 + 1) / h,
          proporcao: w / h,
        });
    };
    img.src = mascara;
    return () => {
      vivo = false;
    };
  }, [mascara]);
  return caixa;
}

/**
 * Miniatura da pessoa marcada. Com a silhueta: só a pessoa, recortada do
 * quadro e ampliada pra caber. Sem ela (ainda buscando, ou não veio): a altura
 * toda do quadro em volta do clique. Não usa canvas no vídeo, pra funcionar com
 * vídeo de outro domínio. Se a origem não abrir, mostra só a cor da marca.
 */
function MiniaturaMarca({
  numero,
  marca,
  origem,
}: {
  numero: number;
  marca: Marca;
  origem?: OrigemMarca;
}) {
  const [falhou, setFalhou] = useState(false);
  const caixa = useCaixaDaSilhueta(marca.mascara);
  const cor = CORES_MARCA[numero - 1];
  if (!origem || falhou)
    return (
      <span
        className="h-6 w-6 rounded-full shrink-0"
        style={{ background: cor }}
      />
    );
  const t = Math.max(0.05, marca.t);
  // Só a pessoa: o quadro é posicionado de modo que a caixa da silhueta ocupe
  // a miniatura, e a silhueta esconde o resto.
  let estilo: React.CSSProperties;
  if (caixa && marca.mascara) {
    const larguraPessoa = caixa.w * caixa.proporcao; // em "alturas de quadro"
    const escala = Math.min(MINI.w / larguraPessoa, MINI.h / caixa.h);
    const recorte = `url(${marca.mascara})`;
    estilo = {
      width: caixa.proporcao * escala,
      height: escala,
      left:
        (MINI.w - larguraPessoa * escala) / 2 -
        caixa.x * caixa.proporcao * escala,
      top: (MINI.h - caixa.h * escala) / 2 - caixa.y * escala,
      objectFit: "fill",
      maskImage: recorte,
      WebkitMaskImage: recorte,
      maskSize: "100% 100%",
      WebkitMaskSize: "100% 100%",
      maskRepeat: "no-repeat",
      WebkitMaskRepeat: "no-repeat",
    };
  } else {
    // Com `cover`, o ponto clicado cai na mesma fração da miniatura.
    estilo = {
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: `${marca.x * 100}% ${marca.y * 100}%`,
    };
  }
  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden",
        !caixa && "rounded-lg bg-black",
      )}
      style={{ width: MINI.w, height: MINI.h }}
    >
      {origem.tipo === "video" ? (
        <video
          // A marca muda de instante só se for refeita; a chave garante o quadro certo.
          key={`${origem.src}#${t}`}
          src={`${origem.src}#t=${t}`}
          muted
          playsInline
          preload="metadata"
          className="absolute max-w-none"
          style={estilo}
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = t;
          }}
          onError={() => setFalhou(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={origem.src}
          alt=""
          draggable={false}
          className="absolute max-w-none select-none"
          style={estilo}
          onError={() => setFalhou(true)}
        />
      )}
    </span>
  );
}

/** Uma pessoa marcada: qual influencer entra no lugar dela e com qual imagem. */
export function LinhaMarca({
  numero,
  marca,
  origem,
  personagens,
  onChange,
}: {
  numero: number;
  marca: Marca;
  /** Vídeo ou foto em que a pessoa foi marcada (vira a miniatura dela). */
  origem?: OrigemMarca;
  personagens: Character[];
  onChange: (m: Partial<Marca>) => void;
}) {
  const escolhido =
    personagens.find((p) => p.id === marca.characterId) ?? personagens[0];
  const opcoes = useImagensPersonagem(escolhido);
  const cor = CORES_MARCA[numero - 1];
  return (
    <div
      className="rounded-xl border border-line bg-panel p-2.5 grid gap-2"
      // A mesma cor da silhueta no vídeo: dá para ver de quem é cada cartão.
      style={{ borderColor: `${cor}80` }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <MiniaturaMarca numero={numero} marca={marca} origem={origem} />
        <span className="text-[13px] text-ink-mute shrink-0">vira</span>
        {personagens.length > 1 ? (
          <select
            value={escolhido.id}
            onChange={(e) => {
              const novo = personagens.find((p) => p.id === e.target.value);
              onChange({
                characterId: e.target.value,
                imageKey: primeiraImagem(novo),
              });
            }}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-[13px] font-semibold text-ink"
          >
            {personagens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.identidade.nome || tx("Sem nome")}
              </option>
            ))}
          </select>
        ) : (
          <strong className="text-[13px] text-ink truncate">
            {escolhido.identidade.nome || tx("o personagem")}
          </strong>
        )}
      </div>
      <EscolherImagemPersonagem
        cor={cor}
        compacto
        opcoes={opcoes}
        valor={marca.imageKey}
        onChange={(k) => onChange({ imageKey: k })}
      />
    </div>
  );
}

/**
 * A foto ocupando o espaço disponível (sem cortar e sem rolagem). Clique numa
 * pessoa marca quem trocar (até 3); clique no X desmarca.
 */
export function ImagemMarcador({
  src,
  marcas,
  onMarcar,
  onRemover,
}: {
  src: string;
  marcas: Marca[];
  onMarcar: (x: number, y: number) => void;
  onRemover: (id: string) => void;
}) {
  const [areaRef, area] = useTamanho<HTMLDivElement>();
  const [proporcao, setProporcao] = useState(1);
  const largura = area.w && area.h ? Math.min(area.w, area.h * proporcao) : 0;
  const altura = largura / proporcao;

  function clicar(e: React.MouseEvent<HTMLDivElement>) {
    if (marcas.length >= MAX_MARCAS) return;
    const r = e.currentTarget.getBoundingClientRect();
    onMarcar(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div ref={areaRef} className="flex-1 min-h-0 grid place-items-center">
        <div
          className="relative rounded-xl overflow-hidden bg-black"
          style={{ width: largura, height: altura }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-fill select-none"
            draggable={false}
            onLoad={(e) => {
              const i = e.currentTarget;
              if (i.naturalWidth && i.naturalHeight)
                setProporcao(i.naturalWidth / i.naturalHeight);
            }}
          />
          <div
            className={cn(
              "absolute inset-0",
              marcas.length < MAX_MARCAS && "cursor-crosshair",
            )}
            onClick={clicar}
            role="button"
            aria-label={tx("Clique na pessoa que deve ser trocada")}
          />
          {marcas.map((m, i) => (
            <MarcaNoQuadro
              key={m.id}
              marca={m}
              cor={CORES_MARCA[i]}
              onRemover={() => onRemover(m.id)}
            />
          ))}
          {marcas.length === 0 && (
            <div className="pointer-events-none absolute inset-x-2 top-3 flex justify-center [container-type:inline-size]">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-2xl bg-black/75 px-3 py-1.5 text-[12px] font-semibold leading-tight text-white shadow-lg animate-pulse">
                <MousePointerClick className="w-4 h-4 shrink-0 text-accent" />
                <span className="hidden [@container(min-width:150px)]:inline">
                  {tx("Clique em quem você quer trocar")}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
      <AvisoSilhueta marcas={marcas} />
      <p className="text-[12px] text-ink-dim text-center shrink-0">
        {marcas.length === 0
          ? tx("Sem marcar ninguém, a IA troca a pessoa principal da foto.")
          : marcas.length < MAX_MARCAS
            ? tx(
                "Clique em outra pessoa para trocar mais de uma · clique no X para desmarcar.",
              )
            : tx("Máximo de 3 pessoas por foto.")}
      </p>
    </div>
  );
}
