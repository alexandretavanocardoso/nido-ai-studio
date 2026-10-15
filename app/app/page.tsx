"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { useRecursos } from "@/components/RecursosProvider";
import { linkEstudio, useCriar, useMaisRecente } from "@/components/AppShell";
import { cn } from "@/lib/cn";
import { liberadoNaTela } from "@/lib/em-teste";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";
import { PLANOS } from "@/lib/planos";
import { STATUS_POST } from "@/lib/social/redes";
import { capaSrc } from "@/lib/storage/client";
import { useCharacters } from "@/lib/store";
import type { Character } from "@/lib/types";

/** Curva de entrada do app (a mesma do menu e dos cards). */
const EASE = "ease-[cubic-bezier(.16,1,.3,1)]";

/**
 * Home do app: carrossel das funcionalidades (cada uma com o seu vídeo), o
 * banner de criar um AI Creator e a agenda dos próximos 7 dias.
 */
export default function Home() {
  const recursos = useRecursos();
  const t = useT();
  const { conta } = useCreditos();
  const { criar, noLimite } = useCriar();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const characters = useCharacters((s) => s.characters);
  const lista = mounted ? characters : [];

  return (
    <main className="min-h-screen bg-nido-bg px-10 pt-24 pb-16 font-geist text-nido-ink transition-[padding] duration-300 lg:pl-[calc(var(--nido-menu)_+_40px)] max-sm:px-[18px] max-sm:pt-[84px] max-sm:pb-14">
      <div className="flex max-w-[1560px] flex-col gap-14">
        {/* Quem tenta criar além do limite do plano volta para cá com o aviso. */}
        {noLimite && conta ? (
          <div className="rounded-xl border border-pink/40 bg-pink/10 px-4 py-3 text-center text-sm text-pink">
            {t("inicio.limite", {
              plano: PLANOS[conta.plano].nome,
              n: PLANOS[conta.plano].personagens,
            })}{" "}
            <Link href="/app/planos" className="font-bold underline">
              {t("inicio.upgrade")}
            </Link>
          </div>
        ) : null}

        <Funcionalidades />
        <Banner onCriar={criar} />
        {recursos.social ? <Agenda personagens={lista} /> : null}
      </div>
    </main>
  );
}

/** Entrada das seções: sobem e aparecem quando chegam na tela. */
function useRevelar() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        setVisivel(true);
        io.disconnect();
      },
      { threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  const classe = cn(
    "transition-[opacity,transform] duration-[600ms] motion-reduce:transition-none",
    EASE,
    visivel
      ? "opacity-100 transform-none"
      : "translate-y-[14px] opacity-0 motion-reduce:transform-none motion-reduce:opacity-100",
  );
  return [setEl, classe] as const;
}

/** Vídeo mudo em loop que só toca enquanto aparece na tela (`limiar`: fração visível). */
function VideoEmLoop({
  src,
  className,
  limiar = 0.25,
  preload = "metadata",
  onPronto,
}: {
  src: string;
  className?: string;
  limiar?: number;
  preload?: "auto" | "metadata";
  /** Chamado quando o primeiro quadro já pode aparecer. */
  onPronto?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: limiar },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [limiar]);
  useEffect(() => {
    const v = ref.current;
    if (!v || !onPronto) return;
    // Pode ter carregado antes da hidratação: aí o evento já passou.
    if (v.readyState >= 2) return onPronto();
    v.addEventListener("loadeddata", onPronto, { once: true });
    return () => v.removeEventListener("loadeddata", onPronto);
  }, [onPronto]);
  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload={preload}
      className={className}
    />
  );
}

interface Funcionalidade {
  titulo: string;
  descricao: string;
  /** Nome do arquivo em public/videos_home. */
  video: string;
  /** Sem destino (a ferramenta precisa de um personagem e não há nenhum): abre o criar. */
  href?: string;
}

/** Espaço entre os cartões do carrossel (px). */
const VAO = 18;

