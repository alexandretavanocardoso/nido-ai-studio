import { getPool } from "@/lib/db";

/**
 * Rate limit por chave (IP ou conta) em janelas fixas.
 *
 * Com DATABASE_URL, os contadores ficam na tabela `rate_limits` do Neon —
 * sobrevivem a deploys e valem entre instâncias da Vercel. Sem banco (ou se
 * o banco falhar), cai pro contador em memória, que zera a cada deploy.
 */

const PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 10);

export type Gate = { ok: true } | { ok: false; retryAfter: number };

/** `key` costuma ser o IP; rotas com teto próprio usam um prefixo (ex.: "img:"). */
export function allow(key: string, perMinute = PER_MINUTE): Promise<Gate> {
  return hit(key, perMinute, 60);
}

/**
 * Soma `amount` (padrão 1) em `key` e diz se ainda cabe em `limit` por janela
 * de `windowSec`. Com `amount` dá pra contar coisas como segundos de vídeo.
 */
export async function hit(
  key: string,
  limit: number,
  windowSec: number,
  amount = 1,
): Promise<Gate> {
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query<{ count: number; reset_in: number }>(
        `with w as (
           select to_timestamp(floor(extract(epoch from now()) / $2) * $2) as start
         )
         insert into rate_limits (key, window_start, count)
         select $1, w.start, $3 from w
         on conflict (key, window_start) do update set count = rate_limits.count + $3
         returning count, ceil(extract(epoch from window_start) + $2 - extract(epoch from now()))::int as reset_in`,
        [`${key}:${windowSec}`, windowSec, amount],
      );
      const { count, reset_in } = rows[0];
      if (count <= limit) return { ok: true };
      // Recusado não conta: devolve o que acabou de somar.
      await pool.query(
        `update rate_limits set count = count - $2
         where key = $1 and window_start = to_timestamp(floor(extract(epoch from now()) / $3) * $3)`,
        [`${key}:${windowSec}`, amount, windowSec],
      );
      return { ok: false, retryAfter: Math.max(1, reset_in) };
    } catch (e) {
      console.error(
        "[rate-limit] banco indisponível, usando memória:",
        (e as Error).message,
      );
    }
  }
  return hitMemory(`${key}:${windowSec}`, limit, windowSec, amount);
}

const buckets = new Map<string, number[]>();

function hitMemory(
  key: string,
  limit: number,
  windowSec: number,
  amount: number,
): Gate {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const prev = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (prev.length + amount > limit) {
    buckets.set(key, prev);
    return {
      ok: false,
      retryAfter: Math.ceil(((prev[0] ?? now) + windowMs - now) / 1000),
    };
  }
  for (let i = 0; i < amount; i++) prev.push(now);
  buckets.set(key, prev);
  return { ok: true };
}

export function readIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "unknown"
  );
}
