import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { SO_ADMIN, type RecursoEmTeste } from "@/lib/em-teste";

/**
 * Quem pode abrir a área admin (/app/admin e /api/admin/*).
 * Padrão: os dois donos do projeto. Para mudar sem mexer no código, defina
 * ADMIN_EMAILS no ambiente (e-mails separados por vírgula).
 */
const PADRAO = ["dollarweb3@gmail.com", "tavanoalexandre56@gmail.com"];

export function emailsAdmin(): string[] {
  const env = process.env.ADMIN_EMAILS?.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return env?.length ? env : PADRAO;
}

export const ehAdmin = (email: string | null | undefined): boolean =>
  !!email && emailsAdmin().includes(email.trim().toLowerCase());

export interface Admin {
  userId: string;
  email: string;
}

/** Sessão atual, se for de um admin com e-mail verificado pelo login (Google). */
export async function adminAtual(): Promise<Admin | null> {
  const sessao = await getAuth()?.api.getSession({ headers: await headers() });
  const email = sessao?.user.email;
  // E-mail não verificado não vale: se um dia existir cadastro por senha,
  // ninguém vira admin só por digitar o e-mail de um.
  if (!sessao || !sessao.user.emailVerified || !ehAdmin(email)) return null;
  return { userId: sessao.user.id, email: email!.toLowerCase() };
}

/**
 * Para as rotas /api/admin/*: devolve o admin ou a resposta de recusa.
 * Responde 404 (não 403) para não revelar que a área existe.
 */
export async function adminOuResponder(): Promise<Admin | NextResponse> {
  const admin = await adminAtual();
  return (
    admin ?? NextResponse.json({ error: "Não encontrado." }, { status: 404 })
  );
}

/**
 * Recurso em teste (lib/em-teste.ts): só admin usa. Devolve a recusa pronta,
 * ou null se a sessão atual pode usar. 404 para não revelar que existe.
 */
export async function liberadoOuResponder(
  recurso: RecursoEmTeste,
): Promise<NextResponse | null> {
  if (!SO_ADMIN[recurso] || (await adminAtual())) return null;
  return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
}

/** O mesmo, por id de usuário — para quem não vem com sessão (token do MCP). */
export async function usuarioLiberado(
  recurso: RecursoEmTeste,
  userId: string,
): Promise<boolean> {
  if (!SO_ADMIN[recurso]) return true;
  const pool = getPool();
  if (!pool) return false;
  const { rows } = await pool.query<{ email: string; v: boolean }>(
    'select email, "emailVerified" as v from "user" where id = $1',
    [userId],
  );
  return !!rows[0]?.v && ehAdmin(rows[0].email);
}
