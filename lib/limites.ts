import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { creditosAtivos, planoAtual } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { cotaArmazenamentoBytes, PLANOS } from "@/lib/planos";
import { getS3, somarTamanho } from "@/lib/storage/s3";

/**
 * Limites por plano que não são de créditos (server-side):
 *  - Gerações simultâneas: cada geração em andamento ocupa uma "vaga"
 *    (tabela geracoes_ativas, com validade); jobs de vídeo em processamento
 *    contam direto de video_jobs. Um advisory lock por conta impede que dois
 *    pedidos ao mesmo tempo passem do limite.
 *  - Armazenamento: soma do tamanho dos arquivos da conta no S3, recalculada
 *    pela listagem do bucket a cada 10 min e somada a cada envio no meio-tempo.
 * Sem créditos ativos (modo dev, sem login), nada disso se aplica.
 */

type TipoVaga = "imagem" | "video";

/** Uma vaga dura no máximo isso (se a função cair antes de liberar). */
const VALIDADE_VAGA_MIN = 10;
/** Job de vídeo parado há mais que isso não ocupa vaga (provável falha não reportada). */
const JOB_ATIVO_HORAS = 3;
const RECALCULO_MIN = 10;

function descreverAndamento(n: number, tipo: TipoVaga): string {
  if (tipo === "imagem") return n === 1 ? "1 imagem sendo gerada" : `${n} imagens sendo geradas`;
  return n === 1 ? "1 vídeo sendo gerado" : `${n} vídeos sendo gerados`;
}

function fmtGB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
}

/**
 * Ocupa uma vaga de geração, ou devolve a resposta 429 pronta se o plano já
 * está no limite. Libere com `liberarVaga` quando a geração terminar.
 */
export async function vagaOuResponder(
  userId: string | null,
  tipo: TipoVaga
): Promise<{ vaga: string | null } | NextResponse> {
  if (!creditosAtivos() || !userId) return { vaga: null };
  const plano = await planoAtual(userId);
  const limite = PLANOS[plano].simultaneas[tipo === "imagem" ? "imagens" : "videos"];

  const db = await getPool()!.connect();
  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtext($1))", [`vagas:${userId}`]);
    await db.query("delete from geracoes_ativas where user_id = $1 and expira_em < now()", [userId]);
    const { rows } = await db.query<{ n: string }>(
      `select (select count(*) from geracoes_ativas where user_id = $1 and tipo = $2)
            + case when $2 = 'video' then (
                select count(*) from video_jobs
                 where user_id = $1 and status in ('na_fila', 'processando', 'finalizando')
                   and tipo not like 'treino%' -- treino de persona não ocupa vaga de vídeo
                   and created_at > now() - interval '${JOB_ATIVO_HORAS} hours')
              else 0 end as n`,
      [userId, tipo]
    );
    const emAndamento = Number(rows[0].n);
    if (emAndamento >= limite) {
      await db.query("rollback");
      return NextResponse.json(
        {
          error: `Você já tem ${descreverAndamento(emAndamento, tipo)}. O plano ${PLANOS[plano].nome} permite ${limite} ao mesmo tempo — aguarde terminar ou faça upgrade.`,
          code: "SIMULTANEAS",
        },
        { status: 429 }
      );
    }
    const id = nanoid(14);
    await db.query(
      `insert into geracoes_ativas (id, user_id, tipo, expira_em)
       values ($1, $2, $3, now() + interval '${VALIDADE_VAGA_MIN} minutes')`,
      [id, userId, tipo]
    );
    await db.query("commit");
    return { vaga: id };
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

export async function liberarVaga(vaga: string | null | undefined): Promise<void> {
  if (!vaga) return;
  await getPool()!
    .query("delete from geracoes_ativas where id = $1", [vaga])
    .catch((e) => console.error("[limites] liberar vaga:", e));
}

/** Bytes usados pela conta no S3 (cache de 10 min; `forcar` recalcula na hora). */
export async function usoArmazenamento(userId: string, forcar = false): Promise<number> {
  const pool = getPool()!;
  const { rows } = await pool.query<{ armazenamento_bytes: string; recente: boolean }>(
    `select armazenamento_bytes,
            coalesce(armazenamento_em > now() - interval '${RECALCULO_MIN} minutes', false) as recente
     from creditos_conta where user_id = $1`,
    [userId]
  );
  if (rows[0]?.recente && !forcar) return Number(rows[0].armazenamento_bytes);
  const s3 = getS3();
  if (!s3) return 0;
  const bytes = await somarTamanho(s3, `users/${userId}/`);
  await pool.query(
    "update creditos_conta set armazenamento_bytes = $2, armazenamento_em = now() where user_id = $1",
    [userId, bytes]
  );
  return bytes;
}

/** Soma um envio ao uso (até o próximo recálculo pela listagem do bucket). */
export async function somarArmazenamento(userId: string | null, bytes: number): Promise<void> {
  if (!creditosAtivos() || !userId || !bytes) return;
  await getPool()!
    .query("update creditos_conta set armazenamento_bytes = armazenamento_bytes + $2 where user_id = $1", [userId, bytes])
    .catch((e) => console.error("[limites] somar armazenamento:", e));
}

/** Devolve a resposta 403 pronta se `adicional` bytes não cabem na cota do plano. */
export async function armazenamentoOuResponder(userId: string | null, adicional = 0): Promise<NextResponse | null> {
  if (!creditosAtivos() || !userId) return null;
  const plano = await planoAtual(userId);
  const cota = cotaArmazenamentoBytes(plano);
  const uso = await usoArmazenamento(userId);
  if (uso + adicional <= cota) return null;
  return NextResponse.json(
    {
      error: `Sem espaço: ${fmtGB(uso)} de ${fmtGB(cota)} usados no plano ${PLANOS[plano].nome}. Remova vídeos e use "Liberar espaço" na página de planos, ou faça upgrade.`,
      code: "ARMAZENAMENTO",
    },
    { status: 403 }
  );
}
