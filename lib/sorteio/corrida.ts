/**
 * A corrida de influencers do sorteio: a "receita" de quem corre quanto a cada
 * instante. O ganhador já foi sorteado no servidor (crypto) antes da largada;
 * a corrida só encena o resultado — como a corrida de patinhos: o pelotão
 * embaralha o tempo todo, um dispara num turbo, outro freia, a liderança troca
 * várias vezes e, na reta final, o sorteado vem de trás numa arrancada e passa
 * o líder perto da linha. A receita sai toda da semente, do número de
 * corredores, de quem ganha e da duração: o servidor guarda os quatro e cada
 * tela (quem participa, o admin, o palco do OBS) monta a mesma corrida, no
 * mesmo instante. Contas puras, usadas no navegador e nos testes.
 */

/** Contagem antes da largada (segundos). */
export const CONTAGEM_S = 5;
/** Quanto a corrida dura (o ganhador cruza a linha nesse instante): opções do admin, em segundos. */
export const DURACOES = [15, 20, 25, 30] as const;
export const DURACAO_PADRAO = 30;
/** Duração da corrida dos sorteios antigos (de antes da escolha). */
export const DURACAO_ANTIGA = 24;
/** Depois que o ganhador cruza: a "foto de chegada" (a tela congela) antes do pódio. */
export const FOTO_S = 1.4;
/** Quando o último já chegou: a corrida acabou para todas as telas. */
export const fimDaCorrida = (duracao: number) => duracao + 7;

/** Passo da simulação (segundos). */
const PASSO_S = 0.05;
/** Depois da linha, o corredor ainda anda isto (freando). */
const SOBRA = 0.06;
/** O "elástico" do pelotão: quem está 4% da pista atrás da média anda isto mais rápido (e vice-versa), até o máximo. */
const ELASTICO = 0.11;
const ELASTICO_MAX = 0.22;
/** O ganhador começa a reta final atrás do líder, a esta distância (fração da pista). */
const ATRAS_MIN = 0.008;
const ATRAS_MAX = 0.06;

/** Gerador de números da semente (mulberry32): o mesmo em qualquer navegador. */
export function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turbo (dispara), freio (trava) ou a arrancada final do ganhador — o que a tela mostra no corredor. */
export interface Evento {
  i: number;
  tipo: "turbo" | "freio" | "arrancada";
  ini: number;
  fim: number;
  /** Multiplica a velocidade no meio do evento (turbo > 1, freio < 1). */
  forca: number;
}

export interface Roteiro {
  /** Quando o ganhador cruza a linha (segundos desde a largada). */
  duracao: number;
  /** Quando cada corredor cruza a linha. */
  chegada: number[];
  /** Distância (0 a 1 = a linha) de cada corredor a cada PASSO_S. */
  pos: Float32Array[];
  eventos: Evento[];
  /** Trocas de liderança (quem passou a liderar e quando). */
  lideres: { t: number; i: number }[];
  /** Começo da reta final: a arrancada do ganhador. */
  retaFinal: number;
}

/** 0 → 1 → 0 dentro do evento: sobe rápido, segura e desce (fora dele, 0). */
function envelope(t: number, ini: number, fim: number): number {
  if (t <= ini || t >= fim) return 0;
  const u = (t - ini) / (fim - ini);
  const subida = Math.min(1, u / 0.2);
  const descida = Math.min(1, (1 - u) / 0.25);
  const e = Math.min(subida, descida);
  return e * e * (3 - 2 * e);
}

/** 0 → 1 a partir de `ini`, em `dur` segundos, e fica em 1. */
function rampa(t: number, ini: number, dur: number): number {
  const u = Math.min(1, Math.max(0, (t - ini) / dur));
  return u * u * (3 - 2 * u);
}

function multiplicador(eventos: Evento[], t: number): number {
  let f = 1;
  for (const e of eventos) {
    const env = envelope(t, e.ini, e.fim);
    if (env > 0) f *= 1 + (e.forca - 1) * env;
  }
  return f;
}

/** Posição numa série amostrada a cada PASSO_S (interpolação linear). */
function naSerie(serie: ArrayLike<number>, t: number): number {
  const k = t / PASSO_S;
  const j = Math.min(serie.length - 2, Math.max(0, Math.floor(k)));
  const u = Math.min(1, Math.max(0, k - j));
  return serie[j] + (serie[j + 1] - serie[j]) * u;
}

/** Cabe um evento novo sem encostar nos outros do mesmo corredor? */
function cabe(lista: Evento[], ini: number, fim: number): boolean {
  return lista.every((e) => fim + 0.4 < e.ini || ini > e.fim + 0.4);
}

/**
 * Monta a corrida: o ganhador cruza a linha em `duracao` segundos; os outros,
 * depois. Cada um tem ritmo próprio (ondulando), turbos e freadas sorteados;
 * de tempos em tempos, alguém do fundo dispara e o líder às vezes freia (a
 * liderança troca); na reta final, o ganhador — que vinha logo atrás — faz a
 * arrancada e passa quem estava na frente perto da linha.
 */
