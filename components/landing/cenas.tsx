"use client";

import { tx } from "@/lib/i18n/tx";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { capaLp, videoLp, type VideoLp } from "@/lib/lp-midia";
import { Capsula } from "./Capsula";
import { useCena, useProgresso } from "./palco";

/** Seções 01 a 04 da landing: hero, manifesto, prova e tese. */

export const IMG = {
  wordmark: "/lp/wordmark.webp",
  arnaldo: "/lp/arn-front.webp",
  arnaldoFoto: "/lp/arn-still.webp",
  ze: "/lp/cut-ze.webp",
  zeFoto: "/lp/ze-zen.webp",
  nino: "/lp/cut-nino.webp",
  tattoo: "/lp/cut-tattoo.webp",
  betty: "/lp/cut-betty.webp",
  dione: "/lp/cut-dione.webp",
  dioneFoto: "/lp/dione.webp",
  pateta: "/lp/cut-pateta.webp",
  romeu: "/lp/cut-romeu.webp",
  romeuFoto: "/lp/romeu.webp",
} as const;

const semMovimento = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ */
/* 01 · Hero: a linha de cápsulas                                      */
/* ------------------------------------------------------------------ */

const HERO = {
  dk: {
    w: 150,
    h: 330,
    base: 506,
    vao: 46,
    chao: 470,
    marca: { top: 50, largura: 380, atraso: 4.6 },
    texto: { top: 592, h1: 29, sub: 14, margem: 8, lados: 0 },
    acender: (i: number) => 1.3 + i * 0.75,
    subir: (i: number) => 0.2 + i * 0.1,
    visitante: {
      dl: 3.55,
      hw: 0.5,
      nome: "SEU CREATOR",
      prefixo: "BUILDING · ",
    },
    nomes: ["ARNALDO NITRO", "ZÉ ZEN", "NINO PIRULITO"],
    estado: "IDENTITY LOCKED",
    entrada: [6.0, 6.55, 7.0],
  },
  mb: {
    w: 82,
    h: 206,
    base: 392,
    vao: 12,
    chao: 370,
    marca: { top: 78, largura: 290, atraso: 4.2 },
    texto: { top: 500, h1: 27, sub: 13.5, margem: 12, lados: 22 },
    acender: (i: number) => 1.2 + i * 0.65,
    subir: (i: number) => 0.2 + i * 0.08,
    visitante: { dl: 3.15, hw: 0.44, nome: "VOCÊ", prefixo: "" },
    nomes: ["ARNALDO", "ZÉ ZEN", "NINO"],
    estado: "LOCKED",
    entrada: [5.6, 6.1, 6.5],
  },
};

/** Porcentagem da cápsula em construção: sobe rápido até 37% e depois devagar, sem chegar a 100. */
function Construindo({ prefixo, inicio }: { prefixo: string; inicio: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let n = 0;
    let t: ReturnType<typeof setTimeout>;
    const passo = () => {
      n = n < 37 ? n + 1 : Math.min(99, n + (Math.random() < 0.3 ? 1 : 0));
      setV(n);
      t = setTimeout(passo, n < 37 ? 55 : 900);
    };
    t = setTimeout(passo, inicio * 1000);
    return () => clearTimeout(t);
  }, [inicio]);
  return (
    <>
      {prefixo}
      {v}%
    </>
  );
}

