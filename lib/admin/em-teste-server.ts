import { getPool } from "@/lib/db";
import {
  RECURSOS_EM_TESTE,
  SO_ADMIN,
  type EstadoEmTeste,
  type RecursoEmTeste,
} from "@/lib/em-teste";

/**
 * Estado dos recursos em teste, lido do banco (tabela recursos_em_teste).
 * Recurso sem linha vale o padrão do código. Se o banco falhar, também vale o
 * padrão — que é "só admin": na dúvida, o recurso fica fechado.
 */
const PADRAO: EstadoEmTeste = { ...SO_ADMIN };

/** Quanto tempo a leitura vale na memória de cada instância do servidor. */
const VALIDADE_MS = 15_000;
let guardado: { estado: EstadoEmTeste; ate: number } | null = null;

export async function estadoEmTeste(): Promise<EstadoEmTeste> {
  if (guardado && guardado.ate > Date.now()) return guardado.estado;
  const estado: EstadoEmTeste = { ...PADRAO };
  const pool = getPool();
  if (pool) {
    try {
      const { rows } = await pool.query<{ recurso: string; so_admin: boolean }>(
        "select recurso, so_admin from recursos_em_teste",
      );
      for (const r of rows)
        if ((RECURSOS_EM_TESTE as string[]).includes(r.recurso))
          estado[r.recurso as RecursoEmTeste] = r.so_admin;
    } catch (e) {
      console.warn(
        "[em-teste] não consegui ler o estado (vale o padrão do código):",
        (e as Error).message,
      );
      // Sem guardar: tenta de novo na próxima chamada.
      return estado;
    }
  }
  guardado = { estado, ate: Date.now() + VALIDADE_MS };
  return estado;
}

/** O recurso está fechado (só admin) agora? */
export const soAdminAgora = async (recurso: RecursoEmTeste): Promise<boolean> =>
  (await estadoEmTeste())[recurso];

export interface RecursoAdmin {
  recurso: RecursoEmTeste;
  soAdmin: boolean;
  /** Valor que vale se ninguém mudar pela tela. */
  padrao: boolean;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/** Para a aba "Em teste": cada recurso com o estado e quem mudou por último. */
export async function listarEmTeste(): Promise<RecursoAdmin[]> {
  const { rows } = await getPool()!.query<{
    recurso: string;
    so_admin: boolean;
    atualizado_em: Date;
    atualizado_por: string | null;
  }>("select recurso, so_admin, atualizado_em, atualizado_por from recursos_em_teste");
  return RECURSOS_EM_TESTE.map((recurso) => {
    const r = rows.find((x) => x.recurso === recurso);
    return {
      recurso,
      soAdmin: r ? r.so_admin : PADRAO[recurso],
      padrao: PADRAO[recurso],
      atualizadoEm: r ? new Date(r.atualizado_em).toISOString() : null,
      atualizadoPor: r?.atualizado_por ?? null,
    };
  });
}

/** Fecha (só admin) ou libera para todos. Vale na hora nesta instância; nas outras, em até 15 s. */
export async function definirEmTeste(
  recurso: RecursoEmTeste,
  soAdmin: boolean,
  porEmail: string,
): Promise<void> {
  await getPool()!.query(
    `insert into recursos_em_teste (recurso, so_admin, atualizado_por)
     values ($1, $2, $3)
     on conflict (recurso) do update
       set so_admin = excluded.so_admin, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
    [recurso, soAdmin, porEmail],
  );
  guardado = null;
}
