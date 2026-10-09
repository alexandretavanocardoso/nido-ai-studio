/**
 * Recursos ainda em teste: por enquanto só as contas admin veem e usam.
 * Para abrir um deles a todos, troque para `false` — a tela e as rotas
 * passam a valer para qualquer conta.
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

/** Na tela: o recurso aparece para esta conta? */
export const liberadoNaTela = (
  recurso: RecursoEmTeste,
  admin: boolean | undefined,
): boolean => !SO_ADMIN[recurso] || !!admin;
