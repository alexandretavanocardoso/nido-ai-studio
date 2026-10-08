import { tx } from "@/lib/i18n/tx";
import type { Metricas, PostMetricas } from "./metricas";
import {
  engajamento,
  somar,
  variacao,
  ZERO,
  type Periodo,
  type Resumo,
} from "./painel";
import { INFO_REDES } from "./redes";

/**
 * Relatório do Dashboard em PDF (A4, texto de verdade), pra mandar a uma marca
 * ou cliente: faixa de capa, indicadores, gráfico de visualizações, divisão por
 * rede e as tabelas. Roda no navegador; o jsPDF só é baixado na hora de gerar.
 */
export interface DadosRelatorio {
  /** Nome do personagem do relatório (null = todos). */
  personagem: string | null;
  /** Id dele (pra foto de perfil na capa). */
  personagemId?: string | null;
  /**
   * Foto de perfil de cada personagem, por id, já redonda, em data URL PNG
   * (ver `capaParaPdf`). Quem não tiver sai com as iniciais.
   */
  avatares?: Map<string, string>;
  periodo: Periodo;
  resumo: Resumo;
  /** Posts já filtrados por personagem (o período sai do resumo). */
  posts: PostMetricas[];
  /** Nome de cada personagem, por id. */
  nomes: Map<string, string>;
}

type Cor = [number, number, number];
const MARGEM = 14;
const LARGURA = 210 - MARGEM * 2;
const ALTURA_FAIXA = 44;
const TINTA: Cor = [20, 18, 18];
const CINZA: Cor = [120, 113, 105];
const CLARO: Cor = [201, 193, 181];
const LINHA: Cor = [228, 224, 216];
const FUNDO: Cor = [248, 246, 241];
const OCRE: Cor = [170, 125, 67];
const AMARELO: Cor = [253, 243, 39];
const VERDE: Cor = [34, 139, 77];
const VERMELHO: Cor = [200, 60, 50];
const BRANCO: Cor = [255, 255, 255];

