/**
 * Catálogo de badges do NFT do influencer. Compartilhado entre a tela e o
 * servidor.
 *
 * Cada métrica tem a sua escada de marcas. Os badges valem sobre o total
 * acumulado do personagem em todas as redes (lib/nft/views-server.ts) e se
 * acumulam: quem chega a 1 milhão de views tem todos os anteriores.
 *
 * COMO AS ESCADAS FORAM ESCOLHIDAS (pesquisa de 10/10/2026, fontes no desenho
 * do fluxo): cada escada é a de views dividida pelo quanto a métrica rende por
 * view em vídeo curto, para o degrau de uma métrica ser tão difícil quanto o
 * degrau de views na mesma posição — o primeiro perto de 5 mil views, o último
 * perto de 100 milhões. Todas andam no mesmo ritmo (×2, ×5) e em números
 * redondos.
 *   curtidas     2 a 5% das views          → views ÷ 50
 *   comentários  0,05 a 0,1% das views     → views ÷ 1.000
 *   reposts      0,15 a 0,4% das views     → views ÷ 500
 *   salvos       0,1% das views que o app consegue ler (conta conectada traz
 *                os do Instagram e do X; link traz os do TikTok e do X; nunca
 *                os dois juntos)           → views ÷ 1.000
 *   quotes       só existem no X: 0,01% das views de lá (1 a cada 10 mil). A
 *                escada vai até 10 mil, o que 100 milhões de views no X rendem.
 * Nenhuma escada tem degrau abaixo de 10: marca de um dígito a própria pessoa
 * bate com as contas dela, e badge gravado no NFT não se desfaz.
 *
 * REGRA PARA MEXER NAS ESCADAS: no NFT os badges são gravados pela POSIÇÃO do
 * degrau na escada (ver montarDados). Por isso só se pode ACRESCENTAR degraus
 * no fim de uma escada, ou escadas novas. Mudar ou tirar um degrau exige subir
 * VERSAO_DADOS e ensinar lerDados a ler a versão antiga.
 */

/** Métricas que rendem badges, com os nomes de lib/social/metricas.ts. */
export const METRICAS_BADGE = [
  "views",
  "curtidas",
  "comentarios",
  "reposts",
  "quotes",
  "salvos",
] as const;
export type MetricaBadge = (typeof METRICAS_BADGE)[number];

/** Total acumulado do personagem em cada métrica. */
export type Totais = Record<MetricaBadge, number>;

export const SEM_TOTAIS: Totais = {
  views: 0,
  curtidas: 0,
  comentarios: 0,
  reposts: 0,
  quotes: 0,
  salvos: 0,
};

interface Escada {
  /** Começo do id do badge ("views" → "views_5k"). Não muda nunca. */
  prefixo: string;
  /** Chave da métrica no que é gravado no NFT. Não muda nunca. */
  letra: string;
  /** A métrica depois do número: "5 mil views", "1 mil curtidas". */
  plural: string;
  /** Em inglês, para os metadados do NFT e a tela em EN. */
  pluralEn: string;
  /** Título da métrica na tela. */
  titulo: string;
  tituloEn: string;
  /** De que redes o número vem, quando não são todas (aparece ao lado do título). */
  nota?: string;
  notaEn?: string;
  /** Marcas, da menor para a maior. */
  degraus: number[];
  /** Desta marca para cima, o badge sempre espera a aprovação de um admin. */
  aprovacaoDe: number;
  /**
   * Desta marca para cima, o badge espera aprovação quando os números não vêm
   * de conta conectada (conta ligada só pelo primeiro link é prova fraca).
   */
  semConexaoDe: number;
}

