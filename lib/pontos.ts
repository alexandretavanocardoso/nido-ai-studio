/**
 * Sistema de pontos: valores e regras, compartilhados entre a tela e o
 * servidor. O banco fica em ./pontos-server.ts; a proposta, em PONTOS.md.
 *
 * Os pontos só se acumulam (ainda não são trocados por nada).
 */

/** Pontos do check-in em cada dia do ciclo de 7 (o ciclo recomeça; perder a sequência volta ao dia 1). */
export const CHECKIN_CICLO = [5, 5, 10, 10, 15, 15, 40] as const;

/** Pontos por crédito gasto em qualquer geração (estorno e reembolso tiram os pontos). */
export const PONTOS_POR_CREDITO = 1;
/** Post publicado nas redes, até POSTS_POR_DIA por dia. */
export const PONTOS_POST = 10;
export const POSTS_POR_DIA = 3;
/** Quem você indicou assinou um plano (uma vez por indicado). */
export const PONTOS_INDICACAO = 1000;

/** Primeiros passos: cada um pontua uma vez por conta. */
export const MISSOES = {
  ficha: { titulo: "Completar a ficha do primeiro personagem", pontos: 50 },
  primeira_imagem: { titulo: "Gerar a primeira imagem", pontos: 30 },
  primeiro_video: { titulo: "Criar o primeiro vídeo", pontos: 50 },
  voz: { titulo: "Criar a voz do personagem", pontos: 50 },
  rede: { titulo: "Conectar a primeira rede social", pontos: 50 },
  primeiro_post: { titulo: "Publicar o primeiro post", pontos: 100 },
  persona: { titulo: "Treinar a primeira persona", pontos: 100 },
  plano: { titulo: "Assinar um plano pela primeira vez", pontos: 500 },
} as const;
export type MissaoId = keyof typeof MISSOES;

/** Depois de um check-in, o próximo só libera passadas estas horas (contadas do momento do clique). */
export const CHECKIN_ESPERA_HORAS = 24;
/** A sequência se mantém se o próximo check-in vier em até estas horas depois do anterior (um dia de folga depois de liberar). */
export const CHECKIN_PRAZO_HORAS = 48;

/** Dá para fazer check-in? `horas` = horas desde o último (null se nunca fez). */
export const checkinLiberado = (horas: number | null) =>
  horas === null || horas >= CHECKIN_ESPERA_HORAS;

/** A sequência de dias seguidos ainda vale? */
export const sequenciaViva = (horas: number | null) =>
  horas !== null && horas < CHECKIN_PRAZO_HORAS;

/** Dias seguidos depois de um check-in agora. */
export function proximaSequencia(
  sequencia: number,
  horas: number | null,
): number {
  return sequenciaViva(horas) ? sequencia + 1 : 1;
}

/** Posição (0 a 6) no ciclo de 7 dias de quem está em `sequencia` dias seguidos. */
export const diaDoCiclo = (sequencia: number) =>
  (Math.max(1, sequencia) - 1) % CHECKIN_CICLO.length;

/** Pontos do check-in que leva a `sequencia` dias seguidos. */
export const pontosDoCheckin = (sequencia: number) =>
  CHECKIN_CICLO[diaDoCiclo(sequencia)];

export const NOME_MOTIVO_PONTOS: Record<string, string> = {
  checkin: "Check-in diário",
  creditos_gastos: "Créditos gastos",
  estorno: "Gasto devolvido",
  post: "Post publicado",
  indicacao: "Indicado assinou um plano",
  sorteio: "Prêmio de sorteio",
  sorteio_participou: "Participou de um sorteio",
};

/** O que a tela recebe de /api/pontos. */
export interface ResumoPontos {
  saldo: number;
  /** Dias seguidos de check-in (0 se a sequência foi perdida). */
  sequencia: number;
  /** Já fez o check-in e o próximo ainda não liberou. */
  checkinHoje: boolean;
  /** Quando o próximo check-in libera (ISO): 24 horas depois do último. Null se já pode fazer. */
  proximoEm: string | null;
  /** Dia do ciclo (0 a 6) do próximo check-in — ou do último, se ainda está em espera. */
  dia: number;
  missoesFeitas: MissaoId[];
  historico: Array<{
    id: string;
    delta: number;
    motivo: string;
    /** Missão, quando o motivo é "missao". */
    ref: string | null;
    quando: string;
  }>;
}
