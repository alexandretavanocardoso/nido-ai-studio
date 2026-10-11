import { redesEvmAtivas } from "@/lib/pagamentos/evm";
import type { RedeUsdc } from "@/lib/pagamentos/redes-usdc";

/**
 * Quais recursos este deploy tem — decidido pela presença das chaves no
 * servidor, sem variáveis "ENABLED". Sem a chave de um serviço, a tela
 * esconde o que depende dele e o app segue funcionando no modo manual.
 */
export interface Recursos {
  /** Login com Google + banco (Neon). Sem isso: modo anônimo, só no navegador. */
  login: boolean;
  /** Vincular o Discord à conta (app do Discord configurado). Exige login. */
  discord: boolean;
  /** Arquivos no S3 (imagens e vídeos). Exige login. */
  armazenamento: boolean;
  /** IA de texto (Anthropic): expandir ficha, sugerir campo, regenerar, checar. */
  ia: boolean;
  /** Nano Banana (Gemini). */
  gemini: boolean;
  /** fal.ai: Seedream, Flux.2, GPT Image e troca de pessoa (Kling O3 / Seedance 2.5). */
  fal: boolean;
  /** OpenAI: GPT Image direto na API dela (sem a chave, o GPT Image vai pelo fal). */
  openai: boolean;
  /** Runway: criar vídeo (Gen-4 / Veo). */
  runway: boolean;
  /** Buscar vídeo por link de rede social (Apify). Link direto de .mp4 não precisa. */
  apify: boolean;
  /** Publicar/agendar nas redes (bundle.social). */
  social: boolean;
  /** Voz do personagem (ElevenLabs). */
  voz: boolean;
  /** Radar: incluir o que está em alta no X (Grok, xAI). O radar de notícias só precisa da IA de texto. */
  radarX: boolean;
  /** Pagamento pelo Stripe (cartão, Pix, boleto). */
  stripe: boolean;
  /** Pagamento em USDC (pelo menos uma rede configurada). */
  usdc: boolean;
  /** Redes USDC configuradas: Solana (Solana Pay) e EVM (Base, Arbitrum, BNB Chain, Ethereum). */
  usdcRedes: RedeUsdc[];
  /** NFT do influencer na Solana (coleção e as duas chaves configuradas). Exige login e S3. */
  nft: boolean;
}

const tem = (...nomes: string[]) =>
  nomes.every((n) => !!process.env[n]?.trim());

export function recursosDisponiveis(): Recursos {
  const usdcRedes: RedeUsdc[] = [
    ...(tem("SOLANA_MERCHANT_WALLET") ? (["solana"] as RedeUsdc[]) : []),
    ...redesEvmAtivas(),
  ];
  const login = tem(
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  );
  const armazenamento =
    login &&
    tem("AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET");
  return {
    login,
    discord: login && tem("DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"),
    armazenamento,
    ia: tem("ANTHROPIC_API_KEY"),
    gemini: tem("GEMINI_API_KEY"),
    fal: tem("FAL_KEY"),
    openai: tem("OPENAI_API_KEY"),
    runway: tem("RUNWAYML_API_SECRET"),
    apify: tem("APIFY_TOKEN") || tem("APIFY_API_TOKEN"),
    social: login && (tem("BUNDLE_SOCIAL") || tem("BUNDLE_SOCIAL_API_KEY")),
    voz: tem("ELEVENLABS_API_KEY"),
    radarX: tem("XAI_API_KEY"),
    stripe: login && tem("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"),
    usdc: login && usdcRedes.length > 0,
    usdcRedes: login ? usdcRedes : [],
    nft:
      armazenamento &&
      tem(
        "NFT_REDE",
        "NFT_COLECAO",
        "NFT_MINT_SECRET_KEY",
        "NFT_BADGE_SECRET_KEY",
      ),
  };
}