export const ESCADAS: Record<MetricaBadge, Escada> = {
  views: {
    prefixo: "views",
    letra: "v",
    plural: "views",
    pluralEn: "views",
    titulo: "Views",
    tituloEn: "Views",
    degraus: [
      5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000,
      10_000_000, 50_000_000, 100_000_000,
    ],
    aprovacaoDe: 1_000_000,
    semConexaoDe: 100_000,
  },
  curtidas: {
    prefixo: "likes",
    letra: "l",
    plural: "curtidas",
    pluralEn: "likes",
    titulo: "Curtidas",
    tituloEn: "Likes",
    degraus: [
      100, 200, 1_000, 2_000, 10_000, 20_000, 100_000, 200_000, 1_000_000,
      2_000_000,
    ],
    aprovacaoDe: 20_000,
    semConexaoDe: 2_000,
  },
  comentarios: {
    prefixo: "comments",
    letra: "c",
    plural: "comentários",
    pluralEn: "comments",
    titulo: "Comentários",
    tituloEn: "Comments",
    degraus: [10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000],
    aprovacaoDe: 1_000,
    semConexaoDe: 100,
  },
  reposts: {
    prefixo: "reposts",
    letra: "r",
    plural: "reposts",
    pluralEn: "reposts",
    titulo: "Reposts",
    tituloEn: "Reposts",
    nota: "No X são os reposts; no TikTok e no LinkedIn, os compartilhamentos. Instagram só com a conta conectada.",
    notaEn:
      "Reposts on X; shares on TikTok and LinkedIn. Instagram only with the account connected.",
    degraus: [10, 20, 100, 200, 1_000, 2_000, 10_000, 20_000, 100_000, 200_000],
    aprovacaoDe: 2_000,
    semConexaoDe: 200,
  },
  quotes: {
    prefixo: "quotes",
    letra: "q",
    plural: "quotes",
    pluralEn: "quotes",
    titulo: "Quotes",
    tituloEn: "Quotes",
    nota: "Só o X tem quotes.",
    notaEn: "Only X has quotes.",
    degraus: [10, 50, 100, 500, 1_000, 5_000, 10_000],
    aprovacaoDe: 500,
    semConexaoDe: 50,
  },
  salvos: {
    prefixo: "saves",
    letra: "s",
    plural: "salvamentos",
    pluralEn: "saves",
    titulo: "Salvos",
    tituloEn: "Saves",
    nota: "Por link: TikTok e X. Com a conta conectada: Instagram e X. YouTube e LinkedIn não informam.",
    notaEn:
      "By link: TikTok and X. With the account connected: Instagram and X. YouTube and LinkedIn do not report saves.",
    degraus: [10, 50, 100, 500, 1_000, 5_000, 10_000, 50_000, 100_000],
    aprovacaoDe: 1_000,
    semConexaoDe: 100,
  },
};

export interface Badge {
  id: string;
  metrica: MetricaBadge;
  /** "5 mil views", "1 milhão de curtidas". */
  nome: string;
  nomeEn: string;
  /** Nome curto e sem idioma ("5K", "1M", "500"). */
  rotulo: string;
  /** Total da métrica que conquista o badge. */
  limite: number;
}

/** 5000 → "5K" · 1500000 → "1.5M" · 500 → "500" */
export function rotuloDoLimite(n: number): string {
  const corta = (v: number) => String(Math.round(v * 10) / 10);
  if (n >= 1_000_000) return `${corta(n / 1_000_000)}M`;
  if (n >= 1_000) return `${corta(n / 1_000)}K`;
  return String(n);
}

