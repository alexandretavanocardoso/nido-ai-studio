"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRecursos } from "@/components/RecursosProvider";
import { EMAIL_CONTATO } from "@/components/legal/Secao";
import {
  DESCONTO_ANUAL,
  PLANOS,
  PLANOS_PAGOS,
  TROCA_POR_SEGUNDO,
  precoPlano,
  type Intervalo,
} from "@/lib/planos";
import { recursosDoPlano } from "@/lib/planos-recursos";
import { IMG } from "./cenas";
import { useCena } from "./palco";

/** Seções 08 a 10 da landing: planos, FAQ e whitelist (com o rodapé). */

const num = (v: number) => v.toLocaleString("pt-BR");

/** Envia um formulário da landing para /api/leads. Devolve a resposta ou lança o erro em português. */
async function enviarLead(
  dados: Record<string, string>,
): Promise<{ posicao?: number }> {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  }).catch(() => null);
  const json = await res?.json().catch(() => null);
  if (!res?.ok)
    throw new Error(
      json?.error ??
        "Não foi possível enviar. Confira sua conexão e tente de novo.",
    );
  return json;
}

function useEnvio<T>(enviar: (form: HTMLFormElement) => Promise<T>) {
  const [estado, setEstado] = useState<{
    enviando: boolean;
    erro: string | null;
    ok: T | null;
  }>({
    enviando: false,
    erro: null,
    ok: null,
  });
  async function aoEnviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    setEstado({ enviando: true, erro: null, ok: null });
    try {
      setEstado({ enviando: false, erro: null, ok: await enviar(form) });
    } catch (e) {
      setEstado({ enviando: false, erro: (e as Error).message, ok: null });
    }
  }
  return {
    ...estado,
    aoEnviar,
    limpar: () => setEstado({ enviando: false, erro: null, ok: null }),
  };
}

const campos = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form)) as Record<string, string>;

/* ------------------------------------------------------------------ */
/* 08 · Planos                                                         */
/* ------------------------------------------------------------------ */