/**
 * Carrossel das funcionalidades: rola com as setas, arrastando com o mouse ou
 * deslizando no celular, e sempre para no começo de um cartão.
 */
function Funcionalidades() {
  const recursos = useRecursos();
  const { conta } = useCreditos();
  const { criar } = useCriar();
  // As ferramentas do Estúdio abrem no personagem ativo (o mesmo do menu).
  const recente = useMaisRecente();
  const fila = useRef<HTMLDivElement>(null);
  const arraste = useRef<{ x: number; inicio: number; moveu: boolean } | null>(
    null,
  );
  const soltouArrastando = useRef(false);
  const [arrastando, setArrastando] = useState(false);
  const [setas, setSetas] = useState<{
    anterior: boolean;
    proximo: boolean;
    topo: number;
  } | null>(null);

  // NFT e MCP ainda em teste: só aparecem para quem tem acesso (lib/em-teste.ts).
  const itens: Funcionalidade[] = [
    {
      titulo: "Shadow",
      descricao: "Troque a pessoa de qualquer vídeo pelo seu creator",
      video: "SHADOW",
      href: "/app/sombra",
    },
    {
      titulo: "Vídeo",
      descricao: "Escreva a cena e receba o vídeo pronto, na voz do creator",
      video: "VIDEO",
      href: recente ? linkEstudio(recente.id, "videos") : undefined,
    },
    ...(recursos.nft && liberadoNaTela("nft", conta)
      ? [
          {
            titulo: "Traga seu NFT",
            descricao: "Seu NFT ganha rosto, voz e personalidade e vira creator",
            video: "NFT",
            href: recente ? `/app/personagem/${recente.id}?aba=nft` : undefined,
          },
        ]
      : []),
    {
      titulo: "Agenda",
      descricao: "Peça em uma frase: o agente gera, legenda e agenda",
      video: "AGENDA",
      href: recente ? linkEstudio(recente.id, "agendamentos") : undefined,
    },
    {
      titulo: "Radar",
      descricao: "As tendências do dia no nicho do seu creator",
      video: "RADAR",
      href: "/app/radar",
    },
    ...(liberadoNaTela("mcp", conta)
      ? [
          {
            titulo: "MCP",
            descricao: "Opere o estúdio inteiro a partir de um chat",
            video: "MCP",
            href: "/app/conexoes",
          },
        ]
      : []),
  ];

  const passo = useCallback(
    () =>
      (fila.current
        ?.querySelector("[data-cartao]")
        ?.getBoundingClientRect().width ?? 0) + VAO,
    [],
  );

  // Setas: somem nas pontas e ficam na altura do meio do vídeo.
  const medir = useCallback(() => {
    const el = fila.current;
    if (!el) return;
    const midia = el.querySelector<HTMLElement>("[data-midia]");
    setSetas({
      anterior: el.scrollLeft >= 8,
      proximo: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
      topo: (midia?.offsetHeight ?? 0) / 2 - 22,
    });
  }, []);
  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir, itens.length]);

  // Arrastar com o mouse (no toque, a rolagem nativa já faz isso).
  useEffect(() => {
    function mover(e: PointerEvent) {
      const a = arraste.current;
      const el = fila.current;
      if (!a || !el) return;
      const d = e.clientX - a.x;
      if (!a.moveu && Math.abs(d) > 5) {
        a.moveu = true;
        setArrastando(true);
      }
      if (a.moveu) el.scrollLeft = a.inicio - d;
    }
    function soltar() {
      const a = arraste.current;
      const el = fila.current;
      arraste.current = null;
      if (!a?.moveu || !el) return;
      setArrastando(false);
      // O clique que vem logo depois de soltar não abre o cartão.
      soltouArrastando.current = true;
      setTimeout(() => (soltouArrastando.current = false), 0);
      const w = passo();
      el.scrollTo({
        left: Math.round(el.scrollLeft / w) * w,
        behavior: "smooth",
      });
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
  }, [passo]);

  const seta =
    "absolute z-[5] grid h-11 w-11 place-items-center rounded-full bg-nido-ink text-nido-bg shadow-[0_10px_30px_-8px_rgba(0,0,0,0.8)] transition-transform duration-200 hover:scale-[1.06] max-[860px]:hidden";

  return (
    <section aria-label={tx("Funcionalidades")} className="relative">
      {setas?.anterior ? (
        <button
          type="button"
          onClick={() =>
            fila.current?.scrollBy({ left: -passo(), behavior: "smooth" })
          }
          aria-label={tx("Anterior")}
          className={cn(seta, "-left-3")}
          style={{ top: setas.topo }}
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
      <div
        ref={fila}
        onScroll={medir}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !fila.current) return;
          arraste.current = {
            x: e.clientX,
            inicio: fila.current.scrollLeft,
            moveu: false,
          };
        }}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (!soltouArrastando.current) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cn(
          "flex select-none gap-[18px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          arrastando
            ? "cursor-grabbing snap-none [&_*]:cursor-grabbing [&_a]:pointer-events-none [&_button]:pointer-events-none"
            : "cursor-grab snap-x snap-mandatory [&_*]:cursor-grab",
        )}
      >
        {itens.map((f) => {
          const conteudo = (
            <>
              <div
                data-midia
                className="relative aspect-video overflow-hidden rounded-[14px] bg-nido-panel"
              >
                <VideoEmLoop
                  src={`/videos_home/${f.video}.mp4`}
                  className={cn(
                    "absolute inset-0 h-full w-full object-cover transition-transform duration-[600ms] group-hover:scale-[1.04]",
                    EASE,
                  )}
                />
              </div>
              <div>
                <h3 className="flex items-center gap-2 font-archivo text-[16px] font-black uppercase tracking-[-0.005em] transition-colors duration-200 [font-stretch:118%] group-hover:text-nido-yellow">
                  {tx(f.titulo)}
                </h3>
                <p className="mt-[5px] text-[13.5px] leading-[1.45] text-nido-mute">
                  {tx(f.descricao)}
                </p>
              </div>
            </>
          );
          const classe =
            "group flex min-w-[290px] flex-[0_0_calc((100%_-_54px)_/_3.6)] snap-start flex-col gap-3.5 text-left text-nido-ink max-[860px]:basis-[80%]";
          return f.href ? (
            <Link key={f.video} href={f.href} data-cartao className={classe}>
              {conteudo}
            </Link>
          ) : (
            <button
              key={f.video}
              type="button"
              onClick={criar}
              data-cartao
              className={classe}
            >
              {conteudo}
            </button>
          );
        })}
      </div>
      {setas?.proximo ? (
        <button
          type="button"
          onClick={() =>
            fila.current?.scrollBy({ left: passo(), behavior: "smooth" })
          }
          aria-label={tx("Próximo")}
          className={cn(seta, "-right-3")}
          style={{ top: setas.topo }}
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      ) : null}
    </section>
  );
}

