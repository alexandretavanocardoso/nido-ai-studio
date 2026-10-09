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
      // Discord: só para vincular à conta (perfil). O login continua sendo
      // pelo Google: ninguém cria conta pelo Discord.
      ...(recursosDisponiveis().discord
        ? {
            discord: {
              clientId: process.env.DISCORD_CLIENT_ID ?? "",
              clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
              disableSignUp: true,
            },
          }
        : {}),
    },
    account: {
      accountLinking: {
        enabled: true,
        // O vínculo só acontece quando o usuário, logado, pede (linkSocial):
        // nunca sozinho porque o e-mail de outra rede é igual.
        disableImplicitLinking: true,
        // O e-mail do Discord costuma ser outro que não o do Google.
        allowDifferentEmails: true,
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
