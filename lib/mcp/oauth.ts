import { createHash, randomBytes } from "node:crypto";
import { getPool } from "@/lib/db";
import { gerarToken, hashDoToken, PREFIXO_TOKEN } from "./tokens";
import { nanoid } from "nanoid";

/**
 * Login por OAuth 2.1 no servidor MCP — o que o "conector personalizado" do
 * Claude (claude.ai → Conectores), o do ChatGPT (modo de desenvolvedor) e o
 * `codex mcp login` usam para se conectar a /api/mcp (escrito abaixo com o
 * Claude de exemplo; os outros seguem os mesmos passos):
 *
 *  1. o Claude chama /api/mcp sem token e recebe 401 com o endereço dos dados
 *     do recurso (/.well-known/oauth-protected-resource);
 *  2. descobre os endereços abaixo em /.well-known/oauth-authorization-server;
 *  3. registra-se sozinho como cliente (registro dinâmico) — cliente público,
 *     sem segredo;
 *  4. abre a tela de autorização no navegador do usuário, que precisa estar
 *     logado no app e clicar em "Permitir";
 *  5. troca o código recebido (com PKCE) por um token de API da conta.
 *
 * O token entregue é um token comum de tokens_api: aparece na lista de tokens
 * do usuário, que pode revogá-lo quando quiser.
 */
export const CAMINHOS = {
  recurso: "/api/mcp",
  dadosDoRecurso: "/.well-known/oauth-protected-resource",
  autorizar: "/api/mcp/oauth/autorizar",
  token: "/api/mcp/oauth/token",
  registrar: "/api/mcp/oauth/registrar",
  /** Tela em que o usuário permite ou recusa. */
  telaDeAutorizacao: "/auth/autorizar",
} as const;

/** Validade do código de autorização. */
const CODIGO_SEGUNDOS = 300;
const MAX_REDIRECTS = 8;

/** Endereço público do app (o que o Claude enxerga), sem barra no fim. */
export function origemPublica(req: Request): string {
  const env = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, "");
  return env && /^https?:\/\//.test(env) ? env : new URL(req.url).origin;
}

/** Dados do recurso protegido (RFC 9728). */
export function dadosDoRecurso(origem: string) {
  return {
    resource: `${origem}${CAMINHOS.recurso}`,
    authorization_servers: [origem],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  };
}

/** Dados do servidor de autorização (RFC 8414). */
export function dadosDoServidor(origem: string) {
  return {
    issuer: origem,
    authorization_endpoint: `${origem}${CAMINHOS.autorizar}`,
    token_endpoint: `${origem}${CAMINHOS.token}`,
    registration_endpoint: `${origem}${CAMINHOS.registrar}`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

/**
 * Um endereço de retorno aceitável: https em qualquer lugar, ou http só na
 * própria máquina (clientes de terminal). Sem fragmento. O código de
 * autorização vai para lá — por isso nada de http na rede.
 */
export function redirectValido(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 400) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  return (
    u.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  );
}

/** PKCE: o verificador enviado na troca bate com o desafio (S256) do pedido? */
export function pkceConfere(verificador: unknown, desafio: string): boolean {
  if (typeof verificador !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verificador))
    return false;
  return createHash("sha256").update(verificador).digest("base64url") === desafio;
}

/** Um desafio PKCE S256 tem sempre 43 caracteres base64url. */
export const desafioValido = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);

export interface ClienteOAuth {
  id: string;
  nome: string;
  redirectUris: string[];
}

/** Registra um cliente (o Claude faz isso sozinho na primeira conexão). */
export async function registrarCliente(dados: {
  nome: unknown;
  redirectUris: unknown;
}): Promise<ClienteOAuth | null> {
  const uris = Array.isArray(dados.redirectUris) ? dados.redirectUris : [];
  if (!uris.length || uris.length > MAX_REDIRECTS || !uris.every(redirectValido))
    return null;
  const nome =
    (typeof dados.nome === "string" ? dados.nome : "")
      .replace(/[\u0000-\u001f<>]/g, "")
      .trim()
      .slice(0, 60) || "Cliente MCP";
  const cliente: ClienteOAuth = {
    id: `nido_${nanoid(24)}`,
    nome,
    redirectUris: uris,
  };
  await getPool()!.query(
    "insert into oauth_clientes (id, nome, redirect_uris) values ($1, $2, $3)",
    [cliente.id, cliente.nome, JSON.stringify(cliente.redirectUris)],
  );
  return cliente;
}