/** 5000 → "5 mil" · 1000000 → "1 milhão de" · 500 → "500" (falta só a métrica). */
function numeroPorExtenso(n: number): string {
  const corta = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${corta(m)} ${m === 1 ? "milhão" : "milhões"} de`;
  }
  if (n >= 1_000) return `${corta(n / 1_000)} mil`;
  return String(n);
}

function badgesDaEscada(metrica: MetricaBadge): Badge[] {
  const e = ESCADAS[metrica];
  return e.degraus.map((limite) => {
    const rotulo = rotuloDoLimite(limite);
    return {
      id: `${e.prefixo}_${rotulo.toLowerCase().replace(".", "_")}`,
      metrica,
      nome: `${numeroPorExtenso(limite)} ${e.plural}`,
      nomeEn: `${rotulo} ${e.pluralEn}`,
      rotulo,
      limite,
    };
  });
}

/** Todos os badges, métrica por métrica, do menor para o maior. */
export const BADGES: ReadonlyArray<Badge> = METRICAS_BADGE.flatMap(badgesDaEscada);

export const badgesDaMetrica = (m: MetricaBadge): Badge[] =>
  BADGES.filter((b) => b.metrica === m);

/** Métricas que têm escada (as que aparecem na tela). */
export const METRICAS_COM_BADGE: MetricaBadge[] = METRICAS_BADGE.filter(
  (m) => ESCADAS[m].degraus.length > 0,
);

export const badgePorId = (id: string): Badge | undefined =>
  BADGES.find((b) => b.id === id);

/** O badge sempre espera a aprovação de um admin antes de valer (marca alta)? */
export const precisaAprovacao = (b: Badge): boolean =>
  b.limite >= ESCADAS[b.metrica].aprovacaoDe;

/** O badge só sai sozinho com números de conta conectada? */
export const precisaConexao = (b: Badge): boolean =>
  b.limite >= ESCADAS[b.metrica].semConexaoDe;

/** Badges que os totais já conquistaram, métrica por métrica, do menor para o maior. */
export function badgesAtingidos(totais: Partial<Totais>): Badge[] {
  return BADGES.filter((b) => (totais[b.metrica] ?? 0) >= b.limite);
}

/** Próxima marca a bater nessa métrica (null = já tem todas, ou a métrica não tem escada). */
export function proximoBadge(metrica: MetricaBadge, total: number): Badge | null {
  return badgesDaMetrica(metrica).find((b) => total < b.limite) ?? null;
}

/** Lê os totais guardados no banco (jsonb), completando com zero o que faltar. */
export function lerTotais(valor: unknown): Totais {
  const t: Totais = { ...SEM_TOTAIS };
  if (valor && typeof valor === "object")
    for (const m of METRICAS_BADGE) {
      const n = Number((valor as Record<string, unknown>)[m]);
      if (Number.isFinite(n) && n > 0) t[m] = n;
    }
  return t;
}

/* ------------------------------------------------------------------ */
/* O que fica gravado no NFT (plugin AppData, em JSON)                  */
/* ------------------------------------------------------------------ */

/** Versão do formato gravado no NFT. */
export const VERSAO_DADOS = 2;

/**
 * Maior bloco de dados que cabe com folga numa transação de escrita (o limite
 * da rede é 1232 bytes para a transação inteira).
 */
export const MAX_BYTES_DADOS = 760;

const MS_POR_DIA = 86_400_000;

/** O que o NFT diz, já lido: o hash da ficha e os badges gravados. */
export interface DadosNoNft {
  v: number;
  /** SHA-256 (hex) da ficha no momento do mint. */
  ficha: string;
  /** Ids dos badges gravados. */
  badges: string[];
}

/**
 * Bytes gravados no NFT: a lista inteira de badges, sempre (a escrita substitui
 * tudo). Formato compacto, para caberem todas as escadas numa transação:
 *
 *   {"v":2,"ficha":"<sha-256>","b":{"v":[20371,20380,0,20401],"l":[20390]}}
 *
 * Em "b", cada métrica (pela letra da escada) leva uma lista na ordem dos
 * degraus: o dia em que o degrau foi conquistado (dias desde 01/01/1970, UTC),
 * ou 0 se ainda não foi. Zeros no fim são cortados. Badge fora do catálogo não
 * é gravado.
 */
export function montarDados(
  fichaHash: string,
  badges: Array<{ id: string; em: Date }>,
): Uint8Array {
  const dia = new Map(
    badges.map((b) => [b.id, Math.max(1, Math.floor(b.em.getTime() / MS_POR_DIA))]),
  );
  const b: Record<string, number[]> = {};
  for (const m of METRICAS_BADGE) {
    const dias = badgesDaMetrica(m).map((x) => dia.get(x.id) ?? 0);
    while (dias.length && dias[dias.length - 1] === 0) dias.pop();
    if (dias.length) b[ESCADAS[m].letra] = dias;
  }
  const bytes = new TextEncoder().encode(
    JSON.stringify({ v: VERSAO_DADOS, ficha: fichaHash, b }),
  );
  if (bytes.length > MAX_BYTES_DADOS)
    throw new Error(
      `Dados do NFT grandes demais (${bytes.length} bytes; máx. ${MAX_BYTES_DADOS}).`,
    );
  return bytes;
}

/** Lê o que está gravado no NFT, na versão atual ou na primeira (null = vazio ou fora do formato). */
export function lerDados(valor: unknown): DadosNoNft | null {
  let v = valor;
  if (v instanceof Uint8Array) {
    try {
      v = JSON.parse(new TextDecoder().decode(v));
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const d = v as { v?: unknown; ficha?: unknown; badges?: unknown; b?: unknown };
  if (typeof d.ficha !== "string") return null;
  // Versão 1: {"badges":[["views_5k", 1760000000], …]}
  if (Array.isArray(d.badges))
    return {
      v: Number(d.v) || 1,
      ficha: d.ficha,
      badges: d.badges
        .filter((x): x is [string, number] => Array.isArray(x) && typeof x[0] === "string")
        .map((x) => x[0]),
    };
  if (!d.b || typeof d.b !== "object") return null;
  const ids: string[] = [];
  for (const m of METRICAS_BADGE) {
    const dias = (d.b as Record<string, unknown>)[ESCADAS[m].letra];
    if (!Array.isArray(dias)) continue;
    badgesDaMetrica(m).forEach((x, i) => {
      if (typeof dias[i] === "number" && dias[i] > 0) ids.push(x.id);
    });
  }
  return { v: Number(d.v) || VERSAO_DADOS, ficha: d.ficha, badges: ids };
}

/** As duas listas têm os mesmos ids (a ordem não importa)? */
export function mesmosBadges(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((id) => s.has(id));
}
