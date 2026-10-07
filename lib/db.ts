import { Pool } from "@neondatabase/serverless";

/**
 * Pool de conexões com o Postgres do Neon (server-side apenas).
 * Compatível com `pg`, então serve tanto pro Better Auth quanto pras
 * queries das rotas de personagens. Retorna null sem DATABASE_URL.
 */
let pool: Pool | null = null;

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) pool = new Pool({ connectionString: url });
  return pool;
}
