import { CORS, dadosDoServidor, origemPublica } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/**
 * GET — dados do servidor de autorização (RFC 8414): onde autorizar, onde
 * trocar o código pelo token e onde o cliente se registra.
 */
export function GET(req: Request) {
  return Response.json(dadosDoServidor(origemPublica(req)), { headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
