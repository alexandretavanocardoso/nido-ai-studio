import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { conferirNaRede, gravarBadgesPendentes } from "@/lib/nft/badges-server";
import {
  conferirAmbienteNft,
  ConfigNftError,
  nftConfigurado,
  redeNft,
  saldoMinimoNft,
} from "@/lib/nft/config";
import { conferirMintsPendentes } from "@/lib/nft/mint";
import { saldoDaChaveDeMint } from "@/lib/nft/rede";
import { atualizarViewsDeTodos } from "@/lib/nft/views-server";
import { getBundle } from "@/lib/social/bundle";
import { atualizarMetricas } from "@/lib/social/metricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Contas com NFT cujas métricas são relidas no bundle.social a cada rodada. */
const CONTAS_POR_RODADA = 15;
/** Personagens com views recalculadas a cada rodada. */
const PERSONAGENS_POR_RODADA = 40;
/** A rodada para de começar trabalho novo depois disto (o limite da função é 300 s). */
const ORCAMENTO_MS = 200_000;

/**
 * Cron do NFT (vercel.json; chame também de um cron externo a cada 5 min para
 * os mints fecharem rápido com a página fechada):
 *  1. fecha os mints em aberto (confirmado, ou falhou com estorno);
 *  2. relê no bundle.social as métricas das contas com NFT e recalcula as
 *     views e os badges (posts por link são relidos quando o dono abre o
 *     Dashboard — cada leitura dessas custa uma execução no Apify);
 *  3. grava no NFT os badges novos;
 *  4. confere a rede contra o banco e avisa no log se algo divergir.
 * Só mexe nos mints da rede em que o app está (NFT_REDE). Com o RPC apontando
 * para outra rede, nada que dependa da rede roda: julgar um mint pela rede
 * errada estornaria um NFT que existe.
 * A Vercel manda `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const pool = getPool();
  if (!pool || !nftConfigurado())
    return NextResponse.json({ ok: true, ligado: false });

  const fim = Date.now() + ORCAMENTO_MS;
  let redeCerta = true;
  try {
    await conferirAmbienteNft();
  } catch (e) {
    redeCerta = false;
    console.error(
      e instanceof ConfigNftError
        ? `[nft] ALERTA configuração: ${e.message}`
        : "[nft] rede fora do ar ao conferir o ambiente",
      e instanceof ConfigNftError ? "" : e,
    );
  }
  // Fecha os mints em aberto (cada um confere o ambiente de novo antes de
  // julgar) e refaz estornos que não completaram, que não dependem da rede.
  const mints = await conferirMintsPendentes();

  let views = 0;
  const bundle = getBundle();
  if (bundle) {
    const { rows } = await pool.query<{ user_id: string }>(
      `select m.user_id from nft_mints m
       where m.status = 'confirmado' and m.rede = $2 and m.user_id is not null
       group by m.user_id
       order by (select min(v.conferido_em) from nft_views v where v.user_id = m.user_id) asc nulls first
       limit $1`,
      [CONTAS_POR_RODADA, redeNft()],
    );
    for (const { user_id } of rows) {
      if (Date.now() > fim) break;
      // Leitura com mais de 6h é refeita (só os posts dos últimos 180 dias).
      await atualizarMetricas(bundle, pool, user_id, 360).catch((e) =>
        console.error("[cron/nft] métricas", user_id, e),
      );
    }
  }
  // Posts por link contam mesmo sem bundle.social configurado.
  if (Date.now() < fim)
    views = await atualizarViewsDeTodos(pool, bundle, PERSONAGENS_POR_RODADA);

  const badges =
    redeCerta && Date.now() < fim ? await gravarBadgesPendentes(10, fim) : {};
  const rede = redeCerta && Date.now() < fim ? await conferirNaRede(25) : {};

  const saldo = redeCerta ? await saldoDaChaveDeMint().catch(() => null) : null;
  if (saldo !== null && saldo < saldoMinimoNft())
    console.error(`[nft] ALERTA saldo da chave de mint baixo: ${saldo} SOL`);

  const resultado = { redeCerta, mints, views, badges, rede, saldo };
  console.log("[cron] nft", resultado);
  return NextResponse.json({ ok: true, ligado: true, ...resultado });
}
