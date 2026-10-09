import { NextResponse } from "next/server";
import { usuarioLiberado } from "@/lib/admin/acesso";
import { getUserId } from "@/lib/auth/server";
import {
  clientePorId,
  criarCodigo,
  desafioValido,
  origemPublica,
  redirectDoCliente,
} from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const invalido = (status = 400) =>
  NextResponse.json(
    { error: "Pedido de conexão inválido. Tente conectar de novo." },
    { status },
  );

/** GET — nome do aplicativo que está pedindo acesso (para a tela de autorização). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const cliente = await clientePorId(p.get("client_id"));
  const retorno = p.get("redirect_uri");
  if (!cliente || !redirectDoCliente(cliente, retorno)) return invalido();
  return NextResponse.json({
    nome: cliente.nome,
    destino: new URL(retorno).host,
  });
}

/**
 * POST — o usuário, logado, permitiu ou recusou. Devolve para onde o navegador
 * deve ir: o endereço de retorno do cliente, com o código (ou com a recusa).
 */
export async function POST(req: Request) {
  // Só a própria tela do app pode chamar: um site de fora não consegue
  // "clicar em Permitir" pelo usuário.
  const origem = req.headers.get("origin");
  if (!origem || origem !== origemPublica(req)) return invalido(403);
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const corpo = (await req.json().catch(() => null)) as {
    client_id?: unknown;
    redirect_uri?: unknown;
    code_challenge?: unknown;
    state?: unknown;
    permitir?: unknown;
  } | null;
  const cliente = await clientePorId(corpo?.client_id);
  const redirectUri = corpo?.redirect_uri;
  if (!corpo || !cliente || !redirectDoCliente(cliente, redirectUri))
    return invalido();
  const retorno = new URL(redirectUri);
  if (typeof corpo.state === "string" && corpo.state)
    retorno.searchParams.set("state", corpo.state.slice(0, 500));

  if (corpo.permitir !== true) {
    retorno.searchParams.set("error", "access_denied");
    return NextResponse.json({ ir: retorno.toString() });
  }
  if (!(await usuarioLiberado("mcp", userId)))
    return NextResponse.json(
      {
        error:
          "A conexão com o Claude ainda não está liberada para esta conta.",
      },
      { status: 403 },
    );
  const desafio = corpo.code_challenge;
  if (!desafioValido(desafio)) return invalido();
  retorno.searchParams.set(
    "code",
    await criarCodigo({
      clientId: cliente.id,
      userId,
      redirectUri,
      codeChallenge: desafio,
    }),
  );
  return NextResponse.json({ ir: retorno.toString() });
}