/**
 * Banner de criar um AI Creator: o vídeo do banner em loop; enquanto ele não
 * carrega, dois personagens recortados nas laterais.
 */
function Banner({ onCriar }: { onCriar: () => void }) {
  const [ref, revelar] = useRevelar();
  const [comVideo, setComVideo] = useState(false);
  const pronto = useCallback(() => setComVideo(true), []);
  const recorte =
    "absolute bottom-0 z-[1] h-[96%] w-auto brightness-[.82] contrast-[1.08] max-[860px]:opacity-[.28]";
  return (
    <section
      ref={ref}
      className={cn(
        "relative grid h-[400px] place-items-center overflow-hidden rounded-[20px] border border-white/[0.08] bg-[radial-gradient(ellipse_46%_80%_at_50%_-8%,#3a3634_0%,#1d1b1b_52%,#121011_100%)] after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(ellipse_24%_60%_at_50%_0%,rgba(255,255,255,0.07),transparent_70%)] after:content-[''] max-[860px]:h-auto max-[860px]:pt-14 max-[860px]:pb-12",
        revelar,
      )}
    >
      <VideoEmLoop
        src="/videos_home/BANNER.mp4"
        preload="auto"
        limiar={0.35}
        onPronto={pronto}
        className={cn(
          "absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-[600ms]",
          comVideo ? "opacity-100" : "opacity-0",
        )}
      />
      {comVideo ? null : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lp/cut-dione.webp"
            alt=""
            className={cn(
              recorte,
              "left-[14%] max-[1280px]:left-[2%] max-[860px]:-left-[18%]",
            )}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/lp/cut-romeu.webp"
            alt=""
            className={cn(
              recorte,
              "right-[14%] max-[1280px]:right-[2%] max-[860px]:-right-[18%]",
            )}
          />
        </>
      )}
      <div className="absolute bottom-6 right-6 z-[2]">
        <button
          type="button"
          onClick={onCriar}
          className="inline-flex h-11 items-center rounded-xl bg-nido-yellow px-5 text-[14.5px] font-semibold text-nido-bg shadow-[0_4px_0_#b9ad00] [transition:transform_.15s,box-shadow_.15s,background-color_.2s] hover:-translate-y-px hover:bg-nido-yellow-hi hover:shadow-[0_5px_0_#b9ad00] active:translate-y-[3px] active:shadow-[0_1px_0_#b9ad00]"
        >
          {tx("Criar meu AI Creator")}
        </button>
      </div>
    </section>
  );
}