export async function clientePorId(id: unknown): Promise<ClienteOAuth | null> {
  const pool = getPool();
  if (!pool || typeof id !== "string" || !id || id.length > 80) return null;
  const { rows } = await pool.query<{
    id: string;
    nome: string;
    redirect_uris: string[];
  }>("select id, nome, redirect_uris from oauth_clientes where id = $1", [id]);
  return rows[0]
    ? { id: rows[0].id, nome: rows[0].nome, redirectUris: rows[0].redirect_uris }
    : null;
}

/** O endereço de retorno tem que ser EXATAMENTE um dos que o cliente registrou. */
export const redirectDoCliente = (c: ClienteOAuth, uri: unknown): uri is string =>
  typeof uri === "string" && c.redirectUris.includes(uri);

/** Cria o código de autorização (devolve o valor; no banco fica só o hash). */
export async function criarCodigo(o: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const codigo = randomBytes(32).toString("base64url");
  const pool = getPool()!;
  // Aproveita para limpar os vencidos: a tabela não cresce sem parar.
  await pool.query("delete from oauth_codigos where expires_at < now() - interval '1 day'");
  await pool.query(
    `insert into oauth_codigos (hash, client_id, user_id, redirect_uri, code_challenge, expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [hashDoToken(codigo), o.clientId, o.userId, o.redirectUri, o.codeChallenge, CODIGO_SEGUNDOS],
  );
  return codigo;
}

/**
 * Gasta o código (vale uma vez só) e devolve o que foi autorizado. Null se o
 * código não existe, venceu, já foi usado ou é de outro cliente ou endereço.
 */
export async function gastarCodigo(o: {
  codigo: unknown;
  clientId: unknown;
  redirectUri: unknown;
}): Promise<{ userId: string; clientId: string; codeChallenge: string } | null> {
  if (typeof o.codigo !== "string" || o.codigo.length > 200) return null;
  const { rows } = await getPool()!.query<{
    user_id: string;
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
  }>(
    `update oauth_codigos set usado_em = now()
     where hash = $1 and usado_em is null and expires_at > now()
     returning user_id, client_id, redirect_uri, code_challenge`,
    [hashDoToken(o.codigo)],
  );
  const r = rows[0];
  // Depois de marcado como usado, um código apresentado pelo cliente errado
  // fica inutilizado — é o comportamento certo para um código vazado.
  if (!r || r.client_id !== o.clientId || r.redirect_uri !== o.redirectUri)
    return null;
  return { userId: r.user_id, clientId: r.client_id, codeChallenge: r.code_challenge };
}

/**
 * Token de API para um conector autorizado. Entra em tokens_api como os
 * criados à mão (o usuário vê e revoga na mesma lista), mas não conta no
 * limite de tokens manuais: um token por conector — autorizar de novo o mesmo
 * conector troca o token anterior dele.
 */
export async function criarTokenDoConector(
  userId: string,
  cliente: ClienteOAuth,
): Promise<string> {
  const pool = getPool()!;
  const nome = `Conector: ${cliente.nome}`.slice(0, 60);
  await pool.query(
    "update tokens_api set revogado_em = now() where user_id = $1 and nome = $2 and revogado_em is null",
    [userId, nome],
  );
  const token = gerarToken();
  await pool.query(
    "insert into tokens_api (id, user_id, nome, hash, prefixo) values ($1, $2, $3, $4, $5)",
    [nanoid(12), userId, nome, hashDoToken(token), token.slice(0, PREFIXO_TOKEN.length + 4)],
  );
  return token;
}

/** Resposta de erro no formato do OAuth (RFC 6749 §5.2). */
export function erroOAuth(codigo: string, descricao: string, status = 400): Response {
  // A chave vai numa variável: o corpo é do protocolo (em inglês), não uma
  // mensagem do app para traduzir.
  const chave = "error";
  return Response.json(
    { [chave]: codigo, error_description: descricao },
    { status, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

/** Estes endereços são chamados por clientes de qualquer origem (sem cookies). */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
} as const;
