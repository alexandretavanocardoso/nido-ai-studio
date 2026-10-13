/**
 * Carteira cripto conectada no navegador, usada para pagar em USDC. Não é o
 * vínculo da carteira à conta (o do NFT, em lib/nft): conectar não assina
 * nada, só deixa o site ver o endereço e pedir o pagamento.
 */

/** Solana, ou qualquer rede EVM (a mesma carteira vale para Base, Arbitrum, BNB Chain e Ethereum). */
export type Familia = "solana" | "evm";

/** Carteira instalada neste navegador (extensão). */
export interface CarteiraInstalada {
  /** Identifica a carteira entre as instaladas (o nome, na Solana; o rdns, nas EVM). */
  id: string;
  nome: string;
  /** Ícone (data URI); vazio quando a carteira não anuncia um. */
  icone: string;
}
