import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import {
  assinaturaConfere,
  enderecoDeCarteira,
  montarMensagem,
  VALIDADE_DESAFIO_MIN,
} from "./carteira";
import { baseUrlNft } from "./config";

/**
 * Carteira vinculada à conta (tabelas carteiras / carteira_desafios).
 *
 * O desafio é de uso único, vale poucos minutos e fica preso à conta e ao
 * endereço: uma assinatura antiga, ou feita para outra conta, não serve.
 * Vale a última prova: quem prova a posse de uma carteira que estava em outra
 * conta fica com ela (e a outra conta fica sem carteira).
 */
function pool() {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL não configurada.");
  return p;
}

/** Site que aparece na mensagem assinada (o do endereço público do app). */
function site(): string {
  const base = baseUrlNft();
  try {
    return base ? new URL(base).host : "NIDO AI Studio";
  } catch {
    return "NIDO AI Studio";
  }
}

export async function carteiraDaConta(userId: string): Promise<string | null> {
  const { rows } = await pool().query<{ endereco: string }>(
    "select endereco from carteiras where user_id = $1",
    [userId],
  );
  return rows[0]?.endereco ?? null;
}

export interface Desafio {
  nonce: string;
  mensagem: string;
  expiraEm: string;
}

/** Cria o desafio que a carteira vai assinar. null = endereço que não é de carteira. */
export async function criarDesafio(
  userId: string,
  endereco: string,
): Promise<Desafio | null> {
  const e = endereco.trim();
  if (!enderecoDeCarteira(e)) return null;
  const nonce = nanoid(32);
  const agora = new Date();
  const expira = new Date(agora.getTime() + VALIDADE_DESAFIO_MIN * 60_000);
  const mensagem = montarMensagem({
    site: site(),
    endereco: e,
    nonce,
    emitidoEm: agora,
  });
  const db = pool();
  // Desafios vencidos não servem para nada: saem daqui.
  await db.query(
    "delete from carteira_desafios where expira_em < now() - interval '1 day'",
  );
  await db.query(
    `insert into carteira_desafios (nonce, user_id, endereco, mensagem, expira_em)
     values ($1, $2, $3, $4, $5)`,
    [nonce, userId, e, mensagem, expira],
  );
  return { nonce, mensagem, expiraEm: expira.toISOString() };
}

/**
 * Confere a assinatura do desafio e vincula a carteira à conta. O desafio é
 * gasto na hora (mesmo se a assinatura não conferir).
 */
export async function verificarDesafio(
  userId: string,
  nonce: string,
  assinatura: Uint8Array,
): Promise<{ endereco: string } | { erro: string }> {
  const db = pool();
  const { rows } = await db.query<{ endereco: string; mensagem: string }>(
    `update carteira_desafios set usado_em = now()
     where nonce = $1 and user_id = $2 and usado_em is null and expira_em > now()
     returning endereco, mensagem`,
    [nonce, userId],
  );
  const d = rows[0];
  if (!d) return { erro: "O pedido venceu ou já foi usado. Conecte a carteira de novo." };
  if (!assinaturaConfere(d.endereco, d.mensagem, assinatura))
    return { erro: "A assinatura não confere com a carteira." };

  const cliente = await db.connect();
  try {
    await cliente.query("begin");
    await cliente.query(
      "delete from carteiras where endereco = $1 and user_id <> $2",
      [d.endereco, userId],
    );
    await cliente.query(
      `insert into carteiras (user_id, endereco) values ($1, $2)
       on conflict (user_id) do update set endereco = excluded.endereco, verificada_em = now()`,
      [userId, d.endereco],
    );
    await cliente.query("commit");
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
  return { endereco: d.endereco };
}

/** Tira a carteira da conta. Os NFTs já mintados continuam na carteira deles. */
export async function desvincularCarteira(userId: string): Promise<void> {
  await pool().query("delete from carteiras where user_id = $1", [userId]);
}
