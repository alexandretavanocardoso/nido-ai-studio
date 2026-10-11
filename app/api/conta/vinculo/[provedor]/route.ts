import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";
import { ehProvedorVinculo, nomeDaConta } from "@/lib/auth/vinculos";
import { getPool } from "@/lib/db";
import { recursosDisponiveis } from "@/lib/recursos";

export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ provedor: string }> };

const NAO_EXISTE = () =>
  NextResponse.json(
    { error: "Rede desconhecida.", code: "NOT_FOUND" },
    { status: 404 },
  );

/**
 * Conta de outra rede (Discord, LinkedIn, X) vinculada à conta do app (perfil
 * do usuário). O vínculo em si é feito pelo Better Auth (`linkSocial`); aqui
 * se lê o estado (se há conta ligada e com que nome) e se desfaz o vínculo.
 */
export async function GET(_req: Request, { params }: Contexto) {
  const { provedor } = await params;
  if (!ehProvedorVinculo(provedor)) return NAO_EXISTE();
  const auth = getAuth();
  if (!auth || !recursosDisponiveis()[provedor])
    return NextResponse.json({ disponivel: false, vinculado: false });
  const h = await headers();
  const sessao = await auth.api.getSession({ headers: h });
  if (!sessao)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const contas = await auth.api.listUserAccounts({ headers: h });
  const conta = contas.find((c) => c.providerId === provedor);
  if (!conta) return NextResponse.json({ disponivel: true, vinculado: false });
  // O nome vem da rede na hora (a conta guarda só o id). Se o acesso expirou
  // ou a rede não respondeu, o vínculo continua valendo.
  let nome: string | null = null;
  let imagem: string | null = null;
  try {
    const info = await auth.api.accountInfo({
      headers: h,
      query: { accountId: conta.id },
    });
    if (info) {
      nome = nomeDaConta(provedor, info);
      imagem = info.user.image || null;
    }
  } catch (e) {
    console.warn(`[${provedor}] nome da conta:`, (e as Error).message);
  }
  return NextResponse.json({
    disponivel: true,
    vinculado: true,
    id: conta.accountId,
    nome,
    imagem,
  });
}

/**
 * Desvincula a conta da rede. Direto na tabela de contas do login: o
 * `unlinkAccount` do Better Auth exige sessão recém-criada e recusaria quem
 * logou há mais de um dia. Só apaga a conta dessa rede — a do Google (o login)
 * não é uma das redes aceitas aqui e nunca é tocada.
 */
export async function DELETE(_req: Request, { params }: Contexto) {
  const { provedor } = await params;
  if (!ehProvedorVinculo(provedor)) return NAO_EXISTE();
  const auth = getAuth();
  const pool = getPool();
  if (!auth || !pool)
    return NextResponse.json(
      { error: "Banco não configurado.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const sessao = await auth.api.getSession({ headers: await headers() });
  if (!sessao)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  await pool.query(
    `delete from account where "userId" = $1 and "providerId" = $2`,
    [sessao.user.id, provedor],
  );
  return NextResponse.json({ ok: true });
}
