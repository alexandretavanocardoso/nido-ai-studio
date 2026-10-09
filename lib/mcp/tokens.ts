import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";

/**
 * Tokens de API da conta (tabela tokens_api): a identidade de quem se conecta
 * pelo MCP. O token inteiro só existe na resposta de `criarToken`; no banco
 * fica o hash.
 */
export const PREFIXO_TOKEN = "nidoaistudio_";
/** Quantos tokens ativos uma conta pode ter. */
export const MAX_TOKENS = 5;

export interface TokenApi {
  id: string;
  nome: string;
  prefixo: string;
  criadoEm: string;
  ultimoUsoEm: string | null;
}

export const hashDoToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function gerarToken(): string {
  return PREFIXO_TOKEN + randomBytes(24).toString("base64url");
}

/** Token do cabeçalho `Authorization: Bearer nidoaistudio_…` (null se não for um token nosso). */
export function tokenDoCabecalho(authorization: string | null): string | null {
  const m = authorization?.match(/^Bearer\s+(\S+)$/i);
  return m && m[1].startsWith(PREFIXO_TOKEN) && m[1].length >= PREFIXO_TOKEN.length + 24 ? m[1] : null;
}

export async function listarTokens(userId: string): Promise<TokenApi[]> {
  const { rows } = await getPool()!.query(
    `select id, nome, prefixo, created_at, ultimo_uso_em from tokens_api
     where user_id = $1 and revogado_em is null order by created_at desc`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    prefixo: r.prefixo,
    criadoEm: new Date(r.created_at).toISOString(),
    ultimoUsoEm: r.ultimo_uso_em
      ? new Date(r.ultimo_uso_em).toISOString()
      : null,
  }));
}

/** Cria um token. O valor inteiro volta só aqui: não dá para ler de novo depois. */
export async function criarToken(
  userId: string,
  nome: string,
): Promise<{ token: string; item: TokenApi }> {
  const pool = getPool()!;
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from tokens_api where user_id = $1 and revogado_em is null",
    [userId],
  );
  if (rows[0].n >= MAX_TOKENS)
    throw new Error(
      `Você já tem ${MAX_TOKENS} tokens ativos. Revogue um para criar outro.`,
    );
  const token = gerarToken();
  const id = nanoid(12);
  const prefixo = token.slice(0, PREFIXO_TOKEN.length + 4);
  await pool.query(
    "insert into tokens_api (id, user_id, nome, hash, prefixo) values ($1, $2, $3, $4, $5)",
    [id, userId, nome, hashDoToken(token), prefixo],
  );
  return {
    token,
    item: {
      id,
      nome,
      prefixo,
      criadoEm: new Date().toISOString(),
      ultimoUsoEm: null,
    },
  };
}

export async function revogarToken(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool()!.query(
    "update tokens_api set revogado_em = now() where id = $1 and user_id = $2 and revogado_em is null",
    [id, userId],
  );
  return !!rowCount;
}

/** Dono do token (null se não existe ou foi revogado). Anota o último uso. */
export async function usuarioDoToken(
  token: string,
): Promise<{ userId: string; tokenId: string } | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query<{ id: string; user_id: string }>(
    `update tokens_api set ultimo_uso_em = now()
     where hash = $1 and revogado_em is null returning id, user_id`,
    [hashDoToken(token)],
  );
  return rows[0] ? { userId: rows[0].user_id, tokenId: rows[0].id } : null;
}
