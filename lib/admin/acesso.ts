import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";

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
  if (!sessao || !ehAdmin(email)) return null;
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
