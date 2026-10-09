import { CORS, dadosDoRecurso, origemPublica } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/**
 * GET — o mesmo documento de /.well-known/oauth-protected-resource, no endereço
 * com o caminho do recurso no fim (RFC 9728 §3.1): alguns clientes procuram
 * aqui primeiro.
 */
export function GET(req: Request) {
  return Response.json(dadosDoRecurso(origemPublica(req)), { headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
