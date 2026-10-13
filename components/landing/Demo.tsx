"use client";

import { tx } from "@/lib/i18n/tx";
import { useEffect, useRef } from "react";
import { IMG } from "./cenas";
import { useCena } from "./palco";

/**
 * 05 · Uma frase, um creator. O visitante escolhe um creator da casa (ou
 * escreve uma ideia) e a ficha se monta camada por camada. Sem interação, os
 * exemplos se revezam sozinhos. É uma demonstração: nada é gerado de verdade.
 */
interface Exemplo {
  num: string;
  chip: string;
  img: string;
  frase: string;
  /** Uma linha por camada, na ordem de CAMADAS. */
  camadas: string[];
  tempo: string;
}

const EXEMPLOS: Record<string, Exemplo> = {
  arn: {
    num: "#001",
    chip: "Arnaldo",
    img: IMG.arnaldo,
    tempo: "4,6",
    frase:
      "Aposentado de terno de veludo verde que vive de energético e dá conselho de vida em 15 segundos.",
    camadas: [
      "Arnaldo Energy · o avô acelerado",
      'Otimista e impaciente. Bordão: "o tempo não espera ninguém"',
      "Terno de veludo verde, cabelo branco, lata na mão",
      "Grave e rápida, sotaque carioca",
      "Lifestyle 60+ · energia · humor",
    ],
  },
  ze: {
    num: "#002",
    chip: "Zé Zen",
    img: IMG.ze,
    tempo: "4,8",
    frase:
      "Hippie que mora numa kombi no litoral e ensina finanças pessoais com a calma de um monge.",
    camadas: [
      "Zé Zen · o guru tranquilo",
      "Paciente e irônico. Frases curtas, pausas longas",
      "Dreads, colares, linho tingido à mão",
      "Baixa e lenta, quase um sussurro",
      "Finanças pessoais · minimalismo",
    ],
  },
  betty: {
    num: "#003",
    chip: "Betty",
    img: IMG.betty,
    tempo: "4,5",
    frase:
      "Pin-up de cachos curtos e batom vermelho que dá dicas de beleza com o charme dos anos 30.",
    camadas: [
      "Betty Pimenta · a pin-up atrevida",
      "Charmosa e debochada. Pisca antes de cada dica",
      "Cachos curtos, batom vermelho, saia lápis",
      "Doce e aguda, com risada no fim",
      "Beleza · moda retrô",
    ],
  },
  dione: {
    num: "#004",
    chip: "Dione",
    img: IMG.dione,
    tempo: "4,7",
    frase:
      "Fortão de topete loiro e óculos escuros que transforma qualquer situação em desafio de academia.",
    camadas: [
      "Dione Brabo · o marombeiro confiante",
      "Exagerado e motivador. Nunca tira os óculos",
      "Topete loiro, camiseta preta justa, jeans",
      "Grave e alta, cheia de gíria",
      "Fitness · humor",
    ],
  },
  pateta: {
    num: "#005",
    chip: "Pateta",
    img: IMG.pateta,
    tempo: "4,3",
    frase:
      "Desastrado de touca listrada que narra o dia a dia como se vivesse dentro de um desenho animado.",
    camadas: [
      "Pateta Fi Duma Egua · o atrapalhado",
      "Ingênuo e caótico. Ri das próprias trapalhadas",
      "Touca listrada, blazer largo, bermuda cargo",
      "Rouca e esganiçada, risada marcante",
      "Humor · cotidiano",
    ],
  },
  romeu: {
    num: "#006",
    chip: "Romeu",
    img: IMG.romeu,
    tempo: "4,6",
    frase:
      "Galã de franja reta e jaqueta vermelha que dá conselhos amorosos com toda a pompa da nobreza.",
    camadas: [
      "Romeu Nobre · o lorde vaidoso",
      "Arrogante e teatral. Se acha da realeza",
      "Franja reta, jaqueta vermelha, calça pantalona",
      "Empostada e lenta, ar de superioridade",
      "Relacionamentos · humor",
    ],
  },
};
const ORDEM = Object.keys(EXEMPLOS);
const CAMADAS = ["Nome e arquétipo", "Personalidade", "Visual", "Voz", "Nicho"];
const SIMBOLOS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ·/#<>01";
/** Tempo de cada camada e pausa entre um exemplo e o próximo, em ms. */
const PASSO = 640;
const PAUSA = 4200;

