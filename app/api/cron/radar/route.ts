import { after, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { recursosDisponiveis } from "@/lib/recursos";
import { atualizarRadar, pendentesDeHoje } from "@/lib/radar/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Radares ao mesmo tempo (cada um leva ~40s, ou ~1min30 com o X). */
const EM_PARALELO = 5;
/** Quantos entram numa rodada: 5 por vez × ~40s cabem com folga nos 300s. */
const POR_RODADA = 20;
/** Depois disso a rodada não começa radares novos (deixa margem para os que estão rodando). */
const LIMITE_MS = 170_000;
/** Rodadas encadeadas no máximo (20 × 20 = 400 radares por dia). */
const MAX_SALTOS = 20;

/**
 * Cron diário (vercel.json): monta o radar dos personagens com "Radar diário"
 * ligado. A Vercel manda `Authorization: Bearer $CRON_SECRET`.
 *
 * Processa vários ao mesmo tempo e, se ainda sobrar personagem sem radar hoje,
 * chama a si mesma de novo (?salto=N) — assim uma única execução diária dá
 * conta de qualquer volume, sem depender do plano da Vercel.
 * Sem créditos, o radar do dia fica marcado como "sem_creditos" (a tela avisa).
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

  const url = new URL(req.url);
  const salto = Math.max(0, Number(url.searchParams.get("salto")) || 0);
  const inicio = Date.now();
  const fila = await pendentesDeHoje(POR_RODADA);
  const resultado: Record<string, number> = {};
  let feitos = 0;

  // "Trabalhadores" puxando da mesma fila: no máximo EM_PARALELO radares ao mesmo tempo.
  const restantes = [...fila];
  await Promise.all(
    Array.from(
      { length: Math.min(EM_PARALELO, restantes.length) },
      async () => {
        while (restantes.length && Date.now() - inicio < LIMITE_MS) {
          const p = restantes.shift()!;
          try {
            const r = await atualizarRadar({ ...p, automatico: true });
            resultado[r.status] = (resultado[r.status] ?? 0) + 1;
          } catch (e) {
            // Sem temas / personagem apagado: grava nada e segue (não entra em laço — ver abaixo).
            resultado.pulado = (resultado.pulado ?? 0) + 1;
            console.warn("[cron radar]", p.characterId, (e as Error).message);
          }
          feitos++;
        }
      },
    ),
  );

  // Só encadeia se esta rodada avançou em radares gravados (os "pulados" continuam
  // pendentes e voltariam para a fila para sempre).
  const gravados = feitos - (resultado.pulado ?? 0);
  const continuar =
    fila.length === POR_RODADA && gravados > 0 && salto < MAX_SALTOS;
  if (continuar) {
    const proxima = new URL(url.pathname, url.origin);
    proxima.searchParams.set("salto", String(salto + 1));
    after(async () => {
      // Só precisa DISPARAR a próxima rodada; ela segue sozinha depois do corte.
      await fetch(proxima, {
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(8000),
      }).catch(() => {});
    });
  }
  console.log("[cron] radar", {
    salto,
    naFila: fila.length,
    feitos,
    continuar,
    ...resultado,
  });
  return NextResponse.json({
    ok: true,
    salto,
    naFila: fila.length,
    feitos,
    continuar,
    ...resultado,
  });
}
