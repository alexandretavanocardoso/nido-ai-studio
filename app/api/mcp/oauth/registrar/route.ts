import { hit, readIp } from "@/lib/ai/rate-limit";
import { getPool } from "@/lib/db";
import { CORS, erroOAuth, registrarCliente } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Registros por hora de um mesmo endereço IP (qualquer um pode chamar). */
const POR_HORA = 20;

/**
 * POST — registro dinâmico de cliente (RFC 7591). O conector do Claude chama
 * sozinho na primeira conexão. Cliente público: não recebe segredo.
 */
export async function POST(req: Request) {
  if (!getPool())
    return erroOAuth("server_error", "OAuth is not configured on this server.", 503);
  const gate = await hit(`oauth-reg:${readIp(req)}`, POR_HORA, 3600);
  if (!gate.ok)
    return erroOAuth("too_many_requests", "Too many registrations. Try again later.", 429);
  const corpo = (await req.json().catch(() => null)) as {
    redirect_uris?: unknown;
    client_name?: unknown;
  } | null;
  const cliente = corpo
    ? await registrarCliente({
        nome: corpo.client_name,
        redirectUris: corpo.redirect_uris,
      })
    : null;
  if (!cliente)
    return erroOAuth(
      "invalid_redirect_uri",
      "redirect_uris must be a list of https URLs (http only for localhost), without fragments.",
    );
  return Response.json(
    {
      client_id: cliente.id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: cliente.nome,
      redirect_uris: cliente.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201, headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
