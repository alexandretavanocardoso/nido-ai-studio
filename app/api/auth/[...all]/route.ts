import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * Todas as rotas do Better Auth (login Google, callback OAuth, sessão,
 * logout) passam por aqui. Sem auth configurado, responde 404.
 */
function handler(method: "GET" | "POST") {
  return async (req: Request) => {
    const auth = getAuth();
    if (!auth) return new Response("Auth não configurado.", { status: 404 });
    return toNextJsHandler(auth)[method](req);
  };
}

export const GET = handler("GET");
export const POST = handler("POST");
