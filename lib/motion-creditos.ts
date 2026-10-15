import type { Pool } from "@neondatabase/serverless";
import { debitar, estornar, estornarParcial, type Cobranca } from "@/lib/creditos";
import { creditosMotion } from "@/worker/motion/modelos";
import type { UsoMotion } from "@/worker/motion/tipos";

/**
 * Créditos do Motion (server-side). Ao pedir um motion (gerar ou ajustar), a
 * estimativa que a tela mostra é cobrada na hora, como reserva — o custo real
 * (tokens do modelo) só se sabe quando o worker termina. Aqui fica o acerto de
 * cada motion que terminou, uma vez só:
 *  - pronto: cobra o custo real — devolve a sobra ou cobra a diferença (sem
 *    saldo para a diferença, ela fica por conta da NIDO);
 *  - erro: devolve tudo.
 * Crédito gasto rende pontos e o devolvido tira (lib/creditos.ts).
 * Roda quando a tela lista os motions e no relógio dos vídeos (cron), para
 * acertar mesmo com a tela fechada. Nunca lança.
 */
export async function acertarMotions(pool: Pool, userId?: string): Promise<number> {
  let acertados = 0;
  try {
    const { rows } = await pool.query<{ id: string }>(
      `select id from motions
        where cobranca is not null and acertado_em is null and status in ('pronto', 'erro')
          ${userId ? "and user_id = $1" : ""}
        order by updated_at limit 50`,
      userId ? [userId] : [],
    );
    for (const { id } of rows) {
      // Marca antes de mexer nos créditos: dois acertos ao mesmo tempo não devolvem duas vezes.
      const { rows: marcados } = await pool.query<{
        user_id: string;
        status: string;
        cobranca: Cobranca;
        uso: UsoMotion | null;
      }>(
        `update motions set acertado_em = now()
          where id = $1 and acertado_em is null
          returning user_id, status, cobranca, uso`,
        [id],
      );
      const m = marcados[0];
      if (!m) continue;
      acertados++;
      try {
        if (m.status === "erro") {
          await estornar(m.cobranca, "estorno_motion");
          continue;
        }
        const real = creditosMotion(Number(m.uso?.custo ?? 0));
        const reservado = m.cobranca.total;
        if (real < reservado)
          await estornarParcial(m.cobranca, reservado - real, "estorno_ajuste_motion");
        else if (real > reservado) {
          const extra = await debitar(m.user_id, real - reservado, "motion", `motion:${id}`);
          if (!extra)
            console.warn(
              `[motion] sem saldo para a diferença (${real - reservado} créditos) do motion ${id}: fica por conta da NIDO.`,
            );
        }
      } catch (e) {
        console.error("[motion] ALERTA: acerto de créditos falhou", id, e);
      }
    }
  } catch (e) {
    console.error("[motion] acerto de créditos", e);
  }
  return acertados;
}
