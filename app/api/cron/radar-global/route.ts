import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { recursosDisponiveis } from "@/lib/recursos";
import {
  gerarRadarGlobal,
  globaisPendentesDeHoje,
} from "@/lib/radar/global-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Radares ao mesmo tempo (cada um leva ~1 min com o X). */
const EM_PARALELO = 4;
/** Depois disso não começa radares novos; o que sobrar fica para a próxima chamada. */
const LIMITE_MS = 200_000;

/**
 * Cron diário (vercel.json): monta o radar global — um por nicho e idioma.
 * A Vercel manda `Authorization: Bearer $CRON_SECRET`.
 * Só faz o que ainda falta hoje: chamar de novo não paga a pesquisa duas vezes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!getPool() || !recursosDisponiveis().ia)
    return NextResponse.json({
      ok: true,
      feitos: 0,
      motivo: "sem banco ou sem IA de texto",
    });

  const inicio = Date.now();
  const fila = await globaisPendentesDeHoje();
  const restantes = [...fila];
  let feitos = 0;
  let falhas = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(EM_PARALELO, restantes.length) },
      async () => {
        while (restantes.length && Date.now() - inicio < LIMITE_MS) {
          const p = restantes.shift()!;
          try {
            await gerarRadarGlobal(p.nicho, p.idioma);
            feitos++;
          } catch (e) {
            // Não grava nada: o nicho continua pendente e entra na próxima chamada.
            falhas++;
            console.error(
              "[cron radar global]",
              p.nicho,
              p.idioma,
              (e as Error).message,
            );
          }
        }
      },
    ),
  );
  const resumo = { naFila: fila.length, feitos, falhas };
  console.log("[cron] radar global", resumo);
  return NextResponse.json({ ok: true, ...resumo });
}
