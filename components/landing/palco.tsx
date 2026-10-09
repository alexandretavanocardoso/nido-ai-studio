"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Cada seção da landing é um quadro de tamanho fixo (1280 de largura no
 * desktop, 390 no celular), como no design. O Palco escala o quadro para a
 * largura da tela, avisa quando a seção entra em cena e, nas seções presas
 * (`pin`), informa o progresso do scroll de 0 a 1.
 */
const LARGURA = { dk: 1280, mb: 390 } as const;
/** Acima disso o quadro para de crescer e fica centralizado. */
const LARGURA_MAX = 1920;
/** Quanto o quadro pode passar da altura da tela para ocupar a largura toda. */
const FOLGA_NA_ALTURA = 1.14;
const CELULAR = "(max-width: 719px)";

interface Tela {
  /** null até o navegador medir a tela (o servidor não sabe o tamanho). */
  mob: boolean | null;
  largura: number;
  /** Altura da tela com as barras do navegador abertas: não muda ao rolar no celular. */
  altura: number;
}

const TelaCtx = createContext<Tela>({ mob: null, largura: 0, altura: 0 });

export function Landing({ children }: { children: ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);
  const svh = useRef<HTMLDivElement>(null);
  const [tela, setTela] = useState<Tela>({ mob: null, largura: 0, altura: 0 });

  useLayoutEffect(() => {
    const mq = matchMedia(CELULAR);
    const medir = () =>
      setTela({
        mob: mq.matches,
        largura: raiz.current!.clientWidth,
        altura: svh.current!.clientHeight,
      });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(raiz.current!);
    ro.observe(svh.current!);
    mq.addEventListener("change", medir);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", medir);
    };
  }, []);

  return (
    <div ref={raiz} className={`lp${tela.mob === null ? "" : " pronto"}`}>
      <div ref={svh} className="lp-svh" aria-hidden="true" />
      <TelaCtx.Provider value={tela}>{children}</TelaCtx.Provider>
    </div>
  );
}

type AoProgresso = (p: number) => void;

interface Cena {
  mob: boolean;
  /** A seção já entrou na tela (fica true dali em diante). */
  ativo: boolean;
  /** Seções presas: chama `fn` com o progresso do scroll (0 a 1) a cada mudança. */
  progresso: (fn: AoProgresso) => () => void;
  /** Rola a página até o ponto `p` (0 a 1) da seção presa. */
  irPara: (p: number) => void;
}

const CenaCtx = createContext<Cena | null>(null);

export function useCena(): Cena {
  const c = useContext(CenaCtx);
  if (!c) throw new Error("useCena fora de <Palco>");
  return c;
}

/** Registra `fn` no progresso do scroll da seção (a função pode mudar a cada render). */
export function useProgresso(fn: AoProgresso) {
  const { progresso } = useCena();
  const atual = useRef(fn);
  atual.current = fn;
  useEffect(() => progresso((p) => atual.current(p)), [progresso]);
}

export function Palco({
  id,
  rotulo,
  h,
  hm,
  pin,
  caber,
  classe = "",
  quadro = "",
  children,
}: {
  id?: string;
  rotulo: string;
  /** Altura do quadro no desktop e no celular. */
  h: number;
  hm: number;
  /** Prende a seção por esse número de alturas de tela enquanto o scroll avança. */
  pin?: number;
  /** Encolhe o quadro para caber inteiro na altura da tela. */
  caber?: boolean;
  classe?: string;
  quadro?: string;
  children: ReactNode;
}) {
  const tela = useContext(TelaCtx);
  const mob = tela.mob ?? false;
  const sec = useRef<HTMLElement>(null);
  const [ativo, setAtivo] = useState(false);
  const ouvintes = useRef(new Set<AoProgresso>());
  const ultimo = useRef(0);

  const W = mob ? LARGURA.mb : LARGURA.dk;
  const H = mob ? hm : h;
  let s = Math.min(tela.largura || W, LARGURA_MAX) / W;
  // O quadro ocupa a largura toda da tela. Só encolhe pela altura quando
  // passaria muito dela: até FOLGA_NA_ALTURA a mais, ele fica na largura cheia
  // e o que sobra em cima e embaixo (as margens do desenho) fica fora da tela.
  if ((caber || pin) && tela.altura)
    s = Math.min(s, (tela.altura / H) * FOLGA_NA_ALTURA);
  const sh = H * s;
  // O quadro ficou mais estreito que a tela (encolhido pela altura, ou tela
  // mais larga que o máximo): as bordas dele se desfazem no fundo da página,
  // senão aparecem duas faixas pretas com um degrau de cor nas laterais.
  const comFaixas = tela.largura > 0 && W * s < tela.largura - 1;
  // Seção presa: centralizada na altura (negativo quando o quadro é mais alto
  // que a tela — corta por igual em cima e embaixo).
  const topo = pin ? (tela.altura - sh) / 2 : 0;
  const curso = pin ? pin * tela.altura : 0;

  useEffect(() => {
    if (tela.mob === null || ativo) return;
    const io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && setAtivo(true),
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(sec.current!);
    return () => io.disconnect();
  }, [tela.mob, ativo]);

  // Progresso do scroll: quanto do curso da seção presa já passou.
  const medidas = useRef({ topo, curso });
  medidas.current = { topo, curso };
  useEffect(() => {
    if (!pin) return;
    let raf = 0;
    const calcular = () => {
      raf = 0;
      const { topo, curso } = medidas.current;
      if (!curso || !sec.current) return;
      const y = sec.current.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, (topo - y) / curso));
      ultimo.current = p;
      ouvintes.current.forEach((fn) => fn(p));
    };
    const pedir = () => {
      if (!raf) raf = requestAnimationFrame(calcular);
    };
    pedir();
    addEventListener("scroll", pedir, { passive: true });
    return () => {
      removeEventListener("scroll", pedir);
      cancelAnimationFrame(raf);
    };
  }, [pin, topo, curso]);

  const progresso = useCallback((fn: AoProgresso) => {
    ouvintes.current.add(fn);
    fn(ultimo.current);
    return () => void ouvintes.current.delete(fn);
  }, []);
  const irPara = useCallback((p: number) => {
    const { topo, curso } = medidas.current;
    const y = sec.current!.getBoundingClientRect().top + scrollY;
    scrollTo({ top: y - topo + p * curso, behavior: "smooth" });
  }, []);
  const cena = useMemo(
    () => ({ mob, ativo, progresso, irPara }),
    [mob, ativo, progresso, irPara],
  );

  const estilo = {
    "--bw": W,
    "--bh": H,
    "--lp-s": s,
    "--pin-top": `${topo}px`,
    height: pin ? sh + curso : undefined,
  } as CSSProperties;

  return (
    <section
      ref={sec}
      id={id}
      aria-label={rotulo}
      className={`lp-sec${pin ? " pin" : ""}${comFaixas ? " faixas" : ""} ${classe}`}
      style={estilo}
    >
      <div className="lp-stage">
        <div
          className={`lp-fr ${mob ? "lp-mb" : "lp-dk"}${ativo ? " on" : ""} ${quadro}`}
        >
          <CenaCtx.Provider value={cena}>{children}</CenaCtx.Provider>
        </div>
      </div>
    </section>
  );
}
