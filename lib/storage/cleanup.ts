import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "@neondatabase/serverless";
import { getBucket } from "./s3";

/**
 * Arquivo sem uso só é apagado depois disso (upload recente pode ainda não ter
 * sincronizado com a ficha — leva segundos; a folga é generosa).
 */
export const GRACE_CRON_MS = 24 * 60 * 60 * 1000;
/** "Liberar espaço agora" (pedido pela própria pessoa): folga curta. */
export const GRACE_MANUAL_MS = 30 * 60 * 1000;

/** Qualquer key de arquivo do app dentro do JSON de um personagem (refs, vídeos, galeria, histórico). */
const KEY_RE = /users\/[A-Za-z0-9_-]+\/[a-z]+\/[A-Za-z0-9_-]+\.[a-z0-9]+/g;

export interface CleanupStats {
  usuarios: number;
  arquivos: number;
  apagados: number;
}

/**
 * Apaga do bucket os arquivos que nenhum personagem do dono referencia
 * mais (referência removida, imagem que saiu da galeria, personagem ou
 * conta excluídos) e que têm mais de 24h. Roda no cron diário.
 */
export async function cleanupOrphans(s3: S3Client, pool: Pool): Promise<CleanupStats> {
  const stats: CleanupStats = { usuarios: 0, arquivos: 0, apagados: 0 };
  for await (const prefix of listPrefixes(s3, getBucket()!)) {
    const r = await limparUsuario(s3, pool, prefix.slice("users/".length, -1), GRACE_CRON_MS);
    stats.usuarios++;
    stats.arquivos += r.arquivos;
    stats.apagados += r.apagados;
  }
  return stats;
}

/** Limpa os órfãos de uma conta. Devolve quantos arquivos e bytes foram liberados. */
export async function limparUsuario(
  s3: S3Client,
  pool: Pool,
  userId: string,
  graceMs: number,
): Promise<{ arquivos: number; apagados: number; bytes: number }> {
  const Bucket = getBucket()!;
  const prefix = `users/${userId}/`;
  const stats = { arquivos: 0, apagados: 0, bytes: 0 };

  // Personagens + jobs de vídeo (resultado pronto que o navegador ainda não registrou na ficha).
  const { rows } = await pool.query<{ json: string }>(
    `select data::text as json from characters where user_id = $1
       union all
       select concat_ws(' ', result_key, input::text) from video_jobs where user_id = $1
       union all
       select concat_ws(' ', key, key_alta) from personas_treino where user_id = $1
       union all
       select amostra_key from vozes where user_id = $1 and amostra_key is not null
       union all
       -- A foto de perfil enviada no Perfil (/api/storage/file/users/…).
       select coalesce("image", '') from "user" where "id" = $1`,
    [userId],
  );
  const emUso = new Set(rows.flatMap((r) => r.json.match(KEY_RE) ?? []));
  for (const key of await capasDeNft(pool, userId)) emUso.add(key);

  // PFPs gerados no perfil (lib/pfp-server.ts): ficam enquanto a conta existir.
  const conta = await pool.query(`select 1 from "user" where "id" = $1`, [userId]);
  const pfps = conta.rowCount ? `${prefix}pfp/` : null;

  const lixo: string[] = [];
  for await (const obj of listObjects(s3, Bucket, prefix)) {
    stats.arquivos++;
    const velho = (obj.LastModified?.getTime() ?? Date.now()) < Date.now() - graceMs;
    if (velho && !emUso.has(obj.Key) && !(pfps && obj.Key.startsWith(pfps))) {
      lixo.push(obj.Key);
      stats.bytes += obj.Size;
    }
  }

  for (let i = 0; i < lixo.length; i += 1000) {
    const lote = lixo.slice(i, i + 1000);
    await s3.send(
      new DeleteObjectsCommand({ Bucket, Delete: { Objects: lote.map((Key) => ({ Key })), Quiet: true } }),
    );
    stats.apagados += lote.length;
  }
  return stats;
}

/**
 * Capas dos NFTs da conta (cópia feita no mint): continuam em uso mesmo que a
 * pessoa troque a capa ou apague o personagem. Banco sem a tabela (migration
 * 0028 ainda não aplicada) = nenhuma; qualquer outro erro interrompe a limpeza,
 * para nunca apagar uma capa por engano.
 */
async function capasDeNft(pool: Pool, userId: string): Promise<string[]> {
  try {
    const { rows } = await pool.query<{ capa_key: string }>(
      "select capa_key from nft_mints where user_id = $1 and capa_key is not null and status <> 'falhou'",
      [userId],
    );
    // A arte do NFT (lib/nft/arte-server.ts) também fica: é dela que sai a imagem do mint.
    const artes = await pool
      .query<{ key: string }>(
        // As opções ainda por escolher e a escolhida (unnest pula a lista vazia).
        `select unnest(opcoes) as key from nft_artes where user_id = $1
         union select key from nft_artes where user_id = $1 and key is not null`,
        [userId],
      )
      .catch((e) => {
        if ((e as { code?: string }).code === "42P01") return { rows: [] };
        throw e;
      });
    return [...rows.map((r) => r.capa_key), ...artes.rows.map((r) => r.key)];
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return [];
    throw e;
  }
}

async function* listPrefixes(s3: S3Client, Bucket: string) {
  let ContinuationToken: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket, Prefix: "users/", Delimiter: "/", ContinuationToken }),
    );
    for (const p of res.CommonPrefixes ?? []) if (p.Prefix) yield p.Prefix;
    ContinuationToken = res.NextContinuationToken;
  } while (ContinuationToken);
}

async function* listObjects(s3: S3Client, Bucket: string, Prefix: string) {
  let ContinuationToken: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
    for (const o of res.Contents ?? [])
      if (o.Key) yield { Key: o.Key, LastModified: o.LastModified, Size: o.Size ?? 0 };
    ContinuationToken = res.NextContinuationToken;
  } while (ContinuationToken);
}