export function Hero() {
  const { mob, ativo } = useCena();
  if (!ativo) return null;
  const c = mob ? HERO.mb : HERO.dk;
  const largura = mob ? 390 : 1280;
  const x0 = (largura - (4 * c.w + 3 * c.vao)) / 2 + c.w / 2;
  const passo = c.w + c.vao;
  const prontos = [
    ["#001", IMG.arnaldo],
    ["#002", IMG.ze],
    ["#003", IMG.nino],
  ];
  const [c1, c2, c3] = c.entrada;
  return (
    <>
      <div className="hx-floor" style={{ top: c.chao }} />
      <div className="hx-fog" />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: c.marca.top,
          zIndex: 4,
        }}
      >
        <img
          className="hx-wmk"
          src={IMG.wordmark}
          alt="Nido AI Studio"
          style={
            {
              width: c.marca.largura,
              "--ad": `${c.marca.atraso}s`,
            } as CSSProperties
          }
        />
      </div>
      {prontos.map(([num, img], i) => (
        <Capsula
          key={num}
          cx={x0 + i * passo}
          base={c.base}
          w={c.w}
          h={c.h}
          img={img}
          num={num}
          nome={c.nomes[i]}
          estado={c.estado}
          dl={c.acender(i)}
          hw={c.subir(i)}
        />
      ))}
      <Capsula
        cx={x0 + 3 * passo}
        base={c.base}
        w={c.w}
        h={c.h}
        img={IMG.tattoo}
        tipo="build"
        num="#004"
        nome={tx(c.visitante.nome)}
        estado={
          <Construindo
            prefixo={c.visitante.prefixo}
            inicio={c.visitante.dl + 1}
          />
        }
        dl={c.visitante.dl}
        hw={c.visitante.hw}
      />
      <div
        className="hx-copy"
        style={
          {
            top: c.texto.top,
            padding: `0 ${c.texto.lados}px`,
            "--c1": `${c1}s`,
            "--c2": `${c2}s`,
            "--c3": `${c3}s`,
          } as CSSProperties
        }
      >
        <h1 style={{ fontSize: c.texto.h1 }}>
          <span>{tx("Personagens são gerados.")}</span>{" "}
          <em>{tx("Creators são construídos.")}</em>
        </h1>
        <p style={{ fontSize: c.texto.sub, marginTop: c.texto.margem }}>
          {tx("Crie identidade, visual, personalidade, voz e estratégia para creators de IA que continuam sendo eles mesmos em cada post.")}
        </p>
      </div>
      <div className="hx-vig" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 02 · Manifesto: interrompemos a programação                         */
/* ------------------------------------------------------------------ */

const SIMBOLOS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#/<>01";

/** Texto que aparece por descriptografia: começa em símbolos e se resolve letra a letra. */
function Decifra({
  texto,
  atraso,
  como: Tag,
}: {
  texto: string;
  atraso: number;
  como: "span" | "em";
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (semMovimento()) {
      el.textContent = texto;
      return;
    }
    el.textContent = "";
    let iv: ReturnType<typeof setInterval>;
    const t = setTimeout(() => {
      let i = 0;
      iv = setInterval(() => {
        i++;
        el.textContent = [...texto]
          .map((c, j) =>
            j < i / 1.6 || c === " "
              ? c
              : SIMBOLOS[(Math.random() * SIMBOLOS.length) | 0],
          )
          .join("");
        if (i / 1.6 >= texto.length) {
          clearInterval(iv);
          el.textContent = texto;
        }
      }, 22);
    }, atraso);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [texto, atraso]);
  return <Tag ref={ref as never} aria-label={texto} />;
}

const LETREIRO = [
  "UMA NOVA GERAÇÃO DE CREATORS ESTÁ COMEÇANDO",
  "ELES NÃO TÊM CORPO",
  "TÊM IDENTIDADE",
  "// ESSAS PESSOAS NÃO EXISTEM",
];

