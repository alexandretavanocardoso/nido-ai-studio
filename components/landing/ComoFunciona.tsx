"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IMG } from "./cenas";
import { useCena, useProgresso } from "./palco";

/**
 * 07 · Como funciona: tour da plataforma preso ao scroll. São 8 passos
 * (escolher como começar + as 7 etapas do wizard), cada um com a sua animação.
 */
const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;
const svg = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ETAPAS = [
  "Identidade",
  "Visual",
  "Personalidade",
  "Nicho e Estratégia",
  "Voz e Linguagem",
  "Monetização e Marcas",
  "Revisão",
];

/** Moldura do wizard: etapas na lateral (a atual acesa) e o conteúdo da etapa `n`. */
function Wizard({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="cf-wz">
      <div className="cf-ws">
        {ETAPAS.map((nome, i) => (
          <div
            key={nome}
            className={`cf-wi${i + 1 < n ? " dn" : i + 1 === n ? " on" : ""}`}
          >
            <span className="c">{i + 1 < n ? "✓" : i + 1}</span>
            <span>
              {nome}
              <i className="pg">
                <b />
              </i>
            </span>
          </div>
        ))}
      </div>
      <div className="cf-wc">
        <div className="cf-wh">
          <b>{ETAPAS[n - 1]}</b>
          <span>Etapa {n} de 7</span>
        </div>
        {children}
      </div>
    </div>
  );
}

const OPCOES: Array<[string, string, ReactNode]> = [
  [
    "Expandir com IA",
    "Uma frase e a IA preenche a ficha.",
    <>
      <path d="m15 4-11 11 5 5L20 9z" />
      <path d="M19 2v3M17.5 3.5h3M5 3v2M4 4h2" />
    </>,
  ],
  [
    "Começar pela imagem",
    "Gere o rosto e vá para a ficha.",
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m21 15-5-5L5 21" />
    </>,
  ],
  [
    "Criar manualmente",
    "Wizard em branco, no seu ritmo.",
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
    </>,
  ],
  [
    "Importar personagem",
    "Envie a ficha em .json.",
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3" />
    </>,
  ],
];

