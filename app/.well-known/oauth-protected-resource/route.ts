import { CORS, dadosDoRecurso, origemPublica } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/**
 * GET — dados do recurso protegido (RFC 9728): diz ao cliente MCP qual servidor
 * de autorização emite os tokens de /api/mcp. É o primeiro endereço que o
 * conector do Claude consulta depois do 401.
 */
export function GET(req: Request) {
  return Response.json(dadosDoRecurso(origemPublica(req)), { headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
