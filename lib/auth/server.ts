import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { soAdminAgora } from "@/lib/admin/em-teste-server";
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
    // Login fechado pelo admin (área admin → "Em teste" → Login de usuários):
    // só contas admin abrem sessão. Vale para qualquer forma de entrar, porque
    // barra na criação da sessão.
    databaseHooks: {
      session: {
        create: {
          before: async (sessao) => {
            if (!(await soAdminAgora("login"))) return;
            const { rows } = await pool.query<{ email: string; v: boolean }>(
              'select email, "emailVerified" as v from "user" where id = $1',
              [sessao.userId],
            );
            // Importado aqui: lib/admin/acesso.ts importa este arquivo.
            const { ehAdmin } = await import("@/lib/admin/acesso");
            if (rows[0]?.v && ehAdmin(rows[0].email)) return;
            throw new APIError("FORBIDDEN", {
              message: "O acesso ao app está fechado no momento.",
            });
          },
        },
      },
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
