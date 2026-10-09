import { NextResponse } from "next/server";
import {
  CAMINHOS,
  clientePorId,
  desafioValido,
  origemPublica,
  redirectDoCliente,
} from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Página simples de erro: aqui NÃO dá para devolver o erro ao cliente. */
const pagina = (texto: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>NIDO AI Studio</title><body style="font-family:system-ui;background:#0b0a0a;color:#f1ece2;display:grid;place-items:center;height:100vh;margin:0"><p style="max-width:420px;text-align:center;line-height:1.5">${texto}</p>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

/**
 * GET — início da autorização (o Claude abre este endereço no navegador do
 * usuário). Confere o cliente e o endereço de retorno e leva à tela em que o
 * usuário, logado, permite ou recusa.
 *
 * Cliente desconhecido ou endereço de retorno que não é dele: o erro fica
 * AQUI, numa página — nunca é enviado para o endereço pedido (seria deixar
 * qualquer um usar o app para redirecionar pessoas).
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const cliente = await clientePorId(p.get("client_id"));
  if (!cliente)
    return pagina(
      "Este pedido de conexão não é válido (aplicativo desconhecido). Tente conectar de novo.",
    );
  const retorno = p.get("redirect_uri");
  if (!redirectDoCliente(cliente, retorno))
    return pagina(
      "Este pedido de conexão não é válido (endereço de retorno diferente do registrado).",
    );

  // Daqui em diante o endereço de retorno é confiável: erros voltam para o cliente.
  const voltarComErro = (codigo: string, descricao: string) => {
    const u = new URL(retorno);
    u.searchParams.set("error", codigo);
    u.searchParams.set("error_description", descricao);
    const estado = p.get("state");
    if (estado) u.searchParams.set("state", estado);
    return NextResponse.redirect(u.toString(), 302);
  };
  if (p.get("response_type") !== "code")
    return voltarComErro(
      "unsupported_response_type",
      "Only response_type=code is supported.",
    );
  if (
    (p.get("code_challenge_method") ?? "") !== "S256" ||
    !desafioValido(p.get("code_challenge"))
  )
    return voltarComErro(
      "invalid_request",
      "PKCE with code_challenge_method=S256 is required.",
    );

  const tela = new URL(`${origemPublica(req)}${CAMINHOS.telaDeAutorizacao}`);
  for (const k of ["client_id", "redirect_uri", "code_challenge", "state"]) {
    const v = p.get(k);
    if (v) tela.searchParams.set(k, v);
  }
  return NextResponse.redirect(tela.toString(), 302);
}