export function Manifesto() {
  const { mob, ativo } = useCena();
  if (!ativo) return <div className="mf-bg" />;
  const lado = mob ? 22 : 60;
  return (
    <>
      <div className="mf-bg" />
      <div
        className="mf-flick"
        style={{ left: lado, right: lado, top: mob ? 200 : 206 }}
      >
        <h2 className="mf-m3" style={{ fontSize: mob ? 44 : 94 }}>
          <Decifra como="span" texto={tx("O próximo grande creator")} atraso={300} />
          <Decifra como="em" texto={tx("pode não ser humano.")} atraso={1000} />
        </h2>
        <p
          className="mf-s"
          style={
            mob
              ? { fontSize: 15, marginTop: 26 }
              : { fontSize: 18, maxWidth: 560, marginTop: 30 }
          }
        >
          {tx("Uma nova geração de creators está começando. Eles não têm corpo.")}{" "}
          <b>{tx("Têm identidade.")}</b>
        </p>
      </div>
      <div
        className="mf-bar"
        style={mob ? { fontSize: 9 } : undefined}
        aria-hidden="true"
      >
        <div className="mq">
          {[0, 1, 2, 3].flatMap((n) =>
            LETREIRO.map((t) => <span key={`${n}${t}`}>{tx(t)}</span>),
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 03 · Prova: a parede de reels                                       */
/* ------------------------------------------------------------------ */

interface Reel {
  /** Feito na Nido (etiqueta amarela) ou viral de fora (etiqueta branca). */
  nido: boolean;
  video?: VideoLp;
  img?: string;
  nome: string;
  linha: string;
  views?: string;
}

const FORA = "personagem internacional";
const REELS: Reel[] = [
  {
    nido: true,
    video: "vid-a",
    nome: "Arnaldo Energy",
    linha: "#001 · 5 dias no ar",
    views: "30K+",
  },
  { nido: false, video: "vr-1", nome: "@loveworld3650", linha: FORA },
  {
    nido: true,
    video: "vid-ze",
    nome: "Zé Zen",
    linha: "#002 · comportamento",
  },
  { nido: false, video: "vr-2", nome: "@aimak.s", linha: FORA },
  { nido: true, video: "vid-b", nome: "Betty Pimenta", linha: "#003" },
  { nido: false, video: "vr-3", nome: "@jean_philanthrope", linha: FORA },
  { nido: true, img: IMG.romeuFoto, nome: "Romeu Nobre", linha: "#006" },
  { nido: false, video: "vr-moroni", nome: "@moroniduarte", linha: FORA },
  { nido: true, video: "vid-c", nome: "Pateta Fi Duma Egua", linha: "#005" },
  { nido: false, video: "vr-5", nome: "@vilaogru", linha: FORA },
  { nido: true, img: IMG.dioneFoto, nome: "Dione Brabo", linha: "#004" },
];

/** Conta de 0 até `ate` na entrada da seção. */
function Contador({ ate }: { ate: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (semMovimento()) {
      el.textContent = String(ate);
      return;
    }
    const t0 = performance.now() + 500;
    let raf = requestAnimationFrame(function quadro(agora) {
      const p = Math.min(1, Math.max(0, (agora - t0) / 1600));
      el.textContent = String(Math.round(ate * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(quadro);
    });
    return () => cancelAnimationFrame(raf);
  }, [ate]);
  return <span ref={ref}>0</span>;
}

/**
 * A parede corre sozinha (uma volta a cada 48s), desacelera com o mouse em
 * cima e pode ser arrastada. A lista vem duplicada para a volta não ter emenda.
 * Cada vídeo só toca enquanto está visível.
 */
function Parede({
  top,
  w,
  h,
  vao,
}: {
  top: number;
  w: number;
  h: number;
  vao: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parede = ref.current!;
    const trilho = parede.firstElementChild as HTMLElement;
    const parado = semMovimento();
    let x = 0,
      vel = 0,
      arrastando = false,
      sobre = false,
      lx = 0,
      lt = 0;
    let ultimo = performance.now();
    // Largura em px do quadro (o quadro é escalado, então clientX precisa ser convertido).
    const metade = () => trilho.scrollWidth / 2;
    const escala = () =>
      parede.getBoundingClientRect().width / parede.offsetWidth || 1;

    const entrar = (e: PointerEvent) => {
      if (e.pointerType === "mouse") sobre = true;
    };
    const sair = () => {
      sobre = false;
    };
    const pegar = (e: PointerEvent) => {
      arrastando = true;
      lx = e.clientX;
      lt = performance.now();
      vel = 0;
      parede.classList.add("dragging");
      parede.setPointerCapture(e.pointerId);
    };
    const mover = (e: PointerEvent) => {
      if (!arrastando) return;
      const agora = performance.now();
      const dx = (e.clientX - lx) / escala();
      x += dx;
      vel = vel * 0.6 + (dx / Math.max(1, agora - lt)) * 1000 * 0.4;
      lx = e.clientX;
      lt = agora;
    };
    const soltar = () => {
      arrastando = false;
      parede.classList.remove("dragging");
    };
    parede.addEventListener("pointerenter", entrar);
    parede.addEventListener("pointerleave", sair);
    parede.addEventListener("pointerdown", pegar);
    parede.addEventListener("pointermove", mover);
    parede.addEventListener("pointerup", soltar);
    parede.addEventListener("pointercancel", soltar);

    let raf = requestAnimationFrame(function quadro(agora) {
      const dt = Math.min(0.05, (agora - ultimo) / 1000);
      ultimo = agora;
      const H = metade();
      if (!arrastando) {
        const alvo = sobre || parado ? 0 : -H / 48;
        vel += (alvo - vel) * Math.min(1, dt * 2.2);
        x += vel * dt;
      }
      if (H > 0) {
        while (x <= -H) x += H;
        while (x > 0) x -= H;
      }
      trilho.style.transform = `translate3d(${x}px,0,0)`;
      raf = requestAnimationFrame(quadro);
    });

    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      }
    });
    parede.querySelectorAll("video").forEach((v) => {
      v.muted = true;
      io.observe(v);
    });

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      parede.removeEventListener("pointerenter", entrar);
      parede.removeEventListener("pointerleave", sair);
      parede.removeEventListener("pointerdown", pegar);
      parede.removeEventListener("pointermove", mover);
      parede.removeEventListener("pointerup", soltar);
      parede.removeEventListener("pointercancel", soltar);
    };
  }, []);

  return (
    <div ref={ref} className="pv-wall" style={{ top }}>
      <div className="tk" style={{ gap: vao }}>
        {[0, 1].flatMap((volta) =>
          REELS.map((r) => (
            <div
              key={`${volta}${r.nome}`}
              className={`pv-pc ${r.nido ? "ni" : "tr"}`}
              style={{ width: w, height: h }}
              aria-hidden={volta === 1 || undefined}
            >
              {r.video ? (
                <video
                  src={videoLp(r.video)}
                  poster={capaLp(r.video)}
                  preload="none"
                  muted
                  loop
                  playsInline
                />
              ) : (
                <img src={r.img} alt={r.nome} loading="lazy" />
              )}
              <span className="og">
                {r.nido ? tx("FEITO NA NIDO") : tx("VIRAL LÁ FORA")}
              </span>
              <div className="ft">
                <div className="nm">{r.nome}</div>
                <div className="hd">{tx(r.linha)}</div>
                {r.views ? (
                  <div className="vw">
                    <b>{r.views}</b>views
                  </div>
                ) : null}
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  );
}

// Componente (e não constante): o texto é traduzido na hora de desenhar.
const Lead = () => (
  <>
    {tx(
      "Lá fora, creators de IA já viralizam todo dia. No Brasil, o espaço ainda está livre.",
    )}{" "}
    <b>{tx("A Nido usa a mesma tecnologia")}</b>{" "}
    {tx("e já colocou os primeiros no ar.")}
  </>
);

export function Prova() {
  const { mob, ativo } = useCena();
  if (!ativo) return <div className="pv-bg" />;
  const rd = (s: number) => ({ "--rd": `${s}s` }) as CSSProperties;
  if (mob)
    return (
      <>
        <div className="pv-bg" />
        <div className="pv-rv" style={{ left: 22, top: 118, ...rd(0.1) }}>
          <h2 className="pv-h3" style={{ fontSize: 28 }}>
            {tx("Eles não existem.")}
          </h2>
        </div>
        <div className="pv-rv" style={{ left: 21, top: 154, ...rd(0.3) }}>
          <div className="pv-big" style={{ fontSize: 64 }}>
            <Contador ate={1000} /> MI+
          </div>
        </div>
        <div
          className="pv-rv"
          style={{ left: 22, right: 22, top: 222, ...rd(0.5) }}
        >
          <h2 className="pv-h3" style={{ fontSize: 24 }}>
            <i>{tx("de pessoas assistiram mesmo assim.")}</i>
          </h2>
          <p className="pv-lead" style={{ fontSize: 14, marginTop: 16 }}>
            <Lead />
          </p>
        </div>
        <Parede top={400} w={170} h={303} vao={12} />
      </>
    );
  return (
    <>
      <div className="pv-bg" />
      <div className="pv-rv" style={{ left: 60, top: 132, ...rd(0.1) }}>
        <h2 className="pv-h3" style={{ fontSize: 64 }}>
          {tx("Eles não existem.")}
        </h2>
      </div>
      <div className="pv-rv" style={{ left: 57, top: 212, ...rd(0.3) }}>
        <div className="pv-big" style={{ fontSize: 140 }}>
          <Contador ate={1000} /> MI+
        </div>
      </div>
      <div className="pv-rv" style={{ left: 60, top: 352, ...rd(0.5) }}>
        <h2 className="pv-h3" style={{ fontSize: 38 }}>
          <i>{tx("de pessoas assistiram mesmo assim.")}</i>
        </h2>
      </div>
      <div
        className="pv-rv"
        style={{ left: 820, top: 236, width: 400, ...rd(0.7) }}
      >
        <p className="pv-lead" style={{ fontSize: 15.5 }}>
          <Lead />
        </p>
      </div>
      <Parede top={432} w={200} h={356} vao={18} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 04 · Tese: contact sheet que vira vídeo em tela cheia               */
/* ------------------------------------------------------------------ */

const CAMADAS: Array<[string, string]> = [
  ["Identidade", "Arnaldo Nitro · #001"],
  ["Visual", "terno verde · 68 anos"],
  ["Personalidade", "veterano elétrico"],
  ["Voz", "rouca, ritmo acelerado"],
  ["Linguagem", "gíria dos anos 80"],
  ["Nicho", "energia & lifestyle"],
  ["Estratégia", "3 reels/semana · humor"],
  ["Monetização", "bebidas · fitness"],
  ["Conteúdo", "desafios e reações"],
  ["Memória", "persiste entre sessões"],
];
/** Recorte da foto em cada quadro: [zoom %, posição x %, posição y %]. */
const RECORTES = [
  [380, 50, 12],
  [165, 50, 40],
  [600, 52, 15],
  [820, 50, 17],
  [330, 24, 57],
  [230, 92, 28],
  [270, 50, 95],
  [720, 62, 33],
  [100, 50, 50],
  [1100, 50, 13],
];

const TESE = {
  dk: {
    W: 1280,
    H: 720,
    grade: { x0: 520, dx: 142, y0: 120, dy: 245, w: 132, h: 235 },
    centro: { x: 870, y: 360 },
    video: { x: 725, y: 102, w: 290, h: 516 },
    titulo: { left: 60, top: 200, width: 420, fontSize: 58 },
    conta: { left: 60, top: 650 },
    selo: { left: 60, top: 470 },
    fecho: { left: 60, top: 560, width: 560, fontSize: 18 },
  },
  mb: {
    W: 390,
    H: 844,
    grade: { x0: 13, dx: 74, y0: 300, dy: 127, w: 68, h: 121 },
    centro: { x: 195, y: 424 },
    video: { x: 120, y: 286, w: 150, h: 267 },
    titulo: { left: 24, top: 84, width: 340, fontSize: 44 },
    conta: { left: 24, top: 796 },
    selo: { left: 24, top: 600, fontSize: 15 },
    fecho: { left: 24, top: 668, width: 342, fontSize: 15 },
  },
};

/** A partir deste ponto do scroll a identidade "trava" e o vídeo começa a tocar. */
const TRAVA = 0.86;
/** O estado final é atingido antes do fim do curso, para dar tempo de ler o fecho. */
const FIM = 0.92;
const limitar = (v: number) => Math.min(1, Math.max(0, v));
const trecho = (p: number, a: number, b: number) =>
  1 - Math.pow(1 - limitar((p - a) / (b - a)), 3);

export function Tese() {
  // Só monta ao entrar em cena: o progresso do scroll precisa dos elementos já na página.
  return useCena().ativo ? <TeseCena /> : null;
}

function TeseCena() {
  const { mob } = useCena();
  const raiz = useRef<HTMLDivElement>(null);
  const c = mob ? TESE.mb : TESE.dk;

  useProgresso((bruto) => {
    const el = raiz.current;
    if (!el) return;
    const p = semMovimento() ? 1 : limitar(bruto / FIM);
    const travado = p >= TRAVA;
    const junta = trecho(p, TRAVA - 0.02, 0.9);
    const { grade: g, centro, video: v0 } = c;
    let acesas = 0;
    el.querySelectorAll<HTMLElement>(".ts-ct").forEach((d, i) => {
      const t = trecho(p, 0.08 + i * 0.072, 0.15 + i * 0.072);
      if (t >= 1) acesas++;
      d.classList.toggle("on", t >= 1);
      const col = i % 5,
        lin = Math.floor(i / 5);
      const dx = (centro.x - (g.x0 + col * g.dx + g.w / 2)) * junta;
      const dy = (centro.y - (g.y0 + lin * g.dy + g.h / 2)) * junta;
      d.style.opacity = String((0.25 + 0.75 * t) * (1 - junta));
      d.style.transform = `translate(${dx}px,${dy}px) scale(${(0.96 + 0.04 * t) * (1 - 0.35 * junta)})`;
    });
    el.querySelector(".ts-cnt b")!.textContent = String(acesas).padStart(
      2,
      "0",
    );

    // O quadro único vira o vídeo e cresce até a tela cheia.
    const v = el.querySelector("video")!;
    const cresce = trecho(p, 0.9, 0.99);
    v.style.opacity = String(trecho(p, TRAVA - 0.01, 0.9));
    v.style.left = `${v0.x * (1 - cresce)}px`;
    v.style.top = `${v0.y * (1 - cresce)}px`;
    v.style.width = `${v0.w + (c.W - v0.w) * cresce}px`;
    v.style.height = `${v0.h + (c.H - v0.h) * cresce}px`;
    v.style.border = cresce > 0 ? "none" : "1px solid var(--y)";
    el.querySelectorAll<HTMLElement>(".ts-t4,.ts-cnt").forEach(
      (x) => (x.style.opacity = String(1 - cresce)),
    );
    el.querySelector<HTMLElement>(".ts-ov")!.style.opacity = String(
      trecho(p, 0.93, 1),
    );
    const selo = el.querySelector<HTMLElement>(".ts-stamp")!;
    const s = trecho(p, 0.95, 1);
    selo.style.opacity = String(s);
    selo.style.transform = `rotate(-6deg) scale(${1.3 - 0.3 * s})`;
    const fecho = el.querySelector<HTMLElement>(".ts-f4")!;
    const f = trecho(p, 0.96, 1);
    fecho.style.opacity = String(f);
    fecho.style.transform = `translateY(${(1 - f) * 12}px)`;

    v.muted = true;
    if (travado) {
      if (v.paused) v.play().catch(() => {});
    } else if (!v.paused || v.currentTime > 0.6) {
      v.pause();
      try {
        v.currentTime = 0.5;
      } catch {}
    }
  });

  const g = c.grade;
  return (
    <div ref={raiz}>
      <h2 className="ts-t4" style={c.titulo}>
        <span>{tx("Uma imagem")}</span>
        <em>{tx("não é um creator.")}</em>
      </h2>
      <div className="ts-cnt" style={c.conta}>
        camadas <b>00</b> / 10
      </div>
      {CAMADAS.map(([camada, valor], i) => {
        const [zoom, x, y] = RECORTES[i];
        return (
          <div
            key={camada}
            className="ts-ct"
            style={{
              left: g.x0 + (i % 5) * g.dx,
              top: g.y0 + Math.floor(i / 5) * g.dy,
              backgroundImage: `url(${IMG.arnaldoFoto})`,
              backgroundSize: `${zoom}%`,
              backgroundPosition: `${x}% ${y}%`,
            }}
          >
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <div className="k">
              {tx(camada)}
              <span>{tx(valor)}</span>
            </div>
          </div>
        );
      })}
      <video
        className="ts-v"
        src={videoLp("arnaldo")}
        poster={capaLp("arnaldo")}
        style={{
          left: c.video.x,
          top: c.video.y,
          width: c.video.w,
          height: c.video.h,
        }}
        muted
        playsInline
        loop
        preload="auto"
      />
      <div className="ts-ov" />
      <div className="ts-stamp" style={c.selo}>
        {tx("CREATOR #001 · IDENTITY LOCKED")}
      </div>
      <p className="ts-f4" style={c.fecho}>
        {tx("Personagens têm aparência.")}{" "}
        <b>{tx("Creators têm identidade, voz, universo, estratégia e audiência.")}</b>
      </p>
    </div>
  );
}