/** As fontes padrão do PDF só têm Latin-1: troca o que dá e tira o resto (emoji etc.). */
export function textoPdf(s: string): string {
  return s
    .replace(/[→➜➡]/g, "->")
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Capa do personagem recortada em círculo (PNG em data URL), pro cabeçalho do
 * PDF. null se a imagem não puder ser lida — o relatório sai sem ela.
 */
export async function capaParaPdf(
  src: string,
  lado = 240,
): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(src)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.beginPath();
    ctx.arc(lado / 2, lado / 2, lado / 2, 0, Math.PI * 2);
    ctx.clip();
    // Preenche o quadrado mantendo a proporção, alinhado ao topo (rosto).
    const escala = Math.max(lado / bitmap.width, lado / bitmap.height);
    const w = bitmap.width * escala;
    ctx.drawImage(bitmap, (lado - w) / 2, 0, w, bitmap.height * escala);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const compacto = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const pct = (n: number) =>
  `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const dia = (d: Date) =>
  d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const KPIS: Array<[keyof Metricas, string]> = [
  ["views", "Visualizações"],
  ["curtidas", "Curtidas"],
  ["comentarios", "Comentários"],
  ["reposts", "Reposts"],
  ["quotes", "Quotes"],
  ["salvos", "Salvamentos"],
];

interface Coluna {
  titulo: string;
  largura: number;
  direita?: boolean;
}

export async function baixarRelatorioPdf(d: DadosRelatorio): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const agora = new Date();
  const quem = d.personagem ?? tx("Todos os personagens");
  const BASE = 297 - 16; // até onde o conteúdo pode ir (o rodapé fica abaixo)
  let y = 0;

  const fonte = (tamanho: number, negrito = false, cor: Cor = TINTA) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    doc.setTextColor(...cor);
  };
  /** Corta o texto pra caber na largura (com reticências). */
  const caber = (texto: string, largura: number) => {
    let t = textoPdf(texto);
    if (doc.getTextWidth(t) <= largura) return t;
    while (t.length > 1 && doc.getTextWidth(`${t}...`) > largura)
      t = t.slice(0, -1);
    return `${t.trimEnd()}...`;
  };
  const novaPagina = () => {
    doc.addPage();
    y = MARGEM + 4;
  };
  /** Garante espaço na página; se não couber, abre outra. */
  const garantir = (altura: number) => {
    if (y + altura > BASE) novaPagina();
  };
  const secao = (titulo: string, nota?: string) => {
    garantir(24);
    y += 11;
    doc.setFillColor(...OCRE);
    doc.rect(MARGEM, y - 3.3, 1.2, 4.2, "F");
    fonte(11.5, true);
    doc.text(textoPdf(titulo), MARGEM + 3.4, y);
    if (nota) {
      fonte(7.5, false, CINZA);
      doc.text(textoPdf(nota), MARGEM + LARGURA, y, { align: "right" });
    }
    y += 4;
  };

  /** Foto de perfil redonda do personagem (ou as iniciais, se não houver foto). */
  const perfil = (id: string, x: number, topo: number, lado: number) => {
    const foto = d.avatares?.get(id);
    if (foto) {
      try {
        // O alias faz o PDF guardar cada foto uma vez só, por mais que apareça.
        doc.addImage(foto, "PNG", x, topo, lado, lado, `perfil-${id}`);
        return;
      } catch {
        /* cai nas iniciais */
      }
    }
    doc.setFillColor(...OCRE);
    doc.circle(x + lado / 2, topo + lado / 2, lado / 2, "F");
    const nome = textoPdf(d.nomes.get(id) ?? "?");
    fonte(lado * 1.15, true, BRANCO);
    doc.text(
      (nome.slice(0, 2) || "?").toUpperCase(),
      x + lado / 2,
      topo + lado / 2 + lado * 0.14,
      { align: "center" },
    );
  };

  const cabecalhoTabela = (colunas: Coluna[]) => {
    doc.setFillColor(...TINTA);
    doc.roundedRect(MARGEM, y, LARGURA, 7, 1.2, 1.2, "F");
    fonte(6.5, true, CLARO);
    let x = MARGEM + 2.5;
    for (const c of colunas) {
      doc.text(
        textoPdf(c.titulo).toUpperCase(),
        c.direita ? x + c.largura - 5 : x,
        y + 4.5,
        // Sem espaçamento extra à direita: o jsPDF não o conta ao alinhar e o título vazaria.
        { align: c.direita ? "right" : "left", charSpace: c.direita ? 0 : 0.15 },
      );
      x += c.largura;
    }
    y += 7;
  };
  /** Tabela zebrada; `sub` é uma segunda linha sob a linha (ex.: o link do post). */
  const tabela = (
    colunas: Coluna[],
    linhas: Array<{
      celulas: string[];
      sub?: string;
      link?: string;
      /** Foto de perfil antes do texto da coluna `coluna`. */
      perfil?: { coluna: number; id: string };
    }>,
  ) => {
    garantir(22);
    cabecalhoTabela(colunas);
    linhas.forEach((l, n) => {
      const altura = l.sub ? 11 : 7.4;
      if (y + altura > BASE) {
        novaPagina();
        cabecalhoTabela(colunas);
      }
      if (n % 2) {
        doc.setFillColor(...FUNDO);
        doc.rect(MARGEM, y, LARGURA, altura, "F");
      }
      let x = MARGEM + 2.5;
      l.celulas.forEach((valor, i) => {
        const c = colunas[i];
        const recuo = l.perfil?.coluna === i ? 6.6 : 0;
        if (recuo) perfil(l.perfil!.id, x, y + 1.2, 5);
        fonte(8.5, i === 0);
        doc.text(
          caber(valor, c.largura - recuo - (c.direita ? 6 : 2)),
          c.direita ? x + c.largura - 5 : x + recuo,
          y + 4.8,
          { align: c.direita ? "right" : "left" },
        );
        x += c.largura;
      });
      if (l.sub) {
        fonte(7, false, OCRE);
        const t = caber(l.sub, LARGURA - 5);
        if (l.link)
          doc.textWithLink(t, MARGEM + 2.5, y + 8.6, { url: l.link });
        else doc.text(t, MARGEM + 2.5, y + 8.6);
      }
      y += altura;
    });
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, y, MARGEM + LARGURA, y);
  };
  const vazio = (texto: string) => {
    fonte(8.5, false, CINZA);
    doc.text(textoPdf(texto), MARGEM, y + 3);
    y += 6;
  };

  // ── Faixa de capa ────────────────────────────────────────────────────────
  doc.setFillColor(11, 10, 10);
  doc.rect(0, 0, 210, ALTURA_FAIXA, "F");
  doc.setFillColor(...AMARELO);
  doc.rect(0, ALTURA_FAIXA, 210, 1.1, "F");
  fonte(7.5, true, AMARELO);
  doc.text("NIDO AI STUDIO", MARGEM, 13, { charSpace: 0.5 });
  fonte(7.5, false, CLARO);
  doc.text(
    textoPdf(tx("Relatório de desempenho")).toUpperCase(),
    MARGEM + 34,
    13,
    { charSpace: 0.3 },
  );
  // Na capa: a foto do personagem do relatório, ou as de quem publicou no período.
  const naCapa = d.personagemId
    ? [d.personagemId]
    : d.resumo.personagens.slice(0, 5).map((l) => l.characterId);
  const ladoCapa = d.personagemId ? 27 : 17;
  const passoCapa = ladoCapa * 0.72;
  const larguraCapa = naCapa.length
    ? ladoCapa + passoCapa * (naCapa.length - 1)
    : 0;
  const larguraTitulo = LARGURA - (larguraCapa ? larguraCapa + 7 : 0);
  fonte(24, true, BRANCO);
  doc.text(caber(quem, larguraTitulo), MARGEM, 27);
  fonte(9.5, false, CLARO);
  const fimPeriodo = new Date(d.resumo.fim.getTime() - 1);
  doc.text(
    textoPdf(
      `${tx("últimos")} ${d.periodo} ${tx("dias")}  ·  ${dia(d.resumo.inicio)} - ${dia(fimPeriodo)}  ·  ${tx("Gerado em")} ${dia(agora)}`,
    ),
    MARGEM,
    35,
  );
  naCapa.forEach((id, i) => {
    const x = 210 - MARGEM - larguraCapa + i * passoCapa;
    const topo = (ALTURA_FAIXA - ladoCapa) / 2;
    // Aro: amarelo no relatório de um personagem; escuro entre as fotos sobrepostas.
    doc.setFillColor(...(d.personagemId ? AMARELO : ([11, 10, 10] as Cor)));
    doc.circle(x + ladoCapa / 2, topo + ladoCapa / 2, ladoCapa / 2 + 0.7, "F");
    perfil(id, x, topo, ladoCapa);
  });
  y = ALTURA_FAIXA + 9;

  // ── Resumo em uma linha ──────────────────────────────────────────────────
  const fatos: Array<[string, string]> = [
    [tx("Posts publicados"), inteiro(d.resumo.posts)],
    [tx("Engajamento médio"), pct(engajamento(d.resumo.atual))],
    [
      tx("Redes"),
      d.resumo.redes.length
        ? d.resumo.redes.map((r) => INFO_REDES[r.rede].nome).join(", ")
        : "-",
    ],
  ];
  const larguras = [38, 44, LARGURA - 82];
  let xFato = MARGEM;
  fatos.forEach(([rotulo, valor], i) => {
    fonte(6.5, true, CINZA);
    doc.text(textoPdf(rotulo).toUpperCase(), xFato, y, { charSpace: 0.15 });
    fonte(11, true);
    doc.text(caber(valor, larguras[i] - 4), xFato, y + 5.6);
    xFato += larguras[i];
  });
  y += 11;

  // ── Indicadores ──────────────────────────────────────────────────────────
  const vao = 2.6;
  const caixa = (LARGURA - vao * (KPIS.length - 1)) / KPIS.length;
  const alturaCaixa = 24;
  KPIS.forEach(([campo, rotulo], i) => {
    const x = MARGEM + i * (caixa + vao);
    const destaque = i === 0;
    doc.setLineWidth(0.2);
    doc.setDrawColor(...(destaque ? TINTA : LINHA));
    doc.setFillColor(...(destaque ? TINTA : BRANCO));
    doc.roundedRect(x, y, caixa, alturaCaixa, 1.8, 1.8, "FD");
    fonte(6, true, destaque ? CLARO : CINZA);
    doc.text(caber(tx(rotulo), caixa - 5).toUpperCase(), x + 2.8, y + 5.6, {
      charSpace: 0.12,
    });
    fonte(15, true, destaque ? AMARELO : TINTA);
    doc.text(
      caber(inteiro(d.resumo.atual[campo]), caixa - 5),
      x + 2.8,
      y + 14,
    );
    const delta = variacao(d.resumo.atual[campo], d.resumo.anterior[campo]);
    fonte(
      6.4,
      delta !== null,
      delta === null
        ? destaque
          ? CLARO
          : CINZA
        : delta < 0
          ? VERMELHO
          : destaque
            ? [86, 211, 100]
            : VERDE,
    );
    doc.text(
      delta === null
        ? textoPdf(tx("sem período anterior"))
        : `${delta < 0 ? "-" : "+"}${Math.abs(Math.round(delta))}% ${textoPdf(tx("vs"))} ${d.periodo}d ${textoPdf(tx("anteriores"))}`,
      x + 2.8,
      y + 19.8,
    );
  });
  y += alturaCaixa;

  // ── Gráfico de visualizações + divisão por rede (lado a lado) ────────────
  secao(
    tx("Visualizações no período"),
    d.periodo === 7
      ? tx("por dia")
      : `${tx("a cada")} ${d.resumo.barras[0]?.dias} ${tx("dias")}`,
  );
  const alturaBloco = 50;
  garantir(alturaBloco + 4);
  const topo = y + 2;
  const larguraGrafico = 112;
  const colunaRede = MARGEM + larguraGrafico + 10;
  const larguraRede = LARGURA - larguraGrafico - 10;
  {
    const barras = d.resumo.barras;
    const chao = topo + alturaBloco - 7;
    const alturaUtil = alturaBloco - 15;
    const max = Math.max(...barras.map((b) => b.views), 1);
    // Linhas-guia
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.15);
    for (let i = 1; i <= 3; i++) {
      const gy = chao - (alturaUtil * i) / 3;
      doc.line(MARGEM, gy, MARGEM + larguraGrafico, gy);
    }
    const folga = barras.length > 7 ? 2.4 : 3.4;
    const larguraBarra =
      (larguraGrafico - folga * (barras.length - 1)) / barras.length;
    barras.forEach((b, i) => {
      const x = MARGEM + i * (larguraBarra + folga);
      const h = (b.views / max) * alturaUtil;
      if (h > 0.2) {
        doc.setFillColor(...(b.views === max ? TINTA : OCRE));
        doc.roundedRect(x, chao - h, larguraBarra, h, 0.8, 0.8, "F");
        fonte(6.2, true, TINTA);
        doc.text(
          textoPdf(compacto.format(b.views)),
          x + larguraBarra / 2,
          chao - h - 1.4,
          { align: "center" },
        );
      }
      fonte(6.2, false, CINZA);
      doc.text(
        textoPdf(
          d.periodo === 7
            ? b.inicio
                .toLocaleDateString("pt-BR", { weekday: "short" })
                .replace(".", "")
            : b.inicio.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              }),
        ),
        x + larguraBarra / 2,
        chao + 3.8,
        { align: "center" },
      );
    });
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, chao, MARGEM + larguraGrafico, chao);
  }
  {
    fonte(7.5, true, TINTA);
    doc.text(textoPdf(tx("Por rede")), colunaRede, topo + 2);
    fonte(6.5, false, CINZA);
    doc.text(
      textoPdf(tx("% das visualizações")),
      colunaRede + larguraRede,
      topo + 2,
      { align: "right" },
    );
    const total = d.resumo.redes.reduce((n, r) => n + r.views, 0);
    let ry = topo + 9;
    if (!d.resumo.redes.length) {
      fonte(8, false, CINZA);
      doc.text(textoPdf(tx("Nenhum post publicado neste período.")), colunaRede, ry);
    }
    for (const r of d.resumo.redes.slice(0, 5)) {
      const parte = total ? r.views / total : 0;
      fonte(8, true);
      doc.text(caber(INFO_REDES[r.rede].nome, larguraRede - 26), colunaRede, ry);
      fonte(7.5, false, CINZA);
      doc.text(
        `${textoPdf(compacto.format(r.views))}  ·  ${Math.round(parte * 100)}%`,
        colunaRede + larguraRede,
        ry,
        { align: "right" },
      );
      doc.setFillColor(...LINHA);
      doc.roundedRect(colunaRede, ry + 1.6, larguraRede, 1.8, 0.9, 0.9, "F");
      if (parte > 0) {
        doc.setFillColor(...OCRE);
        doc.roundedRect(
          colunaRede,
          ry + 1.6,
          Math.max(1.8, larguraRede * parte),
          1.8,
          0.9,
          0.9,
          "F",
        );
      }
      ry += 8.4;
    }
  }
  y = topo + alturaBloco;

  // ── Por personagem ───────────────────────────────────────────────────────
  const numeros = (m: Metricas) => [
    inteiro(m.views),
    inteiro(m.curtidas),
    inteiro(m.comentarios),
    inteiro(m.reposts),
    inteiro(m.quotes),
    inteiro(m.salvos),
  ];
  const colunasNumeros: Coluna[] = [
    "Views",
    "Curtidas",
    "Coment.",
    "Reposts",
    "Quotes",
    "Salvos",
  ].map((titulo) => ({ titulo: tx(titulo), largura: 19, direita: true }));
  // Com um personagem só, a tabela repetiria os indicadores de cima.
  if (!d.personagem) {
    secao(tx("Por personagem"), tx("ordenado por visualizações"));
    if (!d.resumo.personagens.length)
      vazio(tx("Nenhum post publicado neste período."));
    else
      tabela(
        [
          { titulo: tx("Personagem"), largura: 36 },
          { titulo: tx("Posts"), largura: 13, direita: true },
          ...colunasNumeros,
          { titulo: tx("Eng."), largura: 19, direita: true },
        ],
        d.resumo.personagens.map((l) => ({
          perfil: { coluna: 0, id: l.characterId },
          celulas: [
            d.nomes.get(l.characterId) ?? tx("Personagem removido"),
            String(l.posts),
            ...numeros(l.total),
            pct(engajamento(l.total)),
          ],
        })),
      );
  }

  // ── Posts do período ─────────────────────────────────────────────────────
  const doPeriodo = d.posts
    .filter((p) => {
      const t = new Date(p.quando).getTime();
      return t >= d.resumo.inicio.getTime() && t < d.resumo.fim.getTime();
    })
    .sort((a, b) => b.quando.localeCompare(a.quando));
  const temManual = doPeriodo.some((p) => p.viewsManual);
  secao(tx("Posts do período"), tx("do mais recente ao mais antigo"));
  if (!doPeriodo.length) vazio(tx("Nenhum post publicado neste período."));
  else
    tabela(
      [
        { titulo: tx("Data"), largura: 21 },
        { titulo: tx("Rede"), largura: 27 },
        { titulo: tx("Personagem"), largura: 32 },
        // Mais estreitas que na tabela de personagens, pra caber o nome.
        ...colunasNumeros.map((c) => ({ ...c, largura: 17 })),
      ],
      doPeriodo.map((p) => {
        const m = Object.values(p.metricas).reduce<Metricas>(somar, ZERO);
        const [views, ...resto] = numeros(m);
        return {
          celulas: [
            dia(new Date(p.quando)),
            p.redes.map((r) => INFO_REDES[r].nome).join(", "),
            d.nomes.get(p.characterId) ?? tx("Personagem removido"),
            `${views}${p.viewsManual ? "*" : ""}`,
            ...resto,
          ],
          sub: p.link ?? undefined,
          link: p.link ?? undefined,
          perfil: { coluna: 2, id: p.characterId },
        };
      }),
    );

  // ── Notas ────────────────────────────────────────────────────────────────
  const notas = [
    tx(
      "Engajamento = (curtidas + comentários + reposts + quotes + salvamentos) ÷ visualizações. Os posts contam pela data de publicação.",
    ),
    `${tx("Métricas públicas das redes, lidas em")} ${dia(agora)}.`,
    ...(temManual
      ? [
          tx(
            "* Visualizações informadas pelo criador (a rede não divulga esse número).",
          ),
        ]
      : []),
  ];
  garantir(8 + notas.length * 4);
  y += 7;
  fonte(6.5, true, CINZA);
  doc.text(textoPdf(tx("Notas")).toUpperCase(), MARGEM, y, { charSpace: 0.15 });
  y += 3.8;
  fonte(7, false, CINZA);
  for (const n of notas) {
    const linhas = doc.splitTextToSize(textoPdf(n), LARGURA) as string[];
    doc.text(linhas, MARGEM, y);
    y += linhas.length * 3.4;
  }

  // ── Rodapé de cada página ────────────────────────────────────────────────
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, 297 - 12, MARGEM + LARGURA, 297 - 12);
    fonte(7, true, OCRE);
    doc.text("NIDO AI STUDIO", MARGEM, 297 - 7.5, { charSpace: 0.3 });
    fonte(7, false, CINZA);
    doc.text(
      caber(`${tx("Relatório de desempenho")}  ·  ${quem}`, 110),
      MARGEM + 30,
      297 - 7.5,
    );
    doc.text(`${i} / ${paginas}`, MARGEM + LARGURA, 297 - 7.5, {
      align: "right",
    });
  }

  const slug =
    textoPdf(d.personagem ?? "todos")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "personagem";
  doc.save(
    `nido-metricas-${slug}-${d.periodo}d-${dia(agora).split("/").reverse().join("-")}.pdf`,
  );
}
