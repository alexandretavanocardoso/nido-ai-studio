/**
 * O que a tela e o servidor compartilham sobre o NFT do influencer: nomes das
 * carteiras aceitas e o formato das respostas de /api/nft/*.
 */

import type { MetricaBadge, Totais } from "./badges";
import type { ResumoDosPosts } from "./views";

/** Carteiras aceitas (pelo nome que a extensão anuncia). */
export const CARTEIRAS_ACEITAS = [
  "Phantom",
  "Solflare",
  "Backpack",
  "MetaMask",
] as const;

/**
 * Torneira oficial de SOL de teste. Só aparece enquanto o NFT está em devnet:
 * serve para abastecer a chave de mint (quem paga as taxas) e carteiras de teste.
 */
export const FAUCET_DEVNET = "https://faucet.solana.com";

/** "7xKX…gAsU" */
export function abreviarEndereco(e: string): string {
  return e.length > 12 ? `${e.slice(0, 4)}…${e.slice(-4)}` : e;
}

export type StatusMint = "preparando" | "enviado" | "confirmado" | "falhou";

export interface MintDoPersonagem {
  id: string;
  status: StatusMint;
  /** Rede em que o NFT foi mintado. */
  rede: "devnet" | "mainnet";
  /** Endereço do NFT. */
  asset: string;
  /** Carteira dona do NFT. */
  carteira: string;
  assinatura: string | null;
  erro: string | null;
  linkAsset: string;
  linkTransacao: string | null;
  criadoEm: string;
  /** Muda quando a imagem do NFT é trocada (para o navegador buscar a nova). */
  imagemVersao: number;
}

export interface BadgeDoPersonagem {
  id: string;
  /** Métrica do badge (views, curtidas…). */
  metrica: MetricaBadge;
  nome: string;
  nomeEn: string;
  /** Nome curto, igual em todos os idiomas ("5K", "1M"). */
  rotulo: string;
  limite: number;
  /**
   * conquistado = vale (e vai para o NFT) · aguardando = marca alta, esperando
   * aprovação · bloqueado = ainda não bateu a marca.
   */
  status: "conquistado" | "aguardando" | "bloqueado";
  /** Quando foi conquistado. */
  em: string | null;
  /** Já está gravado no NFT? */
  naRede: boolean;
}

/** GET /api/nft/personagem/[characterId] */
export interface EstadoNft {
  rede: "devnet" | "mainnet";
  /** Créditos que o mint custa. */
  custo: number;
  /** Motivo pelo qual o plano não deixa mintar (null = deixa). */
  bloqueio: string | null;
  /** Carteira vinculada à conta (null = nenhuma). */
  carteira: string | null;
  /**
   * Saldo dessa carteira nesta rede, em SOL (null = sem carteira, ou a rede não
   * respondeu). Só informação: o mint não gasta SOL de quem minta.
   */
  saldoSol: number | null;
  /**
   * O mint está funcionando agora? false = a chave que paga a taxa da rede está
   * sem saldo, e o pedido seria recusado antes de cobrar.
   */
  mintDisponivel: boolean;
  mint: MintDoPersonagem | null;
  /** Total acumulado de views que conta para os badges. */
  views: number;
  /** Total acumulado de cada métrica que conta para os badges. */
  totais: Totais;
  /** O que ficou de fora da conta e a conta do influencer em cada rede (null = ainda não conferido). */
  resumo: ResumoDosPosts | null;
  /** O app está lendo na rede o autor de posts por link (os números sobem em instantes). */
  lendoAutores: boolean;
  /** Posts por link cuja leitura do autor falhou há pouco e será tentada de novo em minutos. */
  autoresDepois: number;
  badges: BadgeDoPersonagem[];
}
