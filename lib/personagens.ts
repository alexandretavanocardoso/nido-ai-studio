import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import { hydrate } from "@/lib/defaults";
import type { Character, VideoArquivo } from "@/lib/types";

/** Personagem da conta como está salvo no banco (null se ainda não sincronizou). */
export async function carregarPersonagem(userId: string, characterId: string): Promise<Character | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query<{ data: Character }>("select data from characters where id = $1 and user_id = $2", [
    characterId,
    userId,
  ]);
  return rows[0] ? hydrate(rows[0].data) : null;
}

/**
 * Põe um vídeo "processando" no topo da lista do personagem, direto no banco.
 * Quem pede o vídeo grava isto na hora: assim ele aparece (e a finalização
 * acha onde pôr o resultado) mesmo que o navegador não consiga salvar o
 * personagem. A tela também põe o vídeo na lista dela, com o mesmo `jobId`;
 * se a lista já tem esse `jobId`, nada muda. Devolve se gravou.
 */
export async function registrarVideoNoBanco(
  userId: string,
  characterId: string,
  v: Omit<VideoArquivo, "id" | "createdAt" | "key" | "size" | "contentType" | "status"> & {
    jobId: string;
  },
): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  const agora = Date.now();
  const video: VideoArquivo = {
    id: nanoid(8),
    key: "",
    size: 0,
    contentType: "video/mp4",
    createdAt: agora,
    status: "processando",
    ...v,
  };
  const { rowCount } = await pool.query(
    `update characters
       set data = jsonb_set(
             jsonb_set(data, '{videos}', $3::jsonb || coalesce(data->'videos', '[]'::jsonb)),
             '{updatedAt}', to_jsonb($5::bigint)),
           updated_at = now()
     where id = $1 and user_id = $2
       and not coalesce(data->'videos', '[]'::jsonb) @> $4::jsonb`,
    [characterId, userId, JSON.stringify([video]), JSON.stringify([{ jobId: v.jobId }]), agora],
  );
  return !!rowCount;
}
