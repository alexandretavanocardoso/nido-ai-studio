import { betterAuth } from "better-auth";
import { headers } from "next/headers";
import { getPool } from "@/lib/db";
import { recursosDisponiveis } from "@/lib/recursos";
import { usuarioDoContexto } from "./contexto";

function createAuth() {
  const pool = getPool();
  if (!recursosDisponiveis().login || !pool) return null;
  return betterAuth({
    database: pool,
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
  });
}

let cached: ReturnType<typeof createAuth> | undefined;

/** Instância do Better Auth, ou null se o deploy estiver no modo anônimo. */
export function getAuth() {
  if (cached === undefined) cached = createAuth();
  return cached;
}

/** id do usuário logado na request atual (Route Handlers), ou null. */
export async function getUserId(): Promise<string | null> {
  // MCP: o token de API já foi validado e a rota roda em nome do dono dele.
  const doContexto = usuarioDoContexto();
  if (doContexto) return doContexto;
  const auth = getAuth();
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}
