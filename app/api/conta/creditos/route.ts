import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/server";
import { carregarConta, creditosAtivos } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { usoArmazenamento } from "@/lib/limites";
import { cotaArmazenamentoBytes } from "@/lib/planos";
import { ehAdmin } from "@/lib/admin/acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — plano, saldo e personagens da conta logada (aplica recargas pendentes). */
export async function GET() {
  if (!creditosAtivos()) return NextResponse.json({ ativo: false });
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const conta = await carregarConta(userId);
  const { rows } = await getPool()!.query<{ n: string }>(
    "select count(*) as n from characters where user_id = $1",
    [userId],
  );
  const { rows: eu } = await getPool()!.query<{ email: string }>(
    'select email from "user" where id = $1',
    [userId],
  );
  return NextResponse.json({
    ativo: true,
    // Só para mostrar o link "Admin" no menu; o acesso é checado no servidor.
    admin: ehAdmin(eu[0]?.email),
    plano: conta.plano,
    intervalo: conta.intervalo,
    planoExpiraEm: conta.planoExpiraEm,
    proximaRecargaEm: conta.proximaRecargaEm,
    creditosPlano: conta.creditosPlano,
    creditosAvulsos: conta.creditosAvulsos,
    avulsosExpiraEm: conta.avulsosExpiraEm,
    total: conta.total,
    assinaturaAtiva: !!conta.stripeSubscriptionId,
    personagens: Number(rows[0]?.n ?? 0),
    armazenamento: {
      usadoBytes: await usoArmazenamento(userId).catch(() => 0),
      cotaBytes: cotaArmazenamentoBytes(conta.plano),
    },
  });
}
