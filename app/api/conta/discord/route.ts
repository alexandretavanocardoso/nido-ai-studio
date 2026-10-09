import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { recursosDisponiveis } from "@/lib/recursos";

export const dynamic = "force-dynamic";

/**
 * Discord vinculado à conta (perfil do usuário). O vínculo em si é feito pelo
 * Better Auth (`linkSocial`); aqui se lê o estado (se há conta do Discord
 * ligada e com que nome) e se desfaz o vínculo.
 */
export async function GET() {
  const auth = getAuth();
  if (!auth || !recursosDisponiveis().discord)
    return NextResponse.json({ disponivel: false, vinculado: false });
  const h = await headers();
  const sessao = await auth.api.getSession({ headers: h });
  if (!sessao)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const contas = await auth.api.listUserAccounts({ headers: h });
  const conta = contas.find((c) => c.providerId === "discord");
  if (!conta) return NextResponse.json({ disponivel: true, vinculado: false });
  // O nome vem do Discord na hora (a conta guarda só o id). Se o acesso
  // expirou ou o Discord não respondeu, o vínculo continua valendo.
  let nome: string | null = null;
  let imagem: string | null = null;
  try {
    const info = await auth.api.accountInfo({
      headers: h,
      query: { accountId: conta.id },
    });
    nome = info?.user.name?.trim() || null;
    imagem = info?.user.image || null;
  } catch (e) {
    console.warn("[discord] nome da conta:", (e as Error).message);
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
 * Desvincula o Discord. Direto na tabela de contas do login: o `unlinkAccount`
 * do Better Auth exige sessão recém-criada e recusaria quem logou há mais de
 * um dia. Só apaga a conta do Discord — a do Google (o login) não é tocada.
 */
export async function DELETE() {
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
    `delete from account where "userId" = $1 and "providerId" = 'discord'`,
    [sessao.user.id],
  );
  return NextResponse.json({ ok: true });
}
