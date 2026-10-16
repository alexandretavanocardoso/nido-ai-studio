import { PLANOS, type PlanoPago } from "@/lib/planos";

/**
 * Sorteio de gift — o que o servidor e as telas compartilham.
 *
 * Fluxo: o admin cria o sorteio "aberto" (as contas entram), pode "fechar" as
 * inscrições, e larga a corrida: o servidor sorteia o ganhador e ela fica
 * "correndo" (contagem + corrida). Quando o ganhador cruza a linha, vira
 * "concluido" e o prêmio é entregue. "cancelado" não sorteia nada.
 */
export type StatusSorteio = "aberto" | "fechado" | "correndo" | "concluido" | "cancelado";

/** Planos que podem ser sorteados (todos os pagos) e por quanto tempo. */
export const MESES_PRESENTE = [1, 3, 6, 12] as const;

/**
 * O prêmio do sorteio:
 *  - plano: o plano por N meses, sem renovação (quem já paga ganha os créditos);
 *  - creditos / pontos: a quantidade escolhida, direto na conta;
 *  - pix: o valor escolhido; o ganhador informa a chave e o admin paga à mão.
 */
export type Premio =
  | { tipo: "plano"; plano: PlanoPago; meses: number }
  | { tipo: "creditos"; quantidade: number }
  | { tipo: "pontos"; quantidade: number }
  | { tipo: "pix"; centavos: number };

export type TipoPremio = Premio["tipo"];

export const TIPOS_PREMIO: TipoPremio[] = ["plano", "creditos", "pontos", "pix"];

/** Limites do que o admin pode sortear. */
export const LIMITES_PREMIO = {
  creditos: { min: 10, max: 100_000 },
  pontos: { min: 10, max: 1_000_000 },
  /** Em centavos: de R$ 1 a R$ 100.000. */
  pix: { min: 100, max: 10_000_000 },
} as const;

export interface Corredor {
  id: string;
  nome: string;
  /** Cor da camiseta. */
  cor: string;
  /** Rosto do influencer (público); null = corredor genérico, com a inicial. */
  foto: string | null;
  /** O próprio influencer correndo (WebP transparente); null = o boneco com o rosto. */
  corpo: string | null;
}

/** O sorteio como as telas veem (sem e-mails nem contas). */
export interface SorteioPublico {
  id: string;
  titulo: string;
  premio: Premio;
  status: StatusSorteio;
  /** Antes da largada: quem já entrou; depois: os corredores, na ordem da corrida. */
  corredores: Corredor[];
  /** Começo da contagem (ms); a largada é CONTAGEM_S depois. */
  largadaEm: number | null;
  semente: number | null;
  /** Posição do ganhador em `corredores` (só depois da largada). */
  vencedor: number | null;
  /** Relógio do servidor (ms), para todas as telas largarem juntas. */
  agora: number;
}

/** A participação da conta logada. */
export interface MinhaParticipacao {
  id: string;
  nome: string;
  characterId: string | null;
  /** Foto enviada que corre (quando não é um influencer). */
  fotoKey: string | null;
}

/** O que o ganhador recebeu (no Pix: o que falta para pagar e quando foi pago). */
export type Entrega =
  | { tipo: "plano"; plano: PlanoPago; ate: string }
  /** `plano`: o prêmio era um plano e o ganhador já pagava um (virou créditos). */
  | { tipo: "creditos"; creditos: number; plano?: PlanoPago }
  | { tipo: "pontos"; pontos: number }
  | { tipo: "pix"; centavos: number; chave?: string; titular?: string; informadoEm?: string; pagoEm?: string };

const num = (n: number) => n.toLocaleString("pt-BR");
export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O prêmio em português (servidor, admin e avisos). */
export function nomePremio(p: Premio): string {
  if (p.tipo === "plano") return `Plano ${PLANOS[p.plano].nome} · ${p.meses} ${p.meses === 1 ? "mês" : "meses"}`;
  if (p.tipo === "creditos") return `${num(p.quantidade)} créditos`;
  if (p.tipo === "pontos") return `${num(p.quantidade)} pontos`;
  return `${reais(p.centavos)} no Pix`;
}

/** Quem já tem plano pago ganha os créditos do plano sorteado (sem mexer na assinatura). */
export const creditosDoPresente = (plano: PlanoPago, meses: number) => PLANOS[plano].creditos * meses;

const CORES = ["#ff4d6d", "#ffb703", "#3a86ff", "#06d6a0", "#b5179e", "#fb5607", "#8338ec", "#2ec4b6", "#e63946", "#90be6d", "#f72585", "#4cc9f0"];

/** Cor da camiseta, sempre a mesma para o mesmo participante. */
export function corDoCorredor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

/** Nome na corrida: sem quebras nem espaços sobrando, de 2 a 24 letras. */
export function limparNome(nome: string): string | null {
  const n = nome.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return n.length >= 2 && n.length <= 24 ? n : null;
}

/** Chave Pix como a pessoa digitou, sem espaços nas pontas; de 3 a 120 letras. */
export function limparChavePix(chave: string): string | null {
  const c = chave.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return c.length >= 3 && c.length <= 120 ? c : null;
}