export function Demo() {
  const { mob, ativo } = useCena();
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ativo) return;
    const el = raiz.current!;
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    const area = q<HTMLTextAreaElement>("textarea");
    const conta = q(".dm-cnt");
    const gerar = q<HTMLButtonElement>(".dm-gen");
    const rotulo = q(".dm-gen .lbl");
    const retrato = q(".dm-por");
    const foto = q<HTMLImageElement>(".dm-por img");
    const chips = el.querySelectorAll<HTMLButtonElement>(".dm-chip");
    const linhas = el.querySelectorAll<HTMLElement>(".dm-row");

    let tempos: Array<ReturnType<typeof setTimeout>> = [];
    let proximo: ReturnType<typeof setTimeout> | undefined;
    let automatico = true;
    const em = (ms: number, f: () => void) => tempos.push(setTimeout(f, ms));
    const limpar = () => {
      tempos.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      tempos = [];
      clearTimeout(proximo);
    };
    const pararAutomatico = () => {
      automatico = false;
      clearTimeout(proximo);
    };

    function embaralhar(alvo: HTMLElement, texto: string, duracao: number) {
      let i = 0;
      const n = Math.max(1, Math.round(duracao / 28));
      const iv = setInterval(() => {
        i++;
        const r = Math.floor((texto.length * i) / n);
        alvo.textContent =
          texto.slice(0, r) +
          texto
            .slice(r, r + 6)
            .replace(
              /\S/g,
              () => SIMBOLOS[(Math.random() * SIMBOLOS.length) | 0],
            );
        if (i >= n) {
          clearInterval(iv);
          alvo.textContent = texto;
        }
      }, 28);
      tempos.push(iv);
    }

    function zerar() {
      linhas.forEach((r) => {
        r.classList.remove("on", "ok");
        r.querySelector(".st")!.textContent = "—";
        r.querySelector(".v")!.textContent = "";
      });
      retrato.classList.remove("on", "run");
      foto.removeAttribute("src");
      q(".dm-bar i").style.width = "0";
      q(".dm-ch .tm").textContent = "0,0s";
      q(".dm-stamp").classList.remove("on");
      q(".dm-nx").classList.remove("on");
    }

    /** Monta a ficha: de um exemplo da casa (`id`) ou do que o visitante escreveu. */
    function rodar(id: string | null) {
      limpar();
      zerar();
      gerar.disabled = true;
      rotulo.textContent = tx("Gerando…");
      const e = id ? EXEMPLOS[id] : null;
      chips.forEach((c) => c.classList.toggle("on", c.dataset.ex === id));
      q(".dm-ch .cn").textContent = e
        ? mob
          ? e.num
          : `Creator ${e.num}`
        : mob
          ? tx("novo")
          : tx("Seu creator");

      let inicio = 0;
      if (e) {
        area.value = "";
        // A frase e as camadas do exemplo saem no idioma da página.
        const frase = tx(e.frase);
        const letra = Math.max(14, Math.round(1100 / frase.length));
        for (let i = 1; i <= frase.length; i++)
          em(i * letra, () => {
            area.value = frase.slice(0, i);
            conta.textContent = `${i}/240`;
          });
        inicio = frase.length * letra + 250;
      }

      const tm = q(".dm-ch .tm");
      let relogio: ReturnType<typeof setInterval>;
      em(inicio, () => {
        const t0 = performance.now();
        relogio = setInterval(() => {
          tm.textContent =
            ((performance.now() - t0) / 1000).toFixed(1).replace(".", ",") +
            "s";
        }, 90);
        tempos.push(relogio);
      });
      CAMADAS.forEach((_, i) =>
        em(inicio + i * PASSO, () => {
          const r = linhas[i];
          r.classList.add("on");
          r.querySelector(".st")!.textContent = tx("GERANDO");
          const texto = e
            ? tx(e.camadas[i])
            : i
              ? tx("Definido na plataforma")
              : tx("Seu creator · arquétipo a definir");
          embaralhar(r.querySelector<HTMLElement>(".v")!, texto, PASSO - 120);
          q(".dm-bar i").style.width = `${((i + 1) / CAMADAS.length) * 100}%`;
          if (i === 2 && e) {
            foto.src = e.img;
            retrato.classList.add("run");
            requestAnimationFrame(() => retrato.classList.add("on"));
          }
          em(PASSO - 100, () => {
            r.classList.add("ok");
            r.querySelector(".st")!.textContent = "OK";
          });
        }),
      );
      em(inicio + CAMADAS.length * PASSO + 80, () => {
        clearInterval(relogio);
        tm.textContent = `${e ? e.tempo : "3,2"}s`;
        const selo = q(".dm-stamp");
        selo.textContent = e
          ? `CREATOR ${e.num} — ${tx(e.camadas[0]).split(" · ")[0].toUpperCase()} ${tx("SALVO NO SISTEMA")} · ${e.tempo}s`
          : tx("SUA IDEIA ESTÁ PRONTA PARA VIRAR CREATOR");
        selo.classList.add("on");
        q(".dm-nx").classList.add("on");
        rotulo.textContent = tx("Gerado");
        if (id && automatico)
          proximo = setTimeout(
            () => rodar(ORDEM[(ORDEM.indexOf(id) + 1) % ORDEM.length]),
            PAUSA,
          );
      });
    }

    const aoDigitar = () => {
      pararAutomatico();
      conta.textContent = `${area.value.length}/240`;
      gerar.disabled = !area.value.trim();
      rotulo.textContent = tx("Gerar");
      chips.forEach((c) => c.classList.remove("on"));
    };
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" || ev.shiftKey) return;
      ev.preventDefault();
      if (area.value.trim() && !gerar.disabled) rodar(null);
    };
    const aoGerar = () => {
      if (area.value.trim()) rodar(null);
    };
    const aoChip = (ev: Event) =>
      rodar((ev.currentTarget as HTMLElement).dataset.ex!);

    area.addEventListener("focus", pararAutomatico);
    area.addEventListener("input", aoDigitar);
    area.addEventListener("keydown", aoTeclar);
    gerar.addEventListener("click", aoGerar);
    chips.forEach((c) => c.addEventListener("click", aoChip));
    em(500, () => rodar("ze"));

    return () => {
      limpar();
      area.removeEventListener("focus", pararAutomatico);
      area.removeEventListener("input", aoDigitar);
      area.removeEventListener("keydown", aoTeclar);
      gerar.removeEventListener("click", aoGerar);
      chips.forEach((c) => c.removeEventListener("click", aoChip));
    };
  }, [ativo, mob]);

  const linhas = CAMADAS.map((camada, i) => (
    <div key={camada} className={`dm-row${i ? "" : " nm"}`}>
      <span className="lb">{tx(camada)}</span>
      <span className="st">—</span>
      <span className="v" />
    </div>
  ));
  const chips = ORDEM.map((k) => (
    <button key={k} type="button" className="dm-chip" data-ex={k}>
      <b>{EXEMPLOS[k].num}</b>
      {EXEMPLOS[k].chip}
    </button>
  ));
  const ficha = (colunaFoto: number) => (
    <>
      <div className="dm-ch">
        <span className="k">
          {tx("Ficha")} · <b className="cn">{mob ? "#—" : "Creator #—"}</b>
        </span>
        <span className="tm">0,0s</span>
      </div>
      <div className="dm-bar">
        <i />
      </div>
      <div
        className="dm-cb"
        style={{ gridTemplateColumns: `${colunaFoto}px minmax(0,1fr)` }}
      >
        <div className="dm-por">
          <span className="ph">{tx("Visual")}</span>
          <img alt="" />
          <i className="sc" />
        </div>
        <div className="dm-rows">{linhas}</div>
      </div>
      <div className="dm-cf">
        <span className="dm-stamp" />
        <a className="dm-nx" href="/app">
          {tx("Construir o meu na plataforma")}
        </a>
      </div>
    </>
  );
  const caixa = (fonte: number, minimo: number, linha?: number) => (
    <>
      <textarea
        rows={3}
        maxLength={240}
        style={{ fontSize: fonte, minHeight: minimo, lineHeight: linha }}
        placeholder={tx("Descreva seu creator em uma frase…")}
        aria-label={tx("Descreva seu creator em uma frase")}
      />
      <div className="dm-prow">
        <span className="dm-cnt">0/240</span>
        <button
          type="button"
          className="lp-cta dm-gen"
          style={mob ? { padding: "12px 16px" } : undefined}
          disabled
        >
          <span className="lbl">{tx("Gerar")}</span>
        </button>
      </div>
    </>
  );

  // `key` remonta ao trocar de quadro (desktop ↔ celular): a ficha é preenchida direto no DOM.
  if (mob)
    return (
      <div ref={raiz} key="mb">
        <div className="dm-glow" />
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: 40,
            display: "flex",
            flexDirection: "column",
            gap: 13,
          }}
        >
          <h2 className="lp-h2" style={{ fontSize: 32 }}>
            <span>{tx("Uma frase.")}</span>
            <em>{tx("Um creator inteiro.")}</em>
          </h2>
          <p className="lp-sub" style={{ fontSize: 14 }}>
            {tx(
              "Você escreve uma ideia. O sistema constrói identidade, visual, personalidade, voz e nicho.",
            )}
          </p>
          <div className="dm-pbox" style={{ padding: 12, borderRadius: 16 }}>
            {/* 16px: com menos, o iOS dá zoom na página ao tocar no campo. A linha mais justa mantém a altura que a caixa tinha com 14,5px. */}
            {caixa(16, 64, 1.36)}
          </div>
          <div className="dm-ex">{chips}</div>
        </div>
        <div
          className="dm-card"
          style={{ left: 16, right: 16, top: 414, height: 416 }}
        >
          {ficha(104)}
        </div>
      </div>
    );
  return (
    <div ref={raiz} key="dk">
      <div className="dm-glow" />
      <div
        style={{
          position: "absolute",
          left: 72,
          top: 92,
          width: 520,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <h2 className="lp-h2" style={{ fontSize: 58 }}>
          <span>{tx("Uma frase.")}</span>
          <em>{tx("Um creator inteiro.")}</em>
        </h2>
        <p className="lp-sub" style={{ fontSize: 16, maxWidth: "46ch" }}>
          {tx(
            "Você escreve uma ideia. O sistema constrói identidade, visual, personalidade, voz e nicho, camada por camada.",
          )}
        </p>
        <div className="dm-pbox">{caixa(16, 76)}</div>
        <div className="dm-ex">
          <span className="t">{tx("Ou veja")}</span>
          {chips}
        </div>
      </div>
      <div
        className="dm-card"
        style={{ left: 648, top: 72, width: 560, height: 576 }}
      >
        {ficha(196)}
      </div>
    </div>
  );
}