const Comeco = () => (
  <div className="cf-vs">
    <div className="mh cf-an" style={d(0.05)}>
      <span>Novo AI Creator</span>
      <b>Como você quer começar?</b>
    </div>
    <div className="cf-og">
      {OPCOES.map(([titulo, texto, icone], i) => (
        <div
          key={titulo}
          className={`cf-op cf-an${i ? "" : " rec"}`}
          style={d(0.2 + i * 0.1)}
        >
          <span className="oi">
            <svg {...svg}>{icone}</svg>
          </span>
          <div>
            <b>
              {titulo} {i ? null : <em>Recomendado</em>}
            </b>
            <span>{texto}</span>
          </div>
        </div>
      ))}
    </div>
    <svg className="cur" viewBox="0 0 24 24">
      <path
        d="M4 2l16 9-7 1.6L9.5 20z"
        fill="#f6f1e7"
        stroke="#0b0a0a"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

/** [rótulo, valor, classe, atraso da caixa, atraso do texto] */
const CAMPOS: Array<[string, string, string, number, number]> = [
  ["Nome", "Arnaldo Nitro", "w", 0.1, 0.35],
  ["Nº na fábrica", "#001", "y", 0.2, 0.85],
  ["Idade", "34 anos", "", 0.25, 1.15],
  ["Origem", "Belo Horizonte, MG", "", 0.3, 1.45],
  ["Arquétipo", "O galã debochado", "", 0.35, 1.75],
  ["Backstory", "Ex-alfaiate que virou referência de estilo", "w", 0.4, 2.05],
];
const Identidade = () => (
  <Wizard n={1}>
    <div className="cf-fg">
      {CAMPOS.map(([rotulo, valor, classe, caixa, texto]) => (
        <div
          key={rotulo}
          className={`cf-fd ${classe}`}
          style={{ "--fd": `${caixa}s`, ...d(texto) } as CSSProperties}
        >
          <small>{rotulo}</small>
          <span>{valor}</span>
        </div>
      ))}
    </div>
  </Wizard>
);

const Visual = () => (
  <Wizard n={2}>
    <div className="cf-vg">
      <div className="cf-pt cf-an" style={d(0.1)}>
        <img className="g" src={IMG.arnaldo} alt="" />
        <i className="mesh" />
        <img className="c" src={IMG.arnaldo} alt="Arnaldo Nitro" />
        <i className="scl" />
      </div>
      <div>
        <div className="cf-tg">
          {[
            "Veludo verde",
            "Bigode clássico",
            "Luz de estúdio",
            "Paleta quente",
            "Plano americano",
          ].map((t, i) => (
            <span key={t} style={d(0.5 + i * 0.25)}>
              {t}
            </span>
          ))}
        </div>
        <p className="cf-lk cf-an" style={d(2.2)}>
          Rosto travado · mesmo em todo vídeo
        </p>
      </div>
    </div>
  </Wizard>
);

const TRACOS: Array<[string, number]> = [
  ["Extroversão", 82],
  ["Humor", 70],
  ["Ousadia", 91],
  ["Paciência", 38],
  ["Vaidade", 76],
];
const Personalidade = () => (
  <Wizard n={3}>
    <div className="cf-sls">
      {TRACOS.map(([traco, v], i) => (
        <div key={traco} className="cf-sk cf-an" style={d(0.1 + i * 0.1)}>
          <span>{traco}</span>
          <span className="tb">
            <i
              className="f"
              style={{ "--v": `${v}%`, ...d(0.3 + i * 0.2) } as CSSProperties}
            />
          </span>
          <em>{v}</em>
        </div>
      ))}
    </div>
  </Wizard>
);

/** Nichos: os escolhidos têm o atraso da animação de seleção. */
const NICHOS: Array<[string, number?]> = [
  ["Moda masculina", 0.4],
  ["Beleza"],
  ["Lifestyle", 0.7],
  ["Fitness"],
  ["Humor", 1],
  ["Games"],
  ["Finanças"],
  ["Viagem"],
];
const Nicho = () => (
  <Wizard n={4}>
    <div className="cf-chs cf-an" style={d(0.05)}>
      {NICHOS.map(([nicho, atraso]) => (
        <span
          key={nicho}
          className={atraso ? "s" : undefined}
          style={atraso ? d(atraso) : undefined}
        >
          {nicho}
        </span>
      ))}
    </div>
    <div className="cf-rd cf-an" style={d(1.2)}>
      <span>Instagram</span>
      <span>TikTok</span>
      <span>YouTube</span>
    </div>
    <div className="cf-an" style={d(1.3)}>
      <div className="cf-wh" style={{ marginBottom: 7 }}>
        <span>Calendário · 1 post por dia</span>
      </div>
      <div className="cf-cal">
        {[..."STQQSSD"].map((dia, i) => (
          <i key={i}>
            <b style={d(1.5 + i * 0.12)} />
            {dia}
          </i>
        ))}
      </div>
    </div>
  </Wizard>
);

const Voz = () => (
  <Wizard n={5}>
    <div className="cf-wv cf-an" style={d(0.05)}>
      {Array.from({ length: 34 }, (_, i) => (
        <i
          key={i}
          style={
            {
              "--hh": (0.35 + 0.65 * Math.abs(Math.sin(i * 1.3 + 0.2))).toFixed(
                2,
              ),
              ...d(+(i * 0.045).toFixed(2)),
            } as CSSProperties
          }
        />
      ))}
    </div>
    <div className="cf-wh vh cf-an" style={d(0.2)}>
      <span>Timbre · grave e quente</span>
      <span>Bordões · 3</span>
    </div>
    <p className="cf-qt">“Elegância não é roupa cara, meu filho. É postura.”</p>
    <div className="cf-tg">
      <span style={d(2.3)}>Fala devagar</span>
      <span style={d(2.5)}>Nunca diz gíria de internet</span>
    </div>
  </Wizard>
);

const MARCAS: Array<[string, number]> = [
  ["Alfaiataria", 94],
  ["Barbearia", 88],
  ["Café especial", 81],
  ["Relógios", 74],
];
const Monetizacao = () => (
  <Wizard n={6}>
    <div className="cf-bm">
      {MARCAS.map(([marca, v], i) => (
        <div key={marca} className="cf-br cf-an" style={d(0.1 + i * 0.1)}>
          <span>{marca}</span>
          <span className="tb">
            <i
              style={{ "--v": `${v}%`, ...d(0.3 + i * 0.15) } as CSSProperties}
            />
          </span>
          <em>{v}%</em>
        </div>
      ))}
    </div>
    <div className="cf-fx cf-an" style={d(1.2)}>
      <span>
        Formatos <b>Reels · Story · Live</b>
      </span>
      <span>
        Faixa <b>$180–$420 / post</b>
      </span>
    </div>
  </Wizard>
);

const Revisao = () => (
  <Wizard n={7}>
    <div className="cf-rv cf-an" style={d(0.05)}>
      <img src={IMG.arnaldo} alt="Arnaldo Nitro" />
      <div>
        <b>#001 Arnaldo Nitro</b>
        <span>Moda masculina · Lifestyle · Humor</span>
      </div>
    </div>
    <div className="cf-cks">
      {ETAPAS.slice(0, 6).map((etapa, i) => (
        <div key={etapa} className="cf-ck">
          <span className="bx" style={d(0.4 + i * 0.22)}>
            <svg
              viewBox="0 0 12 12"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2.5 6.2 5 8.5l4.5-5" />
            </svg>
          </span>
          {etapa}
        </div>
      ))}
    </div>
    <span className="cf-stp">Identity locked</span>
  </Wizard>
);

interface Passo {
  titulo: string;
  texto: string;
  itens: string[];
  visual: ReactNode;
}
const PASSOS: Passo[] = [
  {
    titulo: "Comece do seu jeito",
    visual: <Comeco />,
    texto:
      "Escolha como criar. A IA do estúdio monta a ficha a partir de uma frase, ou você começa pela imagem, preenche campo a campo ou importa um personagem pronto.",
    itens: [
      "Expandir com IA é o caminho mais rápido",
      "Começar pela imagem ou criar manualmente",
      "Importar uma ficha .json já exportada",
    ],
  },
  {
    titulo: "Identidade",
    visual: <Identidade />,
    texto:
      "Nome, idade, origem e arquétipo. É a base que todas as outras etapas vão respeitar.",
    itens: [
      "Número próprio na fábrica",
      "Backstory antes de qualquer pixel",
      "Arquétipo que guia o comportamento",
    ],
  },
  {
    titulo: "Visual",
    visual: <Visual />,
    texto:
      "O estúdio gera o rosto e o estilo do creator. Depois de aprovado, ele fica travado e é o mesmo em todos os vídeos.",
    itens: [
      "Rosto, figurino e luz definidos",
      "Consistência entre todos os posts",
      "Ajuste qualquer detalhe antes de travar",
    ],
  },
  {
    titulo: "Personalidade",
    visual: <Personalidade />,
    texto: "Traços que definem como ele reage, opina e conta histórias.",
    itens: [
      "Escalas de temperamento ajustáveis",
      "Crenças e aversões do personagem",
      "Comportamento previsível em todo roteiro",
    ],
  },
  {
    titulo: "Nicho e estratégia",
    visual: <Nicho />,
    texto:
      "Em que nicho ele fala, em quais redes publica e com que frequência.",
    itens: [
      "Até três nichos por creator",
      "Instagram, TikTok, YouTube e X",
      "Calendário de publicação definido",
    ],
  },
  {
    titulo: "Voz e linguagem",
    visual: <Voz />,
    texto: "Timbre, ritmo, bordões e o que ele nunca diria.",
    itens: [
      "Voz própria e reconhecível",
      "Bordões e vocabulário do personagem",
      "Lista do que ele não fala",
    ],
  },
  {
    titulo: "Monetização e marcas",
    visual: <Monetizacao />,
    texto:
      "As marcas que combinam com ele, os formatos de publi e a faixa de valor por post.",
    itens: [
      "Afinidade de marca calculada",
      "Formatos aceitos por campanha",
      "Faixa de preço sugerida",
    ],
  },
  {
    titulo: "Revisão",
    visual: <Revisao />,
    texto:
      "Confira a ficha completa e trave a identidade. A partir daqui, o creator está pronto para publicar.",
    itens: [
      "Ficha completa em uma tela",
      "Exportar ficha em .json",
      "Identidade travada para sempre",
    ],
  },
];
const N = PASSOS.length;
const dois = (n: number) => String(n).padStart(2, "0");

export function ComoFunciona() {
  const { mob, irPara } = useCena();
  const [atual, setAtual] = useState(0);
  const trilho = useRef<HTMLElement>(null);

  useProgresso((p) => {
    setAtual(Math.min(N - 1, Math.floor(p * N * 1.0001)));
    if (trilho.current) trilho.current.style.height = `${p * 100}%`;
  });

  const cabecalho: CSSProperties = mob
    ? { left: 24, right: 24, top: 40, gap: 12 }
    : { left: 72, top: 72, width: 440, gap: 20 };
  return (
    <>
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          ...cabecalho,
        }}
      >
        <h2 className="lp-h2 lp-rv" style={{ fontSize: mob ? 34 : 54 }}>
          <span>Da ideia</span>
          <em>ao creator.</em>
        </h2>
        <p
          className="lp-sub lp-rv d1"
          style={mob ? { fontSize: 14 } : { fontSize: 16, maxWidth: 400 }}
        >
          Do primeiro clique à identidade travada: o mesmo caminho que você
          percorre dentro da plataforma.
        </p>
      </div>
      <div
        className="cf-trk lp-rv d2"
        style={
          mob
            ? { left: 20, top: 240, bottom: 40, width: 44 }
            : { left: 72, top: 352, bottom: 72, width: 420 }
        }
      >
        <span className="rail">
          <i ref={trilho} />
        </span>
        {PASSOS.map((passo, i) => (
          <button
            key={passo.titulo}
            type="button"
            className={`cf-sl${i === atual ? " on" : i < atual ? " dn" : ""}`}
            aria-label={`Passo ${i + 1}: ${passo.titulo}`}
            aria-current={i === atual ? "step" : undefined}
            // Meio do trecho do passo: o scroll para com o cartão dele já na tela.
            onClick={() => irPara((i + 0.5) / N)}
          >
            <span className="k">{dois(i + 1)}</span>
            <span className="t">{passo.titulo}</span>
          </button>
        ))}
      </div>
      <div
        className="cf-stack lp-rv d2"
        style={
          mob
            ? { left: 70, right: 16, top: 240, bottom: 40 }
            : { left: 600, right: 72, top: 72, bottom: 72 }
        }
      >
        {PASSOS.map((passo, i) => (
          <div
            key={passo.titulo}
            className={`cf-scd${i === atual ? " on" : i < atual ? " up" : ""}`}
            aria-hidden={i !== atual}
          >
            <div className="cf-vz">{passo.visual}</div>
            <div className="cf-bd">
              <span className="pk">Passo {dois(i + 1)}</span>
              <h3>{passo.titulo}</h3>
              <p>{passo.texto}</p>
              <ul>
                {passo.itens.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
