/**
 * Recursos ainda em teste: enquanto estiverem "só admin", só as contas admin
 * veem e usam. Quem liga e desliga é o admin, na área admin → aba "Em teste"
 * (o estado fica no banco, tabela recursos_em_teste — ver
 * lib/admin/em-teste-server.ts). Os valores aqui são o PADRÃO: valem enquanto
 * ninguém mudou o recurso pela tela, ou se o banco não responder.
 *
 * A tela usa isto para esconder; quem barra de verdade é o servidor
 * (lib/admin/acesso.ts → liberadoOuResponder / usuarioLiberado).
 */
export const SO_ADMIN = {
  /** Conta → Claude e ChatGPT (MCP): tokens de API e o servidor /api/mcp. */
  mcp: true,
  /** Indique e ganhe: link, comissões e saques. */
  indicacoes: true,
  /** Comprar plano e créditos pelo Stripe (o USDC segue aberto). */
  stripe: true,
  /** NFT do influencer na Solana: vincular carteira, mintar e badges (lib/nft). */
  nft: true,
  /** Pontos: o indicador da barra, o check-in diário e a página de pontos (lib/pontos.ts). */
  pontos: true,
  /** Live: o personagem ao vivo, respondendo o chat com avatar em tempo real (lib/live). */
  live: true,
  /** Vídeo de produto: o influencer mostrando e usando um produto, até 60s (lib/produto.ts). */
  video_produto: true,
  /** Motion: a IA escreve uma animação do site, produto ou influencer (lib/motion.ts, worker/motion). */
  motion: true,
  /**
   * Entrar no app. Aberto por padrão; fechado, só as contas admin conseguem
   * entrar (ver o hook de sessão em lib/auth/server.ts).
   */
  login: false,
} as const;

export type RecursoEmTeste = keyof typeof SO_ADMIN;

/** Estado de cada recurso: true = só admin · false = liberado para todos. */
export type EstadoEmTeste = Record<RecursoEmTeste, boolean>;

export const RECURSOS_EM_TESTE = Object.keys(SO_ADMIN) as RecursoEmTeste[];

/** O que cada recurso é, para a aba "Em teste" da área admin. */
export const SOBRE_O_RECURSO: Record<
  RecursoEmTeste,
  {
    titulo: string;
    descricao: string;
    /** O que acontece ao fechar, quando é mais do que "só admin vê" (aviso da confirmação). */
    aoFechar?: string;
  }
> = {
  mcp: {
    titulo: "Claude e ChatGPT (MCP)",
    descricao:
      "A página Conta → Claude e ChatGPT (MCP), a criação de tokens, o servidor /api/mcp e os conectores do Claude, do ChatGPT e do Codex (login por OAuth). Fechado, quem tenta conectar recebe que ainda não está liberado para a conta.",
  },
  indicacoes: {
    titulo: "Indique e ganhe",
    descricao:
      "A página de indicações, o código de indicação, a conexão com o Stripe para receber e os saques.",
  },
  stripe: {
    titulo: "Pagamento com cartão (Stripe)",
    descricao:
      "Comprar plano e créditos com cartão. Fechado, a página de planos mostra só o pagamento em USDC.",
  },
  nft: {
    titulo: "NFT do influencer (Solana)",
    descricao:
      "Vincular a carteira, mintar o NFT do influencer e os badges (views, curtidas, comentários, reposts, quotes e salvos), na aba NFT do personagem (ao lado do Radar). Fechado, só as contas admin veem e mintam; os NFTs já mintados continuam existindo e os badges deles seguem sendo gravados.",
  },
  pontos: {
    titulo: "Pontos e check-in diário",
    descricao:
      "O indicador de pontos na barra do topo, o check-in diário e a página de pontos. Fechado, só as contas admin veem e fazem check-in; os pontos de créditos gastos, primeiros passos, posts e indicação já contam para todas as contas e aparecem quando você liberar.",
  },
  live: {
    titulo: "Live do personagem",
    descricao:
      "A página Estúdio → Live: o personagem entra ao vivo com o avatar em tempo real (Runway + LiveKit), responde o chat com a voz dele e vira uma fonte para o OBS. Fechado, só as contas admin veem e entram no ar.",
  },
  video_produto: {
    titulo: "Vídeo de produto",
    descricao:
      "A página Estúdio → Produto: o influencer (um personagem ou uma foto) mostrando e usando um produto, com ou sem fala, em vídeos de até 60s. Cobra créditos como os outros vídeos. Fechado, só as contas admin veem e geram.",
  },
  motion: {
    titulo: "Motion",
    descricao:
      "A página Estúdio → Motion: a IA escreve uma animação (motion graphics) do site, do produto ou do influencer, com ajustes, música e MP4. Cobra a estimativa em créditos ao pedir e acerta pelo custo real quando fica pronto (devolve tudo se falhar). Precisa do worker/motion ligado no Railway. Fechado, só as contas admin veem e geram.",
  },
  login: {
    titulo: "Login de usuários",
    descricao:
      "Entrar no app com o Google. Fechado, só as contas admin conseguem entrar: os outros usuários são desconectados na hora e não entram de novo até você liberar. As contas, os personagens e os créditos deles continuam guardados.",
    aoFechar:
      "Todos os usuários que não são admin são desconectados AGORA e não conseguem mais entrar até você liberar de novo. Nada é apagado: contas, personagens e créditos continuam guardados. Vídeos já em geração terminam normalmente.",
  },
};

/**
 * Na tela: o recurso aparece para esta conta? `conta` é a conta carregada
 * (ou nada, enquanto carrega); `emTeste` vem do servidor com o estado atual.
 */
export const liberadoNaTela = (
  recurso: RecursoEmTeste,
  conta: { admin?: boolean; emTeste?: Partial<EstadoEmTeste> } | null | undefined,
): boolean => !(conta?.emTeste?.[recurso] ?? SO_ADMIN[recurso]) || !!conta?.admin;
