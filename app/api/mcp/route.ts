import { NextResponse } from "next/server";
import { usuarioLiberado } from "@/lib/admin/acesso";
import { hit } from "@/lib/ai/rate-limit";
import { comoUsuario } from "@/lib/auth/contexto";
import { CAMINHOS, origemPublica } from "@/lib/mcp/oauth";
import { tratarMensagem } from "@/lib/mcp/protocolo";
import { tokenDoCabecalho, usuarioDoToken } from "@/lib/mcp/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Criar um vídeo falado prepara a fala e as imagens antes de responder.
export const maxDuration = 300;

/** Chamadas por minuto de cada token. */
const POR_MINUTO = 60;

/**
 * 401 com o endereço dos dados do recurso (RFC 9728): é por ele que um cliente
 * sem token — o conector do Claude — descobre como fazer o login por OAuth.
 */
const naoAutorizado = (req: Request, mensagem: string) =>
  NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: mensagem } },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer realm="nido-mcp", resource_metadata="${origemPublica(req)}${CAMINHOS.dadosDoRecurso}"`,
      },
    },
  );

/**
 * POST — servidor MCP da conta (Claude Code e outros clientes). Quem conecta
 * se identifica com um token de API da conta — criado em Conta → Claude Code
 * (MCP), ou recebido pelo login por OAuth do conector (lib/mcp/oauth.ts):
 *   Authorization: Bearer nidoaistudio_…
 * As ferramentas rodam como o dono do token, com o plano e os créditos dele.
 */
export async function POST(req: Request) {
  const token = tokenDoCabecalho(req.headers.get("authorization"));
  if (!token)
    return naoAutorizado(
      req,
      "Envie o token de API no cabeçalho Authorization: Bearer nidoaistudio_…",
    );
  const dono = await usuarioDoToken(token);
  if (!dono || !(await usuarioLiberado("mcp", dono.userId)))
    return naoAutorizado(req, "Token inválido ou revogado.");

  const gate = await hit(`mcp:${dono.tokenId}`, POR_MINUTO, 60);
  if (!gate.ok)
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32002,
          message: `Muitas chamadas seguidas. Tente de novo em ${gate.retryAfter}s.`,
        },
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );

  const corpo = await req.json().catch(() => undefined);
  if (corpo === undefined)
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "JSON inválido." },
      },
      { status: 400 },
    );

  const mensagens = Array.isArray(corpo) ? corpo.slice(0, 20) : [corpo];
  const respostas = await comoUsuario(dono.userId, async () => {
    const saida = [];
    // Uma por vez: duas gerações do mesmo lote não disputam a mesma vaga.
    for (const m of mensagens) {
      const r = await tratarMensagem(m, { userId: dono.userId, req });
      if (r) saida.push(r);
    }
    return saida;
  });

  // Só notificações: aceito, sem corpo.
  if (!respostas.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(corpo) ? respostas : respostas[0]);
}

/** Sem stream do servidor para o cliente (opcional no protocolo). */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
