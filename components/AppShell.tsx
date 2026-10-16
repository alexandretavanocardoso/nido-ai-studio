"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronsRight,
  ChevronUp,
  Clapperboard,
  ChartColumn,
  CircleAlert,
  CircleCheck,
  Coins,
  Flame,
  Ghost,
  Gift,
  House,
  ImageIcon,
  Languages,
  LogIn,
  LogOut,
  Menu,
  PanelLeft,
  PenLine,
  Plus,
  Radio,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
  Sticker,
  Terminal,
  WandSparkles,
  X,
  Zap,
  type LucideIcon,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CarteiraNaBarra } from "@/components/carteira/CarteiraNaBarra";
import { IndicadorPontos } from "@/components/pontos/IndicadorPontos";
import { useCreditos } from "@/components/creditos/CreditosProvider";
import { liberadoNaTela } from "@/lib/em-teste";
import { CreateDialog, type InicioCriar } from "@/components/home/CreateDialog";
import { TutorialCriar } from "@/components/home/TutorialCriar";
import { DiscordConta } from "@/components/auth/DiscordConta";
import { useRecursos } from "@/components/RecursosProvider";
import { TarefasEmAndamento } from "@/components/TarefasEmAndamento";
import { NotificacoesTela } from "@/components/NotificacoesTela";
import {
  carregarAvisos,
  ligarNotificacoes,
  limparAvisos,
  marcarAvisosLidos,
  sincronizarAvisos,
  useAvisos,
  useNotificacoes,
} from "@/lib/notificar";
import type { SecaoEstudio } from "@/components/estudio/Estudio";
import { useCharacters } from "@/lib/store";
import { capaSrc } from "@/lib/storage/client";
import type { Character } from "@/lib/types";
import { PLANOS } from "@/lib/planos";
import { cn } from "@/lib/cn";
import { IDIOMAS, useIdioma, useT } from "@/lib/i18n";
import { tx } from "@/lib/i18n/tx";

interface Criar {
  /** Abre o "criar personagem" (ou manda pro login / avisa do limite do plano). */
  criar: () => void;
  /**
   * Igual ao `criar`, mas já entra num modo (campo da Home): IA com o contexto
   * escrito, pela imagem, ou direto na ficha em branco.
   */
  criarCom: (como: InicioCriar | { modo: "manual" }) => void;
  /** O plano não deixa criar mais personagens (mostra o aviso de upgrade). */
  noLimite: boolean;
}

const CriarCtx = createContext<Criar>({
  criar: () => {},
  criarCom: () => {},
  noLimite: false,
});
export const useCriar = () => useContext(CriarCtx);

/** Classe de quem precisa começar depois do menu lateral (a Home usa no próprio conteúdo). */
export const DEPOIS_DO_MENU =
  "lg:pl-[var(--nido-menu)] transition-[padding] duration-300";

const LOGO = "/logo/NIDO%20AI%20STUDIO%20SEM%20FUNDO.png";
const CHAVE_MENU = "nido:menu-recolhido";
/** Marcado depois que a pessoa viu (ou fechou) o tutorial de criar. */
const CHAVE_TUTORIAL = "nido:tutorial-criar";

/**
 * Casca de todas as telas do app (/app/*): o menu lateral (navegação, saldo e
 * conta), a barra do topo (busca, personagem ativo e avisos) e o diálogo de criar personagem,
 * que abre de qualquer tela (atalho N).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const recursos = useRecursos();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { conta } = useCreditos();
  const total = useCharacters((s) => s.characters.length);
  const criarEmBranco = useCharacters((s) => s.createCharacter);
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState<InicioCriar | null>(null);
  const [tutorial, setTutorial] = useState(false);
  const [noLimite, setNoLimite] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const [gaveta, setGaveta] = useState(false);
  const limite = conta ? PLANOS[conta.plano].personagens : Infinity;

  const abrir = useCallback(
    (como: InicioCriar | { modo: "manual" } | null) => {
      if (recursos.login && user === null) return; // sessão ainda carregando
      if (recursos.login && user === undefined)
        return router.push("/auth/login");
      // Limite de personagens do plano: avisa em vez de criar um que não sincronizaria.
      if (total >= limite) {
        setNoLimite(true);
        return router.push("/app");
      }
      setNoLimite(false);
      if (como?.modo === "manual")
        return router.push(`/app/personagem/${criarEmBranco()}`);
      // Primeira vez criando pelo caminho normal: mostra antes como funciona.
      if (como === null && !tutorialVisto()) return setTutorial(true);
      setInicio(como);
      setAberto(true);
    },
    [recursos.login, user, router, total, limite, criarEmBranco],
  );
  const criar = useCallback(() => abrir(null), [abrir]);

  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem(CHAVE_MENU) === "1");
    } catch {}
  }, []);
  const alternarMenu = useCallback(
    () =>
      setRecolhido((v) => {
        try {
          localStorage.setItem(CHAVE_MENU, v ? "0" : "1");
        } catch {}
        return !v;
      }),
    [],
  );
  useEffect(() => setGaveta(false), [pathname]);

  // Atalhos: [ recolhe o menu, N cria, / busca. Nunca enquanto se digita ou com um diálogo aberto.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "[") {
        e.preventDefault();
        alternarMenu();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        criar();
      } else if (e.key === "/") {
        const busca = document.getElementById("nido-busca");
        if (!busca || !busca.offsetParent) return;
        e.preventDefault();
        busca.focus();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [alternarMenu, criar]);

  const naHome = pathname === "/app";
  return (
    <CriarCtx.Provider
      value={{ criar, criarCom: abrir, noLimite: noLimite && total >= limite }}
    >
      <div
        className="relative"
        style={
          { "--nido-menu": recolhido ? "124px" : "288px" } as React.CSSProperties
        }
      >
        <MenuLateral
          recolhido={recolhido}
          gaveta={gaveta}
          onAlternar={alternarMenu}
          onFecharGaveta={() => setGaveta(false)}
          onCriar={criar}
        />
        <BarraDoApp onMenu={() => setGaveta(true)} onCriar={criar} />
        {/* A Home tem o hero de ponta a ponta: ela mesma se afasta do menu. */}
        <div className={naHome ? undefined : cn("pt-[76px]", DEPOIS_DO_MENU)}>
          {children}
        </div>
      </div>
      <CreateDialog
        open={aberto}
        onClose={() => setAberto(false)}
        inicio={inicio}
        onTutorial={() => {
          setAberto(false);
          setTutorial(true);
        }}
      />
      <TutorialCriar
        open={tutorial}
        onClose={() => {
          marcarTutorialVisto();
          setTutorial(false);
        }}
        onConcluir={() => {
          marcarTutorialVisto();
          setTutorial(false);
          setInicio(null);
          setAberto(true);
        }}
      />
      <TarefasEmAndamento />
      <NotificacoesTela />
    </CriarCtx.Provider>
  );
}

