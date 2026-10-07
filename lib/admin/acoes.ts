import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import {
  ativarPlano,
  carregarConta,
  creditarAvulsos,
  debitar,
} from "@/lib/creditos";
import { PLANOS, type PlanoId } from "@/lib/planos";
import { aplicarCompra, lerCompra } from "@/lib/pagamentos/aplicar";
import type { Admin } from "./acesso";

/**
 * Ações da área admin. Toda mudança de saldo/plano fica no extrato do usuário
 * (creditos_mov) com `ref = admin:<e-mail>`, para saber quem fez.
 */
const pool = () => getPool()!;
const refDe = (admin: Admin, nota?: string) =>
  `admin:${admin.email}${nota ? ` · ${nota.slice(0, 80)}` : ""}`;

export type PlanoPagoAdmin = Exclude<PlanoId, "gratis">;
export const ehPlanoPago = (p: unknown): p is PlanoPagoAdmin =>
  typeof p === "string" && p !== "gratis" && p in PLANOS;

/** Libera (ou estende) um plano por `meses`, sem cobrança. */
export async function liberarPlano(
  admin: Admin,
  userId: string,
  plano: PlanoPagoAdmin,
  meses: number,
  nota?: string,
) {
  const conta = await carregarConta(userId);
  const ativoIgual =
    conta.plano === plano &&
    conta.planoExpiraEm &&
    new Date(conta.planoExpiraEm) > new Date();
  const ate = ativoIgual ? new Date(conta.planoExpiraEm!) : new Date();
  ate.setMonth(ate.getMonth() + meses);
  await ativarPlano(userId, plano, meses >= 12 ? "anual" : "mensal", ate, {
    ref: refDe(admin, nota),
  });
}

/** Volta a conta para o gratuito agora (zera os créditos do plano; os avulsos ficam). */
export async function removerPlano(
  admin: Admin,
  userId: string,
  nota?: string,
) {
  const conta = await carregarConta(userId);
  if (conta.plano === "gratis") return;
  if (conta.stripeSubscriptionId)
    throw new Error(
      "Este usuário tem assinatura ativa no Stripe — cancele por lá (ou pelo portal) para não cobrar de novo.",
    );
  await pool().query(
    `update creditos_conta set plano = 'gratis', intervalo = null, plano_expira_em = null,
       proxima_recarga_em = null, creditos_plano = 0, updated_at = now() where user_id = $1`,
    [userId],
  );
  await pool().query(
    "insert into creditos_mov (id, user_id, delta, do_plano, do_avulso, motivo, ref) values ($1, $2, $3, $3, 0, 'remocao_plano', $4)",
    [nanoid(14), userId, -conta.creditosPlano, refDe(admin, nota)],
  );
}

/** Soma (avulsos, valem 12 meses) ou tira créditos. Tirar mais do que o saldo dá erro. */
export async function ajustarCreditos(
  admin: Admin,
  userId: string,
  quantidade: number,
  nota?: string,
) {
  if (quantidade > 0)
    return creditarAvulsos(
      userId,
      quantidade,
      "ajuste_admin",
      refDe(admin, nota),
    );
  const ok = await debitar(
    userId,
    -quantidade,
    "ajuste_admin",
    refDe(admin, nota),
  );
  if (!ok)
    throw new Error("O usuário não tem saldo suficiente para essa retirada.");
}

/**
 * Aprova à mão um pagamento pendente/expirado (ex.: USDC pago fora do fluxo)
 * e aplica a compra — uma vez só.
 */
export async function aprovarPagamento(admin: Admin, id: string) {
  const { rows } = await pool().query(
    `update pagamentos set status = 'pago', pago_em = now(),
       assinatura = coalesce(assinatura, $2)
     where id = $1 and status in ('pendente', 'expirado')
     returning user_id, provedor, tipo, plano, intervalo, pacote, creditos`,
    [id, `manual:${admin.email}:${id}`],
  );
  const p = rows[0];
  if (!p) throw new Error("Este pagamento não está mais pendente.");
  const compra = lerCompra(p);
  if (!compra)
    throw new Error("Não consegui ler o que foi comprado neste pagamento.");
  await aplicarCompra(p.user_id, compra, {
    ref: id,
    usdc: p.provedor === "usdc",
  });
}

/** Encerra uma cobrança pendente (não mexe em saldo). */
export async function expirarPagamento(id: string) {
  const { rowCount } = await pool().query(
    "update pagamentos set status = 'expirado' where id = $1 and status = 'pendente'",
    [id],
  );
  if (!rowCount) throw new Error("Este pagamento não está pendente.");
}
