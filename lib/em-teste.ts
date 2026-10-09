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
  /** Conta → Claude Code (MCP): tokens de API e o servidor /api/mcp. */
  mcp: true,
  /** Indique e ganhe: link, comissões e saques. */
  indicacoes: true,
  /** Comprar plano e créditos pelo Stripe (o USDC segue aberto). */
  stripe: true,
} as const;

export type RecursoEmTeste = keyof typeof SO_ADMIN;

/** Estado de cada recurso: true = só admin · false = liberado para todos. */
export type EstadoEmTeste = Record<RecursoEmTeste, boolean>;

export const RECURSOS_EM_TESTE = Object.keys(SO_ADMIN) as RecursoEmTeste[];

/** O que cada recurso é, para a aba "Em teste" da área admin. */
export const SOBRE_O_RECURSO: Record<
  RecursoEmTeste,
  { titulo: string; descricao: string }
> = {
  mcp: {
    titulo: "Claude Code (MCP)",
    descricao:
      "A página Conta → Claude Code (MCP), a criação de tokens, o servidor /api/mcp e o conector do Claude (login por OAuth). Fechado, quem tenta conectar recebe que ainda não está liberado para a conta.",
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
};

/**
 * Na tela: o recurso aparece para esta conta? `conta` é a conta carregada
 * (ou nada, enquanto carrega); `emTeste` vem do servidor com o estado atual.
 */
export const liberadoNaTela = (
  recurso: RecursoEmTeste,
  conta: { admin?: boolean; emTeste?: Partial<EstadoEmTeste> } | null | undefined,
): boolean => !(conta?.emTeste?.[recurso] ?? SO_ADMIN[recurso]) || !!conta?.admin;