function tutorialVisto(): boolean {
  try {
    return localStorage.getItem(CHAVE_TUTORIAL) === "1";
  } catch {
    return true; // sem armazenamento, não insiste no tutorial
  }
}

function marcarTutorialVisto() {
  try {
    localStorage.setItem(CHAVE_TUTORIAL, "1");
  } catch {}
}

interface ItemMenu {
  rotulo: string;
  curto: string;
  icon: LucideIcon;
  href?: string;
  /** Sem destino (ex.: Estúdio sem personagem): abre o criar. */
  onClick?: () => void;
  ativo?: boolean;
  contagem?: string;
  /** Dica ao passar o mouse (title); sem ela, o rótulo. */
  dica?: string;
}

export const FERRAMENTAS: Array<{
  secao: SecaoEstudio;
  rotulo: string;
  curto: string;
  icon: LucideIcon;
}> = [
  { secao: "videos", rotulo: "Vídeos", curto: "Vídeos", icon: Clapperboard },
  { secao: "textos", rotulo: "Textos", curto: "Textos", icon: PenLine },
  { secao: "imagens", rotulo: "Imagens", curto: "Imagens", icon: ImageIcon },
  {
    secao: "figurinhas",
    rotulo: "Figurinhas",
    curto: "Figurinhas",
    icon: Sticker,
  },
  { secao: "publicar", rotulo: "Publicar", curto: "Publicar", icon: Send },
  {
    secao: "agendamentos",
    rotulo: "Agenda",
    curto: "Agenda",
    icon: CalendarClock,
  },
];

/** Link do Estúdio de um personagem, já na ferramenta. */
export function linkEstudio(
  id: string,
  secao: SecaoEstudio,
  /** Etapa da ficha (?step=) a manter, para a aba Ficha voltar nela. */
  step?: string | null,
) {
  return `/app/personagem/${id}?aba=estudio&secao=${secao}${step ? `&step=${encodeURIComponent(step)}` : ""}`;
}

const CHAVE_ATIVO = "nido:personagem-ativo";
const EVENTO_ATIVO = "nido:personagem-ativo";

/** id do personagem aberto na tela (/app/personagem/:id), se houver. */
function idNaRota(pathname: string) {
  return pathname.match(/^\/app\/personagem\/([^/]+)/)?.[1];
}

/**
 * Personagem ativo do app: o que está aberto na tela; fora de um personagem,
 * o último aberto ou escolhido no seletor do topo; sem nenhum, o mexido por
 * último. É nele que os atalhos do Estúdio (menu e Home) abrem.
 */
export function useMaisRecente() {
  const pathname = usePathname();
  const personagens = useCharacters((s) => s.characters);
  const [montado, setMontado] = useState(false);
  const [guardado, setGuardado] = useState<string | null>(null);
  const naRota = idNaRota(pathname);

  useEffect(() => {
    setMontado(true);
    const ler = () => {
      try {
        setGuardado(localStorage.getItem(CHAVE_ATIVO));
      } catch {}
    };
    ler();
    window.addEventListener(EVENTO_ATIVO, ler);
    return () => window.removeEventListener(EVENTO_ATIVO, ler);
  }, []);
  // Abrir um personagem faz dele o ativo.
  useEffect(() => {
    if (naRota) definirAtivo(naRota);
  }, [naRota]);

  return useMemo(() => {
    if (!montado) return undefined;
    return (
      personagens.find((c) => c.id === naRota) ??
      personagens.find((c) => c.id === guardado) ??
      [...personagens].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    );
  }, [montado, personagens, naRota, guardado]);
}

/** Torna o personagem o ativo do app (também usado pelo seletor do cabeçalho do personagem). */
export function definirAtivo(id: string) {
  try {
    if (localStorage.getItem(CHAVE_ATIVO) === id) return;
    localStorage.setItem(CHAVE_ATIVO, id);
  } catch {}
  window.dispatchEvent(new Event(EVENTO_ATIVO));
}

/** O personagem aberto na tela, segundo a URL (/app/personagem/:id?aba=…&secao=…&step=…). */
interface PersonagemNaUrl {
  id: string;
  /** Seção do Estúdio aberta; fora da aba Estúdio, null. */
  secao: SecaoEstudio | null;
  /** Etapa da ficha: os links do menu a mantêm, como fazia o menu interno do Estúdio. */
  step: string | null;
}

/**
 * Avisa o personagem e a seção do Estúdio abertos, lendo a URL como o Wizard:
 * seção desconhecida cai em Vídeos, e ?secao=radar abre a aba Radar (não é do
 * Estúdio). Fica dentro de um Suspense e não desenha nada: o useSearchParams
 * não pode impedir a pré-renderização do menu.
 */