const Raio = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </svg>
);
const Certo = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
const Lista = ({ itens }: { itens: string[] }) => (
  <ul>
    {itens.map((item) => (
      <li key={item}>
        <Certo />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const AGENCIA = [
  "Personagens ilimitados",
  "Criação e roteiro feitos pelo time Nido",
  "Publicação e agendamento em todas as redes",
  "Gestão de campanhas com marcas",
  "Relatório mensal de resultado",
  "Gerente de conta dedicado",
];

function FormAgencia({
  aberto,
  fechar,
}: {
  aberto: boolean;
  fechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const envio = useEnvio((form) =>
    enviarLead({ tipo: "agencia", ...campos(form) }),
  );

  useEffect(() => {
    if (!aberto) return;
    // O quadro dos planos é mais alto que a tela: traz o formulário para o meio dela.
    caixa.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    caixa.current?.querySelector("input")?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [aberto, fechar]);

  return (
    <div
      className={`pl-fm${aberto ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Agenciamento personalizado"
      onClick={(e) => e.target === e.currentTarget && fechar()}
    >
      <div className="bx" ref={caixa}>
        <div className="hd">
          <div>
            <span>Agenciamento personalizado</span>
            <b>Vamos montar o seu estúdio</b>
          </div>
          <button
            type="button"
            className="x"
            onClick={fechar}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        {envio.ok ? (
          <div className="ok">
            <b>Recebemos</b>
            <p>
              O time Nido responde em até 1 dia útil com uma proposta para a sua
              operação.
            </p>
            <button
              type="button"
              className="lp-cta"
              style={{ marginTop: 22 }}
              onClick={fechar}
            >
              <span className="lbl">Fechar</span>
            </button>
          </div>
        ) : (
          <form onSubmit={envio.aoEnviar}>
            <div className="lp-fs" style={{ gap: 10, marginTop: 18 }}>
              <label>
                Nome
                <input
                  name="nome"
                  required
                  maxLength={120}
                  placeholder="Seu nome"
                  autoComplete="name"
                />
              </label>
              <label>
                Empresa
                <input
                  name="empresa"
                  required
                  maxLength={160}
                  placeholder="Nome da marca"
                  autoComplete="organization"
                />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={200}
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                />
              </label>
              <label>
                WhatsApp
                <input
                  name="whatsapp"
                  type="tel"
                  maxLength={40}
                  placeholder="+55 31 99999-9999"
                  autoComplete="tel"
                />
              </label>
              <label className="w">
                Quantos creators você quer operar?
                <select name="creators">
                  <option>1 a 3</option>
                  <option>4 a 10</option>
                  <option>11 a 30</option>
                  <option>Mais de 30</option>
                </select>
              </label>
              <label className="w">
                Conte o objetivo
                <textarea
                  name="objetivo"
                  maxLength={2000}
                  placeholder="Nicho, redes, meta de publicação ou conversão"
                />
              </label>
            </div>
            {envio.erro ? (
              <p className="lp-erro" role="alert">
                {envio.erro}
              </p>
            ) : null}
            <button className="lp-cta" type="submit" disabled={envio.enviando}>
              <span className="lbl">
                {envio.enviando ? "Enviando…" : "Enviar proposta"}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function Planos() {
  const { mob } = useCena();
  const { usdc } = useRecursos();
  const [intervalo, setIntervalo] = useState<Intervalo>("mensal");
  const [form, setForm] = useState(false);
  const [visivel, setVisivel] = useState(0);
  const grade = useRef<HTMLDivElement>(null);
  const fechar = useRef(() => setForm(false)).current;

  const cartoes: ReactNode[] = PLANOS_PAGOS.map((id, i) => {
    const p = PLANOS[id];
    const total = precoPlano(id, intervalo, "BRL");
    const porMes = intervalo === "mensal" ? total : Math.round(total / 12);
    return (
      <div
        key={id}
        className={`pl-pc lp-rv d${i + 1}${id === "creator" ? " hl" : ""}`}
      >
        <span className="nm">
          {p.nome}
          {id === "creator" ? <em>Mais escolhido</em> : null}
        </span>
        <p className="ds">{p.descricao}</p>
        <div className="pr">
          <b>
            <small>R$</small>
            {num(porMes)}
          </b>
          <span>/mês</span>
        </div>
        <p className="cb">
          {intervalo === "anual"
            ? `R$ ${num(total)} à vista por 12 meses`
            : "cobrado todo mês no cartão"}
          {usdc
            ? ` · ou US$ ${num(precoPlano(id, intervalo, "USD"))} em USDC`
            : ""}
        </p>
        <div className="cr">
          <b>
            <Raio />
            {num(p.creditos)} créditos/mês
          </b>
          <span>
            ≈ {num(Math.floor(p.creditos / 5))} imagens · ou{" "}
            {num(Math.floor(p.creditos / 10))} Nano Banana Pro · ou{" "}
            {num(Math.floor(p.creditos / TROCA_POR_SEGUNDO))}s de troca de
            pessoa em vídeo
          </span>
        </div>
        <Lista itens={recursosDoPlano(id)} />
      </div>
    );
  });
  cartoes.push(
    <div key="agencia" className="pl-pc ag lp-rv d4">
      <span className="nm">
        Agência<em>Sob medida</em>
      </span>
      <p className="ds">
        Agenciamento personalizado: o time Nido opera seus creators por você
      </p>
      <div className="pr">
        <b>Sob consulta</b>
      </div>
      <p className="cb">proposta montada para o volume e a meta da sua marca</p>
      <div className="cr">
        <b>
          <Raio />
          Créditos sob demanda
        </b>
        <span>Volume calibrado ao calendário de publicação</span>
      </div>
      <Lista itens={AGENCIA} />
      <span className="gap" />
      <button type="button" className="lp-cta" onClick={() => setForm(true)}>
        <span className="lbl">Falar com a Nido</span>
      </button>
    </div>,
  );

  const titulo = (
    <>
      <h2 className="lp-h2 lp-rv" style={{ fontSize: mob ? 34 : 64 }}>
        <span>Escolha</span>
        <em>o seu estúdio.</em>
      </h2>
      <p
        className="lp-sub lp-rv d1"
        style={mob ? { fontSize: 14.5 } : { fontSize: 16, maxWidth: 400 }}
      >
        Comece com um creator e escale quando o resultado aparecer. Sem
        fidelidade.
      </p>
    </>
  );
  const cobranca = (
    <div className="pl-bill lp-rv d1">
      <button
        type="button"
        className={intervalo === "mensal" ? "on" : ""}
        onClick={() => setIntervalo("mensal")}
      >
        Mensal
      </button>
      <button
        type="button"
        className={intervalo === "anual" ? "on" : ""}
        onClick={() => setIntervalo("anual")}
      >
        Anual <em>−{Math.round(DESCONTO_ANUAL * 100)}%</em>
      </button>
    </div>
  );

  if (mob)
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: 48,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          {titulo}
          {cobranca}
        </div>
        <div style={{ position: "absolute", left: 24, right: 24, top: 300 }}>
          <div
            className="pl-gr"
            ref={grade}
            onScroll={() => {
              const g = grade.current!;
              const passo =
                (g.firstElementChild as HTMLElement).offsetWidth + 14;
              setVisivel(Math.round(g.scrollLeft / passo));
            }}
          >
            {cartoes}
          </div>
          <div className="pl-dots">
            {cartoes.map((_, i) => (
              <i key={i} className={i === visivel ? "on" : ""} />
            ))}
          </div>
        </div>
        <FormAgencia aberto={form} fechar={fechar} />
      </>
    );
  return (
    <>
      <div
        className="pl-top"
        style={{ position: "absolute", left: 72, right: 72, top: 72 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {titulo}
        </div>
        {cobranca}
      </div>
      <div
        className="pl-gr"
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 290,
          bottom: 72,
        }}
      >
        {cartoes}
      </div>
      <FormAgencia aberto={form} fechar={fechar} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 09 · FAQ                                                            */
/* ------------------------------------------------------------------ */

const PERGUNTAS: Array<[string, string]> = [
  [
    "O creator parece uma pessoa real?",
    "Sim. Cada creator tem rosto, voz e jeito de falar consistentes em todos os vídeos. Sinalizamos o conteúdo como gerado por IA conforme as regras de cada rede.",
  ],
  [
    "De quem é o creator que eu gerei?",
    "Da sua marca. A identidade fica exclusiva enquanto o plano estiver ativo e você pode exportar os vídeos a qualquer momento.",
  ],
  [
    "Em quais redes ele publica?",
    "Instagram, TikTok, YouTube e X. Você escolhe as redes e o calendário; o estúdio adapta formato e duração para cada uma.",
  ],
  [
    "Posso ajustar o que ele fala?",
    "Pode. Cada roteiro passa pela sua aprovação, e você define temas proibidos, tom de voz e chamadas para ação.",
  ],
  [
    "Como eu meço o resultado?",
    "No painel da Nido: views, engajamento e conversão por vídeo e por creator, com links rastreados e atualização em tempo real.",
  ],
];

export function Faq() {
  const { mob } = useCena();
  const [aberta, setAberta] = useState<number | null>(0);
  const titulo = (
    <>
      <h2 className="lp-h2 lp-rv" style={{ fontSize: mob ? 38 : 72 }}>
        <span>Seu creator.</span>
        <em>Pronto hoje.</em>
      </h2>
      <p
        className="lp-sub lp-rv d1"
        style={mob ? { fontSize: 14.5 } : { fontSize: 16, maxWidth: 400 }}
      >
        Descreva em uma frase. Em segundos ele tem nome, rosto, voz e nicho — e
        começa a publicar.
      </p>
    </>
  );
  const lista = (
    <div
      className="fq lp-rv d2"
      style={
        mob
          ? { position: "absolute", left: 24, right: 24, top: 250 }
          : undefined
      }
    >
      {PERGUNTAS.map(([pergunta, resposta], i) => (
        <div key={pergunta} className={`fq-qa${aberta === i ? " open" : ""}`}>
          <button
            type="button"
            aria-expanded={aberta === i}
            onClick={() => setAberta(aberta === i ? null : i)}
          >
            {pergunta}
            <span className="pl" />
          </button>
          <div className="an">
            <div>
              <p>{resposta}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
  if (mob)
    return (
      <>
        <div className="fq-glow" />
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: 48,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {titulo}
        </div>
        {lista}
      </>
    );
  return (
    <>
      <div className="fq-glow" />
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 80,
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 600px",
          gap: 72,
          alignItems: "start",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            alignItems: "flex-start",
          }}
        >
          {titulo}
        </div>
        {lista}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 10 · Whitelist + rodapé                                             */
/* ------------------------------------------------------------------ */

const VANTAGENS: Array<[string, string]> = [
  ["Acesso antes da abertura", "Entra na plataforma na primeira leva"],
  ["Créditos extras de boas-vindas", "Para gerar o seu primeiro creator"],
  ["Onboarding com o time Nido", "Uma conversa para montar sua estratégia"],
];
const PERFIS = [
  ["marca", "Marca"],
  ["agencia", "Agência"],
  ["creator", "Creator"],
] as const;

function FormWhitelist() {
  const [perfil, setPerfil] = useState<string>("marca");
  const envio = useEnvio((form) =>
    enviarLead({ tipo: "whitelist", perfil, ...campos(form) }),
  );
  if (envio.ok)
    return (
      <div className="wl-ok" role="status">
        <span className="tk">Inscrição confirmada</span>
        <b>Você está na lista.</b>
        {envio.ok.posicao ? (
          <div className="pos">
            <span>Sua posição</span>
            <strong>#{num(envio.ok.posicao)}</strong>
          </div>
        ) : null}
        <p>Avisamos por e-mail e WhatsApp assim que o seu acesso abrir.</p>
      </div>
    );
  return (
    <form onSubmit={envio.aoEnviar}>
      <div className="hd">
        Entrar na whitelist<small>Leva menos de um minuto.</small>
      </div>
      <div className="lp-fs">
        <label>
          Nome
          <input
            name="nome"
            required
            maxLength={120}
            placeholder="Seu nome"
            autoComplete="name"
          />
        </label>
        <label>
          WhatsApp
          <input
            name="whatsapp"
            type="tel"
            maxLength={40}
            placeholder="+55 31 99999-9999"
            autoComplete="tel"
          />
        </label>
        <label className="w">
          E-mail
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            placeholder="voce@email.com"
            autoComplete="email"
          />
        </label>
        <div className="campo w" role="group" aria-label="Você é">
          Você é
          <div className="wl-seg">
            {PERFIS.map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                className={perfil === id ? "on" : ""}
                aria-pressed={perfil === id}
                onClick={() => setPerfil(id)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        <label className="w">
          Nicho do seu creator
          <input
            name="nicho"
            maxLength={200}
            placeholder="Moda, beleza, finanças…"
          />
        </label>
      </div>
      {envio.erro ? (
        <p className="lp-erro" role="alert">
          {envio.erro}
        </p>
      ) : null}
      <button className="lp-cta" type="submit" disabled={envio.enviando}>
        <span className="lbl">
          {envio.enviando ? "Enviando…" : "Garantir meu lugar"}
        </span>
      </button>
    </form>
  );
}

function Rodape() {
  const { mob } = useCena();
  return (
    <footer
      className="lp-foot"
      style={
        mob
          ? {
              position: "absolute",
              left: 24,
              right: 24,
              bottom: 0,
              padding: "22px 0 26px",
              gap: 14,
            }
          : { position: "absolute", left: 72, right: 72, bottom: 0, height: 72 }
      }
    >
      <img src={IMG.wordmark} alt="Nido AI Studio" />
      <nav>
        <a href="/termos">Termos</a>
        <a href="/privacidade">Privacidade</a>
        <a href={`mailto:${EMAIL_CONTATO}`}>Contato</a>
      </nav>
      <div className="dir">
        <a
          className="x"
          href="https://x.com/nidoaistudio"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Nido AI Studio no X"
        >
          <svg viewBox="0 0 90 90" width="15" height="15" fill="currentColor">
            <path d="M0.219 2.882l34.748 46.461L0 87.118h7.87l30.614-33.073 24.735 33.073H90L53.297 38.043 85.844 2.882h-7.87L49.781 33.341 27.001 2.882H0.219zM11.793 8.679h12.303L78.425 81.32H66.122L11.793 8.679z" />
          </svg>
        </a>
        <span>© 2026 Nido</span>
      </div>
    </footer>
  );
}

export function Whitelist() {
  const { mob } = useCena();
  const texto = (
    <>
      <span className="wl-ey lp-rv">Acesso antecipado</span>
      <h2 className="lp-h2 lp-rv d1" style={{ fontSize: mob ? 36 : 66 }}>
        <span>Seu creator</span>
        <em>começa aqui.</em>
      </h2>
      <p
        className="lp-sub lp-rv d2"
        style={mob ? { fontSize: 14.5 } : { fontSize: 16, maxWidth: 430 }}
      >
        O estúdio abre por ordem de inscrição. Entre na lista e garanta seu
        lugar antes da abertura.
      </p>
      <ul className="wl-perks lp-rv d3">
        {VANTAGENS.map(([titulo, detalhe], i) => (
          <li key={titulo}>
            <b>{String(i + 1).padStart(2, "0")}</b>
            <span>
              {titulo}
              <small>{detalhe}</small>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
  if (mob)
    return (
      <>
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: 48,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {texto}
          <div className="wl-wf lp-rv d4">
            <FormWhitelist />
          </div>
        </div>
        <Rodape />
      </>
    );
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          top: 80,
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 520px",
          gap: 72,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {texto}
        </div>
        <div className="wl-wf lp-rv d2">
          <FormWhitelist />
        </div>
      </div>
      <Rodape />
    </>
  );
}
