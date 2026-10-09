import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Usuário em nome de quem o código está rodando quando a request não vem com
 * a sessão do navegador: é o caso do MCP (/api/mcp), que se identifica por
 * token de API e chama as mesmas rotas que a tela usa. `getUserId()` olha
 * aqui antes de procurar a sessão.
 *
 * Só quem já validou o token chama `comoUsuario` — nenhuma outra rota aceita
 * token: fora daqui, a identidade continua vindo só do cookie de sessão.
 */
const atual = new AsyncLocalStorage<string>();

export function comoUsuario<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return atual.run(userId, fn);
}

export function usuarioDoContexto(): string | null {
  return atual.getStore() ?? null;
}