interface PostDaHome {
  id: string;
  characterId: string;
  redes: string[];
  texto: string;
  titulo: string | null;
  quando: string;
  status: string;
}

const SETE_DIAS = 7 * 86_400_000;
const NOME_REDE: Record<string, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  TWITTER: "X",
  LINKEDIN: "LinkedIn",
};
const DIAS_DA_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
/** Cor do status na agenda: em andamento em amarelo, em análise em laranja, falha em rosa. */
const COR_STATUS: Record<string, string> = {
  PROCESSING: "text-nido-yellow",
  RETRYING: "text-nido-yellow",
  REVIEW: "text-warn",
  ERROR: "text-pink",
};

/** "09h", "18h30". */
function hora(d: Date) {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getHours())}h${d.getMinutes() ? p2(d.getMinutes()) : ""}`;
}

/**
 * Agenda dos próximos 7 dias, de todos os personagens, separada por dia. As
 * falhas de hoje entram na lista para a pessoa tentar de novo.
 */
function Agenda({ personagens }: { personagens: Character[] }) {
  const { user } = useAuth();
  const [ref, revelar] = useRevelar();
  const [posts, setPosts] = useState<PostDaHome[] | null>(null);
  const temPersonagens = personagens.length > 0;

  useEffect(() => {
    if (!user || !temPersonagens) return;
    let vivo = true;
    fetch("/api/social/posts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (b: { posts?: PostDaHome[] } | null) =>
          vivo && setPosts(b?.posts ?? []),
      )
      .catch(() => vivo && setPosts([]));
    return () => {
      vivo = false;
    };
  }, [user, temPersonagens]);

  if (!user) return null;
  const personagem = (id: string) => personagens.find((c) => c.id === id);
  const agora = Date.now();
  const inicioDeHoje = new Date().setHours(0, 0, 0, 0);
  const proximos = (posts ?? [])
    .filter((p) => {
      const quando = new Date(p.quando).getTime();
      if (quando >= agora + SETE_DIAS) return false;
      if (p.status === "ERROR") return quando >= inicioDeHoje;
      return (
        ["SCHEDULED", "PROCESSING", "RETRYING", "REVIEW"].includes(p.status) &&
        quando > agora - 3600_000
      );
    })
    .sort((a, b) => a.quando.localeCompare(b.quando))
    .slice(0, 5);

  const hoje = new Date().toDateString();
  const dias: Array<{ chave: string; data: Date; posts: PostDaHome[] }> = [];
  for (const p of proximos) {
    const data = new Date(p.quando);
    const chave = data.toDateString();
    const ultimo = dias[dias.length - 1];
    if (ultimo?.chave === chave) ultimo.posts.push(p);
    else dias.push({ chave, data, posts: [p] });
  }

  // O calendário abre no personagem do próximo post (ou no mexido por último).
  const doCalendario =
    proximos[0]?.characterId ??
    [...personagens].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;

  return (
    <section
      ref={ref}
      className={revelar}
      style={{ transitionDelay: "70ms" }}
    >
      <div className="mb-[22px] flex items-baseline justify-between gap-4 border-b border-line pb-4">
        <h2 className="font-archivo text-[20px] font-black uppercase tracking-[-0.01em] [font-stretch:118%]">
          {tx("Agenda")}
          <span className="ml-2.5 font-geist-mono text-[12px] font-medium tracking-[0.02em] text-nido-dim [font-stretch:100%]">
            {tx("7 dias")}
          </span>
        </h2>
        {doCalendario ? (
          <Link
            href={linkEstudio(doCalendario, "agendamentos")}
            className="text-[13px] font-medium text-nido-soft transition-colors hover:text-nido-yellow"
          >
            {tx("Calendário")}
          </Link>
        ) : null}
      </div>
      {temPersonagens && posts === null ? (
        <p className="text-[13.5px] text-nido-mute">{tx("Carregando…")}</p>
      ) : dias.length === 0 ? (
        <p className="text-[13.5px] text-nido-mute">
          {tx("Nenhuma publicação agendada para os próximos 7 dias.")}
        </p>
      ) : (
        dias.map((dia) => (
          <div key={dia.chave}>
            <div
              className={cn(
                "pt-[18px] pb-2 font-geist-mono text-[11px] uppercase tracking-[0.12em]",
                dia.chave === hoje ? "text-nido-yellow" : "text-nido-dim",
              )}
            >
              {dia.chave === hoje
                ? tx("Hoje")
                : tx(DIAS_DA_SEMANA[dia.data.getDay()])}
            </div>
            {dia.posts.map((p) => {
              const c = personagem(p.characterId);
              const rosto = c ? capaSrc(c) : undefined;
              const nome = c?.identidade.nome || tx("Sem nome");
              return (
                <Link
                  key={p.id}
                  href={linkEstudio(p.characterId, "agendamentos")}
                  className="group grid grid-cols-[64px_44px_minmax(0,1fr)_auto] items-center gap-4 border-b border-white/[0.05] py-3 text-nido-ink max-sm:grid-cols-[52px_40px_minmax(0,1fr)]"
                >
                  <span className="whitespace-nowrap font-archivo text-[18px] font-extrabold leading-none [font-stretch:112%]">
                    {hora(new Date(p.quando))}
                  </span>
                  <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-[10px] bg-nido-panel text-[13px] font-semibold text-nido-mute">
                    {rosto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={rosto}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-top"
                      />
                    ) : (
                      nome.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-[14px] font-semibold transition-colors duration-200 group-hover:text-nido-yellow">
                      {p.titulo || p.texto}
                    </b>
                    <small className="mt-[3px] block truncate text-[12.5px] text-nido-mute">
                      {nome} · {p.redes.map((r) => NOME_REDE[r] ?? r).join(", ")}
                    </small>
                  </span>
                  <span
                    className={cn(
                      "font-geist-mono text-[10.5px] uppercase tracking-[0.08em] max-sm:hidden",
                      COR_STATUS[p.status] ?? "text-nido-soft",
                    )}
                  >
                    {p.status === "ERROR"
                      ? tx("Falhou · tentar de novo")
                      : tx(STATUS_POST[p.status]?.rotulo ?? p.status)}
                  </span>
                </Link>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
}
