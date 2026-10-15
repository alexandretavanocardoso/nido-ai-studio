/**
 * O trabalho da Sombra no banco: fica em `input.trabalho` do video_jobs
 * (provedor 'nido'). O app cria o job; aqui o processo pega para si, dá sinal
 * de vida, guarda cada parte pronta e o fim (ou o erro).
 */
import type { JobSombra, ParteFeita, Trabalho } from "./processar";

/** O mínimo de um Pool (o do Neon, ou o PGlite nos testes). */
export interface Banco {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Sem sinal de vida por isso, o trabalho volta a ficar livre (outro processo retoma). */
export const PRAZO_SINAL_MS = 10 * 60_000;

/** Pega para si o próximo trabalho livre (novo, ou parado sem sinal de vida). */
export async function pegarTrabalho(pool: Banco, agora = Date.now()): Promise<JobSombra | null> {
  const { rows } = await pool.query<{
    id: string;
    user_id: string;
    duracao: number | null;
    input: {
      fonte: JobSombra["fonte"];
      pedido: string;
      imageKey: string;
      voiceId?: string | null;
      trecho?: JobSombra["trecho"];
      trabalho?: Trabalho;
    };
  }>(
    `update video_jobs v set status = 'processando', updated_at = now(),
            input = jsonb_set(v.input, '{trabalho}',
              (coalesce(v.input->'trabalho', '{}'::jsonb) - 'partes')
              || jsonb_build_object('partes', coalesce(v.input->'trabalho'->'partes', '{}'::jsonb),
                                    'estado', 'processando', 'vivoEm', $1::bigint), true)
      where v.id = (
        select id from video_jobs
         where provedor = 'nido' and status in ('na_fila', 'processando')
           and (input->'trabalho' is null
                or (input->'trabalho'->>'estado' = 'processando'
                    and coalesce((input->'trabalho'->>'vivoEm')::bigint, 0) < $2::bigint))
         order by created_at
         limit 1
         for update skip locked)
      returning v.id, v.user_id, v.duracao, v.input`,
    [agora, agora - PRAZO_SINAL_MS],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    duracao: Number(r.duracao ?? 0),
    fonte: r.input.fonte,
    pedido: r.input.pedido,
    imageKey: r.input.imageKey,
    voiceId: r.input.voiceId ?? null,
    trecho: r.input.trecho ?? null,
    trabalho: r.input.trabalho ?? null,
  };
}

/** Guarda o andamento (só as chaves passadas mudam) e o sinal de vida. */
export async function salvarTrabalho(
  pool: Banco,
  id: string,
  { parte, ...resto }: Partial<Trabalho> & { parte?: [number, ParteFeita] },
  agora = Date.now(),
): Promise<void> {
  if (parte)
    await pool.query(
      `update video_jobs set input = jsonb_set(input, array['trabalho','partes',$2::text], $3::jsonb, true), updated_at = now()
        where id = $1`,
      [id, String(parte[0]), JSON.stringify(parte[1])],
    );
  await pool.query(
    `update video_jobs set input = jsonb_set(input, '{trabalho}', coalesce(input->'trabalho', '{}'::jsonb) || $2::jsonb, true), updated_at = now()
      where id = $1`,
    [id, JSON.stringify({ ...resto, vivoEm: agora })],
  );
}
