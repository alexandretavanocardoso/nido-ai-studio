/**
 * Redes aceitas para pagar em USDC (vale no cliente e no servidor).
 * Solana usa Solana Pay (ou transferência comum, com o hash colado); as EVM
 * usam transferência ERC-20. Em todas a cobrança tem valor único.
 */
export type RedeUsdc = "solana" | "base" | "ethereum" | "arbitrum" | "bnb";

export interface InfoRedeUsdc {
  id: RedeUsdc;
  nome: string;
  /** Carteiras que leem o QR/link desta rede. */
  carteiras: string;
  evm: boolean;
}

export const REDES_USDC: InfoRedeUsdc[] = [
  {
    id: "solana",
    nome: "Solana",
    carteiras: "Phantom, Solflare, Backpack…",
    evm: false,
  },
  {
    id: "base",
    nome: "Base",
    carteiras: "MetaMask, Coinbase Wallet, Rabby…",
    evm: true,
  },
  {
    id: "arbitrum",
    nome: "Arbitrum",
    carteiras: "MetaMask, Rabby, Trust…",
    evm: true,
  },
  {
    id: "bnb",
    nome: "BNB Chain",
    carteiras: "MetaMask, Trust, Binance Wallet…",
    evm: true,
  },
  {
    id: "ethereum",
    nome: "Ethereum",
    carteiras: "MetaMask, Rabby, Ledger…",
    evm: true,
  },
];

export const ehRedeUsdc = (r: unknown): r is RedeUsdc =>
  REDES_USDC.some((x) => x.id === r);
