import type { Metricas, PostMetricas } from "./metricas";
import { REDES, type Rede } from "./redes";

/** Contas do Dashboard (cliente): somas por período, personagem, rede e barras do gráfico. */
export type Periodo = 7 | 30 | 90;

export const ZERO: Metricas = {
  views: 0,
  curtidas: 0,
  comentarios: 0,
  reposts: 0,
  quotes: 0,
  salvos: 0,
};

export function somar(a: Metricas, b: Partial<Metricas> | undefined): Metricas {
  if (!b) return a;
  return {
    views: a.views + (b.views ?? 0),
    curtidas: a.curtidas + (b.curtidas ?? 0),
    comentarios: a.comentarios + (b.comentarios ?? 0),
    reposts: a.reposts + (b.reposts ?? 0),
    quotes: a.quotes + (b.quotes ?? 0),
    salvos: a.salvos + (b.salvos ?? 0),
  };
}

const totalDoPost = (p: PostMetricas) =>
  Object.values(p.metricas).reduce<Metricas>(somar, ZERO);

/** Interações (curtidas, comentários, reposts, quotes e salvamentos) ÷ views. */
export function engajamento(m: Metricas): number {
  const interacoes =
    m.curtidas + m.comentarios + m.reposts + m.quotes + m.salvos;
  return m.views ? interacoes / m.views : 0;
}

export interface LinhaPersonagem {
  characterId: string;
  posts: number;
  total: Metricas;
  /** Rede com mais views (null = ainda sem views). */
  melhor: Rede | null;
}

export interface Resumo {
  posts: number;
  atual: Metricas;
  /** Mesmo tamanho de período, imediatamente antes (pra comparar). */
  anterior: Metricas;
  personagens: LinhaPersonagem[];
  redes: Array<{ rede: Rede; views: number }>;
  barras: Array<{ inicio: Date; dias: number; views: number }>;
}

const DIA = 86_400_000;
/** Dias por barra do gráfico em cada período. */
const DIAS_POR_BARRA: Record<Periodo, number> = { 7: 1, 30: 5, 90: 10 };

/** Resume os posts publicados nos últimos `dias` (contando hoje), pela data de publicação. */
export function resumir(
  posts: PostMetricas[],
  dias: Periodo,
  agora = new Date(),
): Resumo {
  const fim = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate() + 1,
  ).getTime();
  const inicio = fim - dias * DIA;
  const passo = DIAS_POR_BARRA[dias];
  const barras = Array.from({ length: dias / passo }, (_, i) => ({
    inicio: new Date(inicio + i * passo * DIA),
    dias: passo,
    views: 0,
  }));

  let atual = ZERO;
  let anterior = ZERO;
  let n = 0;
  const porPersonagem = new Map<
    string,
    { posts: number; total: Metricas; redes: Partial<Record<Rede, number>> }
  >();
  const porRede = new Map<Rede, number>();

  for (const p of posts) {
    const t = new Date(p.quando).getTime();
    const total = totalDoPost(p);
    if (t >= inicio - dias * DIA && t < inicio) anterior = somar(anterior, total);
    if (t < inicio || t >= fim) continue;
    n++;
    atual = somar(atual, total);
    const barra = barras[Math.floor((t - inicio) / (passo * DIA))];
    if (barra) barra.views += total.views;
    const linha = porPersonagem.get(p.characterId) ?? {
      posts: 0,
      total: ZERO,
      redes: {},
    };
    linha.posts++;
    linha.total = somar(linha.total, total);
    for (const [rede, m] of Object.entries(p.metricas) as Array<
      [Rede, Metricas]
    >) {
      linha.redes[rede] = (linha.redes[rede] ?? 0) + m.views;
      porRede.set(rede, (porRede.get(rede) ?? 0) + m.views);
    }
    porPersonagem.set(p.characterId, linha);
  }

  return {
    posts: n,
    atual,
    anterior,
    personagens: [...porPersonagem.entries()]
      .map(([characterId, l]) => {
        const [melhor, views] = (
          Object.entries(l.redes) as Array<[Rede, number]>
        ).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
        return {
          characterId,
          posts: l.posts,
          total: l.total,
          melhor: views > 0 ? melhor : null,
        };
      })
      .sort((a, b) => b.total.views - a.total.views),
    redes: REDES.filter((r) => porRede.has(r))
      .map((rede) => ({ rede, views: porRede.get(rede) ?? 0 }))
      .sort((a, b) => b.views - a.views),
    barras,
  };
}

/** Variação entre dois períodos, em % (null = sem base pra comparar). */
export function variacao(atual: number, anterior: number): number | null {
  return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
}
