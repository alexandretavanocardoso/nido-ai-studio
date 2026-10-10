import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";

/**
 * Avisos do sino, guardados na conta (tabela avisos). Quem registra:
 *  - o servidor, quando um vídeo termina ou falha (lib/video/finalizar.ts) —
 *    vale mesmo com o app fechado;
 *  - a tela, para o que só ela sabe que terminou (imagem, texto, figurinha…).
 * A `chave` evita o mesmo aviso duas vezes.
 */
export interface AvisoDaConta {
  id: string;
  rotulo: string;
  erro: boolean;
  href: string | null;
  chave: string | null;
  lida: boolean;
  quando: number;
}

/** Quantos avisos a conta guarda (os mais antigos saem). */
export const MAX_AVISOS = 30;

/** Só caminhos de dentro do app: o aviso nunca leva para outro site. */
export const hrefValido = (h: unknown): h is string =>
  typeof h === "string" && /^\/app(\/|$)/.test(h) && h.length <= 300;

/**
 * Registra um aviso. Nunca lança: um aviso que falha não pode derrubar quem
 * chamou (a finalização de um vídeo, por exemplo). Devolve se criou — false
 * quando já existia um com a mesma chave.
 */
export async function criarAviso(
  userId: string,
  a: { rotulo: string; erro?: boolean; href?: string | null; chave?: string | null },
): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  try {
    const { rowCount } = await pool.query(
      `insert into avisos (id, user_id, rotulo, erro, href, chave)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, chave) do nothing`,
      [
        nanoid(12),
        userId,
        a.rotulo.slice(0, 200),
        !!a.erro,
        hrefValido(a.href) ? a.href : null,
        a.chave ? a.chave.slice(0, 120) : null,
      ],
    );
    if (!rowCount) return false;
    await pool.query(
      `delete from avisos where user_id = $1 and id not in (
         select id from avisos where user_id = $1 order by criado_em desc limit $2
       )`,
      [userId, MAX_AVISOS],
    );
    return true;
  } catch (e) {
    console.warn("[avisos] não consegui registrar:", (e as Error).message);
    return false;
  }
}

export async function listarAvisos(userId: string): Promise<AvisoDaConta[]> {
  const { rows } = await getPool()!.query<{
    id: string;
    rotulo: string;
    erro: boolean;
    href: string | null;
    chave: string | null;
    lida: boolean;
    criado_em: Date;
  }>(
    `select id, rotulo, erro, href, chave, lida, criado_em from avisos
     where user_id = $1 order by criado_em desc limit $2`,
    [userId, MAX_AVISOS],
  );
  return rows.map((r) => ({
    id: r.id,
    rotulo: r.rotulo,
    erro: r.erro,
    href: r.href,
    chave: r.chave,
    lida: r.lida,
    quando: new Date(r.criado_em).getTime(),
  }));
}

export async function marcarAvisosLidos(userId: string): Promise<void> {
  await getPool()!.query(
    "update avisos set lida = true where user_id = $1 and not lida",
    [userId],
  );
}

export async function limparAvisos(userId: string): Promise<void> {
  await getPool()!.query("delete from avisos where user_id = $1", [userId]);
}
