import { hit, readIp } from "@/lib/ai/rate-limit";
import { usuarioLiberado } from "@/lib/admin/acesso";
import { getPool } from "@/lib/db";
import {
  clientePorId,
  CORS,
  criarTokenDoConector,
  erroOAuth,
  gastarCodigo,
  pkceConfere,
} from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trocas por minuto de um mesmo endereço IP. */
const POR_MINUTO = 30;

/**
 * POST — troca o código de autorização pelo token (RFC 6749 §4.1.3, com PKCE).
 * O token é um token de API da conta, sem prazo: vale até o usuário revogar em
 * Conta → Claude e ChatGPT (MCP) ou autorizar o mesmo conector de novo.
 */
export async function POST(req: Request) {
  if (!getPool())
    return erroOAuth("server_error", "OAuth is not configured on this server.", 503);
  const gate = await hit(`oauth-token:${readIp(req)}`, POR_MINUTO, 60);
  if (!gate.ok) return erroOAuth("slow_down", "Too many requests.", 429);

  // O padrão é formulário; aceita JSON também.
  const tipo = req.headers.get("content-type") ?? "";
  const dados: Record<string, unknown> = tipo.includes("application/json")
    ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
    : Object.fromEntries(new URLSearchParams(await req.text().catch(() => "")));

  if (dados.grant_type !== "authorization_code")
    return erroOAuth(
      "unsupported_grant_type",
      "Only authorization_code is supported.",
    );
  const cliente = await clientePorId(dados.client_id);
  if (!cliente) return erroOAuth("invalid_client", "Unknown client_id.", 401);
  const autorizado = await gastarCodigo({
    codigo: dados.code,
    clientId: cliente.id,
    redirectUri: dados.redirect_uri,
  });
  if (!autorizado || !pkceConfere(dados.code_verifier, autorizado.codeChallenge))
    return erroOAuth(
      "invalid_grant",
      "The authorization code is invalid, expired or already used.",
    );
  if (!(await usuarioLiberado("mcp", autorizado.userId)))
    return erroOAuth("access_denied", "This account is not enabled for MCP.");

  return Response.json(
    {
      access_token: await criarTokenDoConector(autorizado.userId, cliente),
      token_type: "Bearer",
      scope: "mcp",
    },
    { headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