function PersonagemAbertoNaUrl({
  onMudar,
}: {
  onMudar: (v: PersonagemNaUrl | null) => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const id = idNaRota(pathname);
  const pedida = params.get("secao");
  const secao =
    params.get("aba") === "estudio" && pedida !== "radar"
      ? (FERRAMENTAS.find((f) => f.secao === pedida)?.secao ?? "videos")
      : null;
  const step = params.get("step");
  useEffect(
    () => onMudar(id ? { id, secao, step } : null),
    [id, secao, step, onMudar],
  );
  return null;
}

/**
 * Menu lateral: fixo e recolhível no desktop (largura 248px ou 84px), gaveta
 * no celular. As ferramentas sem personagem abrem a própria página; as com
 * personagem, o Estúdio do personagem ativo.
 */
function MenuLateral({
  recolhido,
  gaveta,
  onAlternar,
  onFecharGaveta,
  onCriar,
}: {
  recolhido: boolean;
  gaveta: boolean;
  onAlternar: () => void;
  onFecharGaveta: () => void;
  onCriar: () => void;
}) {
  const pathname = usePathname();
  const { conta } = useCreditos();
  const total = useCharacters((s) => s.characters.length);
  // As ferramentas do Estúdio abrem no personagem ativo (seletor do topo).
  const recente = useMaisRecente();
  const alvo = recente;
  // No celular a gaveta sempre abre inteira.
  const mini = recolhido && !gaveta;
  // O Estúdio não tem menu próprio: é aqui que a seção aberta fica marcada.
  const [naUrl, setNaUrl] = useState<PersonagemNaUrl | null>(null);
  // Só vale se o personagem da tela é o mesmo dos links (um excluído, por exemplo, não é).
  const daTela = naUrl && alvo && naUrl.id === alvo.id ? naUrl : null;

  // Nome do personagem em que as ferramentas abrem: vai na dica do mouse.
  const nomeAlvo = alvo
    ? alvo.identidade.nome.trim() || tx("Sem nome")
    : null;

  // Ferramentas do Estúdio: abrem no personagem ativo; sem nenhum, abrem o criar.
  const doEstudio = (f: (typeof FERRAMENTAS)[number]): ItemMenu => ({
    rotulo: tx(f.rotulo),
    curto: tx(f.curto),
    icon: f.icon,
    ativo: daTela?.secao === f.secao,
    dica: `${tx(f.rotulo)} · ${nomeAlvo ?? tx("Crie um AI Creator primeiro")}`,
    ...(alvo
      ? { href: linkEstudio(alvo.id, f.secao, daTela?.step) }
      : {
          // Botão, não link: o <nav> só fecha a gaveta do celular em clique de link.
          onClick: () => {
            onFecharGaveta();
            onCriar();
          },
        }),
  });

  const grupos: Array<{
    /** Título do grupo. Sem ele, o grupo continua o de cima (no menu recolhido, ganha a linha fina). */
    rotulo?: string;
    /** Pasta recolhível com este nome e ícone; a chave guarda se a pessoa a fechou. */
    pasta?: { rotulo: string; icon: LucideIcon; chave: string };
    itens: ItemMenu[];
  }> = [
    {
      rotulo: tx("Principal"),
      itens: [
        {
          rotulo: tx("Home"),
          curto: tx("Home"),
          icon: House,
          href: "/app",
          ativo: pathname === "/app",
        },
        {
          rotulo: tx("Personagens"),
          curto: tx("Personagens"),
          icon: Users,
          href: "/app/personagens",
          ativo: pathname.startsWith("/app/personagen"),
          contagem: recente ? String(total).padStart(2, "0") : undefined,
        },
      ],
    },
    {
      // Personagem opcional: cada página escolhe um personagem, uma foto ou nenhum.
      rotulo: tx("Ferramentas"),
      pasta: {
        rotulo: tx("Sem personagem"),
        icon: WandSparkles,
        chave: "nido:menu-ferramentas-livres",
      },
      itens: [
        {
          rotulo: tx("Sombra"),
          curto: tx("Sombra"),
          icon: Ghost,
          href: "/app/sombra",
          ativo: pathname === "/app/sombra",
        },
        // Em teste: fechada, só as contas admin veem (lib/em-teste.ts).
        ...(liberadoNaTela("live", conta)
          ? [
              {
                rotulo: tx("Live"),
                curto: tx("Live"),
                icon: Radio,
                href: "/app/live",
                ativo: pathname === "/app/live",
              },
            ]
          : []),
        // Em teste: fechado, só as contas admin veem (lib/em-teste.ts).
        ...(liberadoNaTela("video_produto", conta)
          ? [
              {
                rotulo: tx("Produto"),
                curto: tx("Produto"),
                icon: ShoppingBag,
                href: "/app/produto",
                ativo: pathname === "/app/produto",
              },
            ]
          : []),
        // Em teste: fechado, só as contas admin veem (lib/em-teste.ts).
        ...(liberadoNaTela("motion", conta)
          ? [
              {
                rotulo: tx("Motion"),
                curto: tx("Motion"),
                icon: Sparkles,
                href: "/app/motion",
                ativo: pathname === "/app/motion",
              },
            ]
          : []),
      ],
    },
    {
      // Precisam de personagem: abrem o Estúdio do personagem ativo (sem nenhum, o criar).
      // Sem título: continua as Ferramentas, logo abaixo da pasta Sem personagem.
      pasta: {
        rotulo: tx("Com personagem"),
        icon: UserRound,
        chave: "nido:menu-ferramentas",
      },
      itens: FERRAMENTAS.filter((f) => f.secao !== "agendamentos").map(
        doEstudio,
      ),
    },
    {
      rotulo: tx("Acompanhar"),
      itens: [
        {
          rotulo: tx("Radar"),
          curto: tx("Radar"),
          icon: Zap,
          href: "/app/radar",
          ativo: pathname === "/app/radar",
        },
        ...FERRAMENTAS.filter((f) => f.secao === "agendamentos").map(
          doEstudio,
        ),
        {
          rotulo: tx("Dashboard"),
          curto: tx("Dashboard"),
          icon: ChartColumn,
          href: "/app/dashboard",
          ativo: pathname === "/app/dashboard",
        },
      ],
    },
    {
      rotulo: tx("Mais"),
      itens: [
        {
          rotulo: tx("Créditos"),
          curto: tx("Créditos"),
          icon: Coins,
          href: "/app/planos",
          ativo: pathname === "/app/planos",
        },
        // Em teste: fechados, só as contas admin veem (lib/em-teste.ts).
        ...(liberadoNaTela("indicacoes", conta)
          ? [
              {
                rotulo: tx("Indique e ganhe"),
                curto: tx("Indicar"),
                icon: Gift,
                href: "/app/indicacoes",
                ativo: pathname === "/app/indicacoes",
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <>
      {gaveta ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onFecharGaveta}
          aria-hidden
        />
      ) : null}
      <aside
        className={cn(
          // overflow-y-auto: numa tela baixa (celular deitado, ou com a conta aberta) o menu inteiro rola; antes o rodapé era cortado e ficava inalcançável.
          "fixed top-3 bottom-3 left-3 z-40 flex flex-col overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-[18px] border border-white/[0.08] bg-[rgba(15,13,14,0.82)] backdrop-blur-[22px] font-geist text-nido-ink",
          "transition-[width,transform] duration-300 ease-[cubic-bezier(.16,1,.3,1)]",
          mini ? "w-[84px]" : "w-[248px]",
          gaveta
            ? "translate-x-0"
            : "-translate-x-[calc(100%+12px)] lg:translate-x-0",
        )}
      >
        {mini ? (
          <div className="flex flex-col items-center gap-3 px-2 pt-4 pb-3">
            <button
              type="button"
              onClick={onAlternar}
              title={tx("Expandir menu ( [ )")}
              aria-label={tx("Expandir menu ( [ )")}
              className="flex h-14 w-16 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#141213] transition hover:border-nido-yellow/50"
            >
              {/* O PNG é quadrado com margem: neste tamanho o logo inteiro (NIDO + AI Studio) cabe no botão. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOGO}
                alt="NIDO AI Studio"
                className="h-20 w-20 max-w-none shrink-0 drop-shadow-[0_0_8px_rgba(253,243,39,0.2)]"
              />
            </button>
            <SeloBeta className="-mt-1.5" />
            {/* Seta: deixa claro que o menu abre (o logo também abre, mas não parece botão). */}
            <button
              type="button"
              onClick={onAlternar}
              title={tx("Expandir menu ( [ )")}
              aria-label={tx("Expandir menu ( [ )")}
              className="grid h-7 w-16 place-items-center rounded-[9px] border border-white/[0.08] text-nido-mute transition hover:border-nido-yellow/50 hover:bg-white/[0.05] hover:text-nido-yellow"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCriar}
              title={tx("Novo AI Creator (N)")}
              className="flex flex-col items-center gap-[5px] text-nido-ink"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-nido-yellow text-nido-bg shadow-[0_0_22px_-6px_rgba(253,243,39,0.6)]">
                <Plus className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[10.5px] font-medium">{tx("Criar")}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 px-3.5 pt-4 pb-3.5">
            <div className="flex h-[60px] items-center justify-between gap-2">
              <div className="flex items-start gap-0.5">
                {/* O PNG é quadrado com margem: a janela corta só a margem e mostra o logo inteiro (NIDO + AI Studio). */}
                <Link
                  href="/app"
                  aria-label={tx("Home")}
                  className="flex h-[60px] w-[88px] items-center justify-center overflow-hidden rounded-lg transition hover:opacity-90"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={LOGO}
                    alt="NIDO AI Studio"
                    className="h-[100px] w-[100px] max-w-none shrink-0 drop-shadow-[0_0_10px_rgba(253,243,39,0.18)]"
                  />
                </Link>
                {/* Na altura do "NIDO" do logo, como um sobrescrito. */}
                <SeloBeta className="mt-2.5" />
              </div>
              <button
                type="button"
                onClick={onAlternar}
                title={tx("Recolher menu ( [ )")}
                aria-label={tx("Recolher menu ( [ )")}
                className="hidden h-8 w-8 place-items-center rounded-[9px] border border-white/[0.08] text-nido-mute transition hover:bg-white/[0.05] hover:text-nido-ink lg:grid"
              >
                <PanelLeft className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={onFecharGaveta}
                aria-label={tx("Fechar")}
                className="grid h-8 w-8 place-items-center rounded-[9px] border border-white/[0.08] text-nido-mute transition hover:text-nido-ink lg:hidden"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <button
              type="button"
              onClick={onCriar}
              className="flex h-[42px] items-center gap-2.5 rounded-xl bg-nido-yellow px-3.5 text-[13.5px] font-semibold text-nido-bg shadow-[0_0_24px_-6px_rgba(253,243,39,0.55)] transition hover:bg-nido-yellow-hi active:bg-[#e6dc12]"
            >
              <Plus className="h-[18px] w-[18px]" />
              <span className="flex-1 text-left">{tx("Novo AI Creator")}</span>
              <span className="rounded-[5px] bg-nido-bg/[0.12] px-1.5 py-0.5 font-geist-mono text-[10.5px]">
                N
              </span>
            </button>
          </div>
        )}

        <Suspense fallback={null}>
          <PersonagemAbertoNaUrl onMudar={setNaUrl} />
        </Suspense>
        <nav
          aria-label={tx("Principal")}
          // Trocar de seção do Estúdio muda só o ?secao= (o pathname fica): sem isto a gaveta do celular ficava aberta por cima da tela.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) onFecharGaveta();
          }}
          // Em tela baixa (até 640px de altura) a lista não rola por dentro: quem rola é o menu inteiro.
          className="flex min-h-[120px] flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden px-2.5 pt-1 pb-2.5 [scrollbar-width:none] [@media(max-height:640px)]:flex-none [@media(max-height:640px)]:overflow-visible"
        >
          {grupos
            .filter((g) => g.itens.length > 0)
            .map((g, gi) => (
              <div
                key={g.rotulo ?? g.pasta?.chave}
                className="flex flex-col gap-0.5"
              >
                {mini ? (
                  gi > 0 ? (
                    <div className="mx-3.5 my-2 h-px bg-white/[0.08]" />
                  ) : null
                ) : g.rotulo ? (
                  <div className="px-2.5 pt-3 pb-1.5 font-geist-mono text-[10px] uppercase tracking-[0.14em] text-nido-dim">
                    {g.rotulo}
                  </div>
                ) : null}
                {g.pasta ? (
                  <PastaDoMenu
                    rotulo={g.pasta.rotulo}
                    icon={g.pasta.icon}
                    chave={g.pasta.chave}
                    itens={g.itens}
                    mini={mini}
                  />
                ) : (
                  g.itens.map((it) => (
                    <LinhaMenu key={it.rotulo} item={it} mini={mini} />
                  ))
                )}
              </div>
            ))}
        </nav>

        {conta ? (
          mini ? (
            <Link
              href="/app/planos"
              title={tx("Planos e créditos")}
              className="flex flex-col items-center gap-[3px] border-t border-white/[0.06] px-2 pt-3 pb-2.5"
            >
              <Coins className="h-[18px] w-[18px] text-nido-yellow" />
              <span className="font-geist-mono text-[10.5px] font-semibold">
                {conta.total.toLocaleString("pt-BR")}
              </span>
            </Link>
          ) : (
            <div className="border-t border-white/[0.06] px-3 pt-2.5">
              <div className="flex flex-col gap-2 px-0.5 py-2.5">
                <div className="flex items-center gap-2">
                  <Coins className="h-[18px] w-[18px] shrink-0 text-nido-yellow" />
                  <span className="font-geist-mono text-sm font-bold">
                    {conta.total.toLocaleString("pt-BR")}
                  </span>
                  {/* Com saldo de 6 dígitos a linha não cabe em 248px: quem cede é a palavra "créditos". */}
                  <span className="min-w-0 truncate text-xs text-nido-mute">
                    {tx("créditos")}
                  </span>
                  <Link
                    href="/app/planos"
                    className="-my-2 ml-auto shrink-0 py-2 text-xs font-semibold text-nido-yellow hover:text-nido-yellow-hi"
                  >
                    {tx("Recarregar")}
                  </Link>
                </div>
                <div className="h-1 overflow-hidden rounded bg-white/[0.07]">
                  <div
                    className="h-full bg-gradient-to-r from-nido-ocre to-nido-yellow"
                    style={{
                      width: `${Math.min(100, (conta.creditosPlano / Math.max(1, PLANOS[conta.plano].creditos)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="truncate font-geist-mono text-[10.5px] text-nido-dim">
                  {tx("Plano")} {PLANOS[conta.plano].nome}
                  {diasAte(conta.proximaRecargaEm) != null
                    ? ` · ${tx("renova em")} ${diasAte(conta.proximaRecargaEm)}d`
                    : ""}
                </span>
              </div>
            </div>
          )
        ) : null}
        <ContaDoMenu mini={mini} onExpandir={onAlternar} />
      </aside>
    </>
  );
}

/** Selo "BETA" junto do logo do menu: o app ainda está em beta. */
function SeloBeta({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded-[5px] border border-nido-yellow/35 bg-nido-yellow/10 px-1.5 py-[3px] font-geist-mono text-[9.5px] font-semibold leading-none tracking-[0.14em] text-nido-yellow",
        className,
      )}
    >
      BETA
    </span>
  );
}

/**
 * Conta no rodapé do menu: quem está logado e, ao clicar, admin,
 * idioma e sair (abre dentro do próprio menu). Sem login, o botão de entrar.
 */
function ContaDoMenu({
  mini,
  onExpandir,
}: {
  mini: boolean;
  onExpandir: () => void;
}) {
  const recursos = useRecursos();
  const { user, disabled, signOut } = useAuth();
  const { conta } = useCreditos();
  const { idioma, setIdioma } = useIdioma();
  const t = useT();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  // user === null → ainda carregando (não mostra nada pra não piscar)
  if (!recursos.login || disabled || user === null) return null;

  if (user === undefined)
    return (
      <div className="border-t border-white/[0.06] p-3">
        <Link
          href="/auth/login"
          title={t("conta.entrar")}
          className={cn(
            "flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.12] text-[13px] font-semibold text-nido-ink transition hover:border-nido-yellow/50 hover:text-nido-yellow",
            mini && "mx-auto w-10",
          )}
        >
          <LogIn className="h-4 w-4" />
          {mini ? null : t("conta.entrar")}
        </Link>
      </div>
    );

  const email = user.email ?? t("conta.semEmail");
  const nome = user.name || email.split("@")[0];
  const avatar = (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#5c2a1f,#aa7d43)] text-[13px] font-bold text-nido-ink">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="h-full w-full object-cover" />
      ) : (
        (nome[0] ?? "?").toUpperCase()
      )}
    </span>
  );

  if (mini)
    return (
      <div className="flex justify-center border-t border-white/[0.06] px-2 py-3">
        <button
          type="button"
          onClick={() => {
            onExpandir();
            setAberto(true);
          }}
          title={nome}
          aria-label={nome}
        >
          {avatar}
        </button>
      </div>
    );

  const item =
    "flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] text-nido-mute transition hover:bg-white/[0.05] hover:text-nido-ink";
  return (
    <div className="border-t border-white/[0.06] p-3">
      {aberto ? (
        <div className="mb-2 flex flex-col gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1.5">
          <div className="truncate px-2.5 pt-1 pb-1.5 text-[11.5px] text-nido-dim">
            {email}
          </div>
          {conta?.admin ? (
            <Link
              href="/app/admin"
              onClick={() => setAberto(false)}
              className={item}
            >
              <ShieldCheck className="h-4 w-4" />
              Admin
            </Link>
          ) : null}
          <Link
            href="/app/perfil"
            onClick={() => setAberto(false)}
            className={item}
          >
            <UserRound className="h-4 w-4" />
            {tx("Perfil")}
          </Link>
          <DiscordConta className={item} />
          <div className="flex items-center gap-2.5 px-2.5 py-1">
            <Languages
              className="h-4 w-4 shrink-0 text-nido-mute"
              aria-label={t("conta.idioma")}
            />
            <div className="grid flex-1 grid-cols-2 gap-1">
              {IDIOMAS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setIdioma(i.id)}
                  aria-pressed={idioma === i.id}
                  className={cn(
                    "h-7 rounded-lg text-[12px] font-semibold transition",
                    idioma === i.id
                      ? "bg-nido-yellow text-nido-bg"
                      : "text-nido-mute hover:bg-white/[0.05] hover:text-nido-ink",
                  )}
                >
                  {i.id === "pt" ? tx("PT-BR") : "EN"}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              setAberto(false);
              await signOut();
              router.push("/");
            }}
            className={cn(item, "hover:bg-pink/10 hover:text-pink")}
          >
            <LogOut className="h-4 w-4" />
            {t("conta.sair")}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2.5 rounded-xl p-1 text-left transition hover:bg-white/[0.05]"
      >
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold">{nome}</span>
          <span className="truncate text-[11px] text-nido-dim">
            {conta ? `${tx("Plano")} ${PLANOS[conta.plano].nome}` : email}
          </span>
        </span>
        <ChevronUp
          className={cn(
            "h-4 w-4 shrink-0 text-nido-mute transition",
            aberto && "rotate-180",
          )}
        />
      </button>
    </div>
  );
}

function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/**
 * Pasta recolhível do menu (Ferramentas): começa aberta, lembra se a pessoa
 * fechou (cada pasta na sua `chave` do localStorage) e abre sozinha quando a
 * tela aberta é um dos itens. No menu recolhido os itens ficam sempre à mostra.
 */
function PastaDoMenu({
  rotulo,
  icon: Icone,
  chave,
  itens,
  mini,
}: {
  rotulo: string;
  icon: LucideIcon;
  chave: string;
  itens: ItemMenu[];
  mini: boolean;
}) {
  const temAtivo = itens.some((it) => it.ativo);
  const [aberta, setAberta] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(chave) === "0") setAberta(false);
    } catch {}
  }, [chave]);
  useEffect(() => {
    if (temAtivo) setAberta(true);
  }, [temAtivo]);
  const alternar = () =>
    setAberta((v) => {
      try {
        localStorage.setItem(chave, v ? "0" : "1");
      } catch {}
      return !v;
    });
  const visivel = mini || aberta;

  return (
    <>
      {mini ? null : (
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberta}
          className={cn(
            "flex h-[38px] w-full items-center gap-3 rounded-[10px] px-2.5 text-left text-[13.5px] font-medium transition hover:bg-white/[0.05] hover:text-nido-ink",
            aberta ? "text-nido-ink" : "text-nido-mute",
          )}
        >
          <Icone className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
          <span className="flex-1 whitespace-nowrap">{rotulo}</span>
          <ChevronDown
            className={cn(
              "h-[15px] w-[15px] shrink-0 transition-transform duration-[250ms]",
              aberta && "rotate-180",
            )}
            strokeWidth={1.75}
          />
        </button>
      )}
      <div
        inert={!visivel}
        className={cn(
          "grid transition-[grid-template-rows] duration-[280ms]",
          visivel ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-col gap-0.5 overflow-hidden",
            !mini && "ml-[18px] border-l border-white/[0.08] pl-2.5",
          )}
        >
          {itens.map((it) => (
            <LinhaMenu key={it.rotulo} item={it} mini={mini} sub={!mini} />
          ))}
        </div>
      </div>
    </>
  );
}

function LinhaMenu({
  item: it,
  mini,
  sub,
}: {
  item: ItemMenu;
  mini: boolean;
  /** Item dentro de uma pasta: mais baixo e com a marca de ativo sobre a linha da pasta. */
  sub?: boolean;
}) {
  const conteudo = mini ? (
    <>
      <span
        className={cn(
          "grid h-9 w-10 place-items-center rounded-[10px]",
          it.ativo && "bg-nido-yellow/10",
        )}
      >
        <it.icon className="h-[19px] w-[19px]" strokeWidth={1.75} />
      </span>
      <span className="whitespace-nowrap text-[10px] font-medium">
        {it.curto}
      </span>
    </>
  ) : (
    <>
      {it.ativo ? (
        <span
          className={cn(
            "absolute top-[9px] bottom-[9px] w-[3px] rounded-r-[3px] bg-nido-yellow shadow-[0_0_10px_#fdf327]",
            sub ? "-left-[11px]" : "-left-2.5",
          )}
        />
      ) : null}
      <it.icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
      <span className="flex-1 whitespace-nowrap">{it.rotulo}</span>
      {it.contagem ? (
        <span className="rounded-full bg-white/[0.06] px-[7px] py-0.5 font-geist-mono text-[10.5px] text-nido-mute">
          {it.contagem}
        </span>
      ) : null}
    </>
  );
  const classe = cn(
    "transition hover:text-nido-ink",
    it.ativo ? "text-nido-yellow" : "text-nido-mute",
    mini
      ? "flex w-full flex-col items-center gap-1 py-1.5"
      : cn(
          "relative flex w-full items-center gap-3 rounded-[10px] px-2.5 text-left font-medium hover:bg-white/[0.05]",
          sub ? "h-[34px] text-[13px]" : "h-[38px] text-[13.5px]",
          it.ativo && "bg-nido-yellow/10",
        ),
  );
  return it.href ? (
    <Link
      href={it.href}
      title={it.dica ?? it.rotulo}
      aria-current={it.ativo ? "page" : undefined}
      className={classe}
    >
      {conteudo}
    </Link>
  ) : (
    <button
      type="button"
      onClick={it.onClick}
      title={it.dica ?? it.rotulo}
      className={classe}
    >
      {conteudo}
    </button>
  );
}

/** Barra do topo: fica sobre o conteúdo (rola junto com a página), 52px de altura. */
function BarraDoApp({
  onMenu,
  onCriar,
}: {
  onMenu: () => void;
  onCriar: () => void;
}) {
  return (
    <header className="absolute top-3 left-0 right-0 z-30 flex h-[52px] items-center justify-between gap-3 px-4 font-geist transition-[padding] duration-300 sm:pr-6 lg:pl-[var(--nido-menu)]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onMenu}
          aria-label={tx("Menu")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-[rgba(15,13,14,0.6)] text-nido-soft backdrop-blur-lg lg:hidden"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
        <BuscaPersonagens />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CarteiraNaBarra />
        <IndicadorPontos />
        <AvisosRadar />
        <AtalhoMcp />
        <button
          type="button"
          onClick={onCriar}
          aria-label={tx("Novo AI Creator")}
          className="grid h-9 w-9 place-items-center rounded-full bg-nido-yellow text-nido-bg lg:hidden"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
        </button>
      </div>
    </header>
  );
}

/** Busca da barra: acha um personagem pelo nome ou pela bio (atalho /). */
function BuscaPersonagens() {
  const t = useT();
  const personagens = useCharacters((s) => s.characters);
  const [q, setQ] = useState("");
  const [foco, setFoco] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!foco) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setFoco(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [foco]);

  const termo = q.trim().toLowerCase();
  const achados = termo
    ? personagens
        .filter((c) =>
          `${c.identidade.nome} ${c.identidade.bio ?? ""}`
            .toLowerCase()
            .includes(termo),
        )
        .slice(0, 6)
    : [];

  return (
    // min-w-0: num tablet a busca encolhe para o espaço que sobra, em vez de passar por cima dos botões da direita.
    <div ref={caixa} className="relative hidden w-full min-w-0 max-w-[380px] sm:block">
      <label className="flex h-[42px] items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[rgba(15,13,14,0.6)] pl-3.5 pr-2.5 text-nido-mute backdrop-blur-lg transition focus-within:border-white/[0.18] hover:border-white/[0.18]">
        <Search className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
        <input
          id="nido-busca"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFoco(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          placeholder={tx("Buscar AI Creators")}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-nido-ink outline-none placeholder:text-nido-mute"
        />
        <span className="rounded-md border border-white/10 px-[7px] py-[3px] font-geist-mono text-[10.5px]">
          /
        </span>
      </label>
      {foco && termo ? (
        <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-white/[0.08] bg-nido-panel shadow-card">
          {achados.length ? (
            achados.map((c) => (
              <Link
                key={c.id}
                href={`/app/personagem/${c.id}`}
                onClick={() => {
                  setFoco(false);
                  setQ("");
                }}
                className="block border-b border-white/[0.06] px-3.5 py-2.5 transition last:border-b-0 hover:bg-white/[0.04]"
              >
                <span className="block truncate text-[13px] font-semibold text-nido-ink">
                  {c.identidade.nome || tx("Sem nome")}
                </span>
                {c.identidade.bio ? (
                  <span className="block truncate text-[12px] text-nido-mute">
                    {c.identidade.bio}
                  </span>
                ) : null}
              </Link>
            ))
          ) : (
            <div className="px-3.5 py-3 text-[13px] text-nido-mute">
              {t("personagem.naoEncontrado")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface AvisoRadar {
  characterId: string;
  dia: string;
  destaques: number;
  titulo: string;
}

/**
 * Sino da barra, sempre à vista para quem está logado:
 *  - o que terminou (vídeo, imagem, figurinha…) ou falhou — lib/notificar.ts;
 *  - radares novos (de hoje ou ontem) com assunto quente, ainda não abertos.
 *    Abrir o Radar do personagem limpa o dele.
 * O número é o que ainda não foi visto; abrir o sino marca como visto.
 */
/** Conectar o Claude e o ChatGPT (MCP): um botão só, para quem tem acesso ao recurso (lib/em-teste.ts). */
function AtalhoMcp() {
  const { conta } = useCreditos();
  const pathname = usePathname();
  if (!conta || !liberadoNaTela("mcp", conta)) return null;
  const ativo = pathname === "/app/conexoes";
  return (
    <Link
      href="/app/conexoes"
      title={tx("Claude e ChatGPT (MCP)")}
      aria-label={tx("Claude e ChatGPT (MCP)")}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "hidden h-9 w-9 items-center justify-center rounded-full border bg-panel transition sm:inline-flex",
        ativo
          ? "border-accent text-accent"
          : "border-line text-ink hover:border-line-strong",
      )}
    >
      <Terminal className="h-4 w-4" />
    </Link>
  );
}

function AvisosRadar() {
  const { user } = useAuth();
  const recursos = useRecursos();
  const personagens = useCharacters((s) => s.characters);
  const [avisos, setAvisos] = useState<AvisoRadar[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const prontos = useAvisos();
  const { permissao } = useNotificacoes();
  useEffect(() => {
    if (user) carregarAvisos();
  }, [user]);

  const carregar = useCallback(() => {
    if (!recursos.login || !user) return setAvisos([]);
    fetch("/api/radar/avisos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { avisos?: AvisoRadar[] } | null) => setAvisos(b?.avisos ?? []))
      .catch(() => {});
  }, [recursos.login, user]);

  useEffect(() => {
    carregar();
    // O Radar avisa quando foi aberto; ao voltar para a aba, confere de novo.
    const visto = () => carregar();
    const foco = () => {
      if (document.visibilityState !== "visible") return;
      carregar();
      // O que terminou em outro aparelho, ou com o app fechado.
      void sincronizarAvisos();
    };
    window.addEventListener("nido:radar-visto", visto);
    document.addEventListener("visibilitychange", foco);
    return () => {
      window.removeEventListener("nido:radar-visto", visto);
      document.removeEventListener("visibilitychange", foco);
    };
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => {
      document.removeEventListener("mousedown", fora);
      // Fechou: o que estava na lista conta como visto.
      marcarAvisosLidos();
    };
  }, [aberto]);

  if (!user) return null;
  const total =
    avisos.reduce((t, a) => t + a.destaques, 0) +
    prontos.filter((a) => !a.lida).length;
  const abrir = () => {
    if (!aberto) void sincronizarAvisos();
    setAberto((v) => !v);
  };
  return (
    // No celular o painel se alinha à barra, não ao sino (preso ao sino, ele saía pela esquerda da tela).
    <div className="sm:relative" ref={caixa}>
      <button
        type="button"
        onClick={abrir}
        aria-label={`${tx("Notificações")}: ${total}`}
        aria-expanded={aberto}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-full border border-line bg-panel text-ink hover:border-line-strong transition"
      >
        <Bell className="w-4 h-4" />
        {total > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-bg text-[11px] font-bold grid place-items-center">
            {total}
          </span>
        ) : null}
      </button>
      {aberto ? (
        <div className="absolute right-4 sm:right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[70dvh] overflow-y-auto rounded-xl border border-line bg-panel shadow-card z-40">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-line text-[11px] mono uppercase tracking-wider text-ink-dim">
            {tx("Notificações")}
            {prontos.length > 0 ? (
              <button
                type="button"
                onClick={limparAvisos}
                className="normal-case tracking-normal text-ink-mute hover:text-ink"
              >
                {tx("Limpar")}
              </button>
            ) : null}
          </div>
          {prontos.length === 0 && avisos.length === 0 ? (
            <p className="px-3.5 py-5 text-[13px] text-ink-mute">
              {tx(
                "Nada por aqui ainda. Quando um vídeo, imagem ou figurinha ficar pronto, aparece aqui.",
              )}
            </p>
          ) : null}
          {prontos.map((a) => {
            const linha = (
              <>
                {a.erro ? (
                  <CircleAlert className="w-4 h-4 text-pink shrink-0 mt-0.5" />
                ) : (
                  <CircleCheck className="w-4 h-4 text-ok shrink-0 mt-0.5" />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[13px] text-ink line-clamp-2",
                      !a.lida && "font-semibold",
                    )}
                  >
                    {tx(a.erro ? "Não deu certo:" : "Terminou:")} {tx(a.rotulo)}
                  </span>
                  <span className="block text-[11px] text-ink-dim">
                    {new Date(a.quando).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                {!a.lida ? (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                ) : null}
              </>
            );
            const classe =
              "flex gap-2.5 px-3.5 py-3 border-b border-line last:border-b-0";
            return a.href ? (
              <Link
                key={a.id}
                href={a.href}
                onClick={abrir}
                className={cn(classe, "hover:bg-bg transition")}
              >
                {linha}
              </Link>
            ) : (
              <div key={a.id} className={classe}>
                {linha}
              </div>
            );
          })}
          {permissao === "perguntar" ? (
            <button
              type="button"
              onClick={() => void ligarNotificacoes()}
              className="flex w-full items-center gap-2.5 px-3.5 py-3 border-b border-line text-left text-[12px] text-ink-mute hover:bg-bg hover:text-ink transition"
            >
              <Bell className="w-4 h-4 shrink-0 text-accent" />
              {tx("Avisar também pelo navegador quando eu estiver em outra aba")}
            </button>
          ) : null}
          {avisos.length > 0 ? (
            <div className="px-3.5 py-2.5 border-b border-line text-[11px] mono uppercase tracking-wider text-ink-dim">
              {tx("Em alta nos seus personagens")}
            </div>
          ) : null}
          {avisos.map((a) => {
            const nome =
              personagens.find((c) => c.id === a.characterId)?.identidade
                .nome || tx("Sem nome");
            return (
              <Link
                key={a.characterId}
                href={`/app/personagem/${a.characterId}?aba=radar`}
                onClick={abrir}
                className="flex gap-2.5 px-3.5 py-3 hover:bg-bg transition border-b border-line last:border-b-0"
              >
                <Flame className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink truncate">
                    {nome} · {a.destaques}{" "}
                    {a.destaques === 1
                      ? tx("assunto quente")
                      : tx("assuntos quentes")}
                  </span>
                  <span className="block text-[12px] text-ink-mute line-clamp-2">
                    {a.titulo}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