export function montarRoteiro(n: number, vencedor: number, semente: number, duracao: number = DURACAO_PADRAO): Roteiro {
  const r = gerador(semente);
  const D = duracao;
  const fim = fimDaCorrida(D) + 1;
  const passos = Math.ceil(fim / PASSO_S) + 1;
  const retaFinal = D - Math.min(5.5, Math.max(3.5, D * 0.2));

  // Ritmo de cada um: velocidade-base e uma ondulação suave (três ondas).
  const base = Array.from({ length: n }, () => 0.96 + 0.08 * r());
  const ondas = Array.from({ length: n }, () =>
    [0, 1, 2].map(() => ({ a: 0.04 + 0.05 * r(), f: (0.15 + 0.45 * r()) * Math.PI * 2, fase: r() * Math.PI * 2 })),
  );
  // Turbos e freadas sorteados (o ganhador só tem os da primeira metade: depois, ele guarda força).
  const doCorredor: Evento[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const limite = i === vencedor ? D * 0.55 : D + 2;
    const turbos = Math.floor((D / 12) * (0.4 + r()));
    const freios = Math.floor((D / 14) * (0.4 + r()));
    for (let k = 0; k < turbos + freios; k++) {
      const turbo = k < turbos;
      const ini = 1.5 + r() * (limite - 2.5);
      const dur = turbo ? 0.9 + 0.7 * r() : 0.5 + 0.6 * r();
      if (ini + dur > limite || !cabe(doCorredor[i], ini, ini + dur)) continue;
      doCorredor[i].push({ i, tipo: turbo ? "turbo" : "freio", ini, fim: ini + dur, forca: turbo ? 1.6 + 0.4 * r() : 0.15 + 0.2 * r() });
    }
  }
  // As viradas: nesses instantes, alguém do fundo dispara e o líder às vezes freia.
  const viradas = Math.max(2, Math.round(D / 7));
  const quando = Array.from({ length: viradas }, (_, k) => D * (0.16 + (0.56 * (k + 0.5 + (r() - 0.5) * 0.6)) / viradas));
  const outros = Array.from({ length: n }, (_, i) => i).filter((i) => i !== vencedor);

  // Simula todo mundo, passo a passo.
  const x: Float32Array[] = Array.from({ length: n }, () => new Float32Array(passos));
  let proxima = 0;
  for (let k = 1; k < passos; k++) {
    const t = (k - 1) * PASSO_S;
    if (proxima < quando.length && t >= quando[proxima] && outros.length > 1) {
      proxima++;
      const ordem = [...outros].sort((a, b) => x[b][k - 1] - x[a][k - 1]);
      const fundo = ordem.slice(Math.ceil(ordem.length * 0.4));
      const quem = fundo[Math.floor(r() * fundo.length)];
      const dur = 1.4 + 0.6 * r();
      if (quem !== undefined && cabe(doCorredor[quem], t, t + dur))
        doCorredor[quem].push({ i: quem, tipo: "turbo", ini: t, fim: t + dur, forca: 2.1 + 0.3 * r() });
      const lider = ordem[0];
      const durF = 0.7 + 0.4 * r();
      if (r() < 0.55 && lider !== quem && cabe(doCorredor[lider], t + 0.3, t + 0.3 + durF))
        doCorredor[lider].push({ i: lider, tipo: "freio", ini: t + 0.3, fim: t + 0.3 + durF, forca: 0.25 + 0.1 * r() });
    }
    // O pelotão anda junto (como os patinhos): quem fica para trás acelera um pouco e quem
    // dispara cansa um pouco — assim os turbos e as freadas viram ultrapassagens.
    let media = 0;
    for (let i = 0; i < n; i++) media += x[i][k - 1];
    media /= n;
    for (let i = 0; i < n; i++) {
      let v = base[i] * (1 - Math.exp(-t / 0.5));
      for (const o of ondas[i]) v *= 1 + o.a * Math.sin(o.f * t + o.fase);
      v *= 1 + Math.min(ELASTICO_MAX, Math.max(-ELASTICO_MAX, (ELASTICO * (media - x[i][k - 1])) / (0.04 * D)));
      v *= multiplicador(doCorredor[i], t);
      x[i][k] = x[i][k - 1] + v * PASSO_S;
    }
  }

  // O comprimento da pista: quem vinha na frente (fora o ganhador) cruza logo depois dele.
  const kD = Math.round(D / PASSO_S);
  let segundo = -1;
  for (const i of outros) if (segundo < 0 || x[i][kD] > x[segundo][kD]) segundo = i;
  const apertado = 0.12 + 0.25 * r();
  const pista = segundo >= 0 ? naSerie(x[segundo], D + apertado) : x[vencedor][kD];

  // O ganhador: o ritmo dele até a reta final (escalado para chegar nela no meio dos
  // primeiros, logo atrás do 1º, 2º ou 3º) e, daí, a arrancada — que cresce até a linha, para a
  // ultrapassagem decisiva ficar perto da chegada — na medida para cruzar exatamente em D.
  const y = x[vencedor];
  const eventosVencedor = doCorredor[vencedor];
  if (segundo >= 0) {
    const kS = Math.round(retaFinal / PASSO_S);
    const yS = y[kS];
    const cresce = (t: number) => Math.min(1, Math.max(0, (t - retaFinal) / (D - retaFinal))) ** 0.7;
    let resto = 0;
    let impulso = 0;
    for (let k = kS; k < kD; k++) {
      const d = y[k + 1] - y[k];
      resto += d;
      impulso += d * cresce(k * PASSO_S);
    }
    const agora = outros.map((i) => x[i][kS]).sort((a, b) => b - a);
    const atrasDe = agora[Math.min(agora.length, 1 + Math.floor(r() * 3)) - 1];
    // Sempre atrás de quem vai chegar em 2º (é ele que o ganhador passa no fim).
    const frente = x[segundo][kS];
    const margem = pista - x[segundo][kD];
    let noInicio = atrasDe - 0.004 * pista;
    noInicio = Math.min(frente - Math.max(ATRAS_MIN * pista, 1.2 * margem), Math.max(frente - ATRAS_MAX * pista, noInicio));
    const escala = noInicio / yS;
    const forca = Math.max(0.1, (pista / escala - yS - resto) / impulso);
    const nova = new Float32Array(passos);
    for (let k = 0; k <= kS; k++) nova[k] = y[k] * escala;
    for (let k = kS; k < passos - 1; k++) {
      const d = (y[k + 1] - y[k]) * (1 + forca * cresce(k * PASSO_S));
      nova[k + 1] = nova[k] + d * escala;
    }
    // Acerta o fim (contas arredondadas): cruza a linha exatamente em D.
    const ajuste = pista / nova[kD];
    for (let k = 0; k < passos; k++) nova[k] *= ajuste;
    x[vencedor] = nova;
    eventosVencedor.push({ i: vencedor, tipo: "arrancada", ini: retaFinal, fim: D, forca: 1 + forca });
  }

  // Posições (0 a 1 = a linha) e quando cada um cruza.
  const pos = x.map((s) => {
    const p = new Float32Array(passos);
    for (let k = 0; k < passos; k++) p[k] = s[k] / pista;
    return p;
  });
  const chegada = pos.map((p, i) => {
    if (i === vencedor) return D;
    for (let k = 1; k < passos; k++)
      if (p[k] >= 1) return (k - 1 + (1 - p[k - 1]) / Math.max(1e-6, p[k] - p[k - 1])) * PASSO_S;
    const v = Math.max(1e-4, (p[passos - 1] - p[passos - 2]) / PASSO_S);
    return (passos - 1) * PASSO_S + (1 - p[passos - 1]) / v;
  });
  // Ninguém cruza antes do ganhador (pelas contas, já é assim; garante).
  for (let i = 0; i < n; i++) if (i !== vencedor && chegada[i] <= D) chegada[i] = D + 0.05;

  // Os eventos que a tela mostra (só antes de cruzar a linha).
  const eventos = doCorredor.flat().filter((e) => e.ini < chegada[e.i]).sort((a, b) => a.ini - b.ini);

  const roteiro: Roteiro = { duracao: D, chegada, pos, eventos, lideres: [], retaFinal };
  // Trocas de liderança: quem fica na frente por pelo menos meio segundo.
  let lider = -1;
  let candidato = -1;
  let desde = 0;
  for (let k = Math.round(0.5 / PASSO_S); k <= kD; k++) {
    const t = k * PASSO_S;
    let melhor = 0;
    for (let i = 1; i < n; i++) if (progresso(roteiro, i, t) > progresso(roteiro, melhor, t)) melhor = i;
    if (melhor !== candidato) {
      candidato = melhor;
      desde = t;
    }
    if (candidato !== lider && (t - desde >= 0.5 || t >= D)) {
      lider = candidato;
      roteiro.lideres.push({ t: desde, i: lider });
    }
  }
  return roteiro;
}

/** Quanto o corredor andou no instante `t` (segundos desde a largada): 0 na largada, 1 na linha. */
export function progresso(r: Roteiro, i: number, t: number): number {
  if (t <= 0) return 0;
  const f = r.chegada[i];
  if (t >= f) return 1 + SOBRA * (1 - Math.exp(-(t - f) / 1.2));
  return Math.min(1, naSerie(r.pos[i], t));
}

/** Quem está na frente no instante `t` (índices, do 1º ao último). */
export function classificacao(r: Roteiro, t: number): number[] {
  const p = r.chegada.map((_, i) => progresso(r, i, t));
  return p
    .map((_, i) => i)
    .sort((a, b) => (p[b] - p[a]) || r.chegada[a] - r.chegada[b]);
}

/** O evento de cada corredor no instante `t` (se houver). */
export function eventosAgora(r: Roteiro, t: number): Map<number, Evento> {
  const agora = new Map<number, Evento>();
  for (const e of r.eventos) if (t >= e.ini && t < e.fim) agora.set(e.i, e);
  return agora;
}
