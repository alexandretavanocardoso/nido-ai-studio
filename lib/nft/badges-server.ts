import { getPool } from "@/lib/db";
import { BADGES, badgePorId, mesmosBadges } from "./badges";
import { conferirAmbienteNft, redeNft, saldoMinimoNft } from "./config";
import { lerNftNaRede, montarEscritaDeBadges } from "./core";
import { saldoDaChaveDeMint, simular, transmitirEAcompanhar } from "./rede";

/**
 * Espelha no NFT os badges que valem no banco (nft_badges com status
 * "concedido"). A escrita substitui a lista inteira, então repetir é seguro:
 * se uma escrita se perder, a próxima rodada escreve de novo.
 *
 * Só mexe nos NFTs da rede em que o app está (NFT_REDE): um NFT de devnet não
 * existe na mainnet, e vice-versa.
 */
function pool() {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL não configurada.");
  return p;
}

/** Marca usada para forçar a reescrita (nunca é um id de badge). */
const REESCREVER = "__reescrever";

export type ResultadoGravacao =
  | "gravado"
  | "igual"
  | "ocupado"
  | "sem_saldo"
  | "falhou";

/** Grava no NFT os badges do personagem, se a lista do banco for diferente da que está lá. */
export async function gravarBadges(mintId: string): Promise<ResultadoGravacao> {
  const db = pool();
  // A trava evita duas escritas ao mesmo tempo (tela e cron); vence sozinha em 3 min.
  const { rows } = await db.query<{
    asset: string;
    character_id: string;
    ficha_hash: string;
    badges_onchain: string[];
  }>(
    `update nft_mints set badges_trava = now() + interval '3 minutes'
     where id = $1 and status = 'confirmado' and rede = $2
       and (badges_trava is null or badges_trava < now())
     returning asset, character_id, ficha_hash, badges_onchain`,
    [mintId, redeNft()],
  );
  const m = rows[0];
  if (!m) return "ocupado";
  const soltar = () =>
    db.query("update nft_mints set badges_trava = null where id = $1", [mintId]);
  try {
    const { rows: valem } = await db.query<{ badge: string; concedido_em: Date }>(
      "select badge, concedido_em from nft_badges where character_id = $1 and status = 'concedido'",
      [m.character_id],
    );
    // Badge que saiu do catálogo não tem como ser gravado: fica só no banco.
    const gravaveis = valem.filter((b) => badgePorId(b.badge));
    const ids = gravaveis.map((b) => b.badge);
    if (mesmosBadges(ids, m.badges_onchain)) {
      await soltar();
      return "igual";
    }
    // RPC na rede errada: a escrita iria para outro lugar. Lança e solta a trava.
    await conferirAmbienteNft();
    const saldo = await saldoDaChaveDeMint();
    if (saldo < saldoMinimoNft() / 4) {
      console.error(`[nft] ALERTA sem saldo para gravar badges: ${saldo} SOL`);
      await soltar();
      return "sem_saldo";
    }
    const tx = await montarEscritaDeBadges({
      asset: m.asset,
      fichaHash: m.ficha_hash,
      badges: gravaveis.map((b) => ({ id: b.badge, em: b.concedido_em })),
    });
    const recusada = await simular(tx.bytes);
    if (recusada) {
      console.error("[nft] ALERTA a rede recusou a escrita de badges", mintId, recusada);
      await soltar();
      return "falhou";
    }
    const situacao = await transmitirEAcompanhar(
      tx.bytes,
      tx.assinatura,
      30_000,
      "pendente",
    );
    if (situacao !== "pendente" && situacao !== "finalizada") {
      // Se ela entrar depois, tudo bem: a próxima rodada reescreve a mesma lista.
      console.warn("[nft] escrita de badges sem confirmação", mintId, situacao);
      await soltar();
      return "falhou";
    }
    await db.query(
      `update nft_mints set badges_onchain = $2, badges_gravado_em = now(), badges_trava = null, updated_at = now()
       where id = $1`,
      [mintId, ids],
    );
    return "gravado";
  } catch (e) {
    await soltar().catch(() => {});
    throw e;
  }
}

/** Mints confirmados cuja lista de badges no banco difere da gravada no NFT. */
export async function mintsComBadgesPendentes(max: number): Promise<string[]> {
  const { rows } = await pool().query<{ id: string }>(
    `select m.id from nft_mints m
     where m.status = 'confirmado' and m.rede = $3
       and (select coalesce(array_agg(b.badge order by b.badge), '{}'::text[])
            from nft_badges b where b.character_id = m.character_id and b.status = 'concedido'
              and b.badge = any($2::text[]))
           <> (select coalesce(array_agg(x order by x), '{}'::text[]) from unnest(m.badges_onchain) as x)
     order by m.badges_gravado_em asc nulls first limit $1`,
    [max, BADGES.map((b) => b.id), redeNft()],
  );
  return rows.map((r) => r.id);
}

/** Cron: grava os badges pendentes. Devolve quantos acabaram em cada resultado. */
export async function gravarBadgesPendentes(
  max: number,
  /** Para de começar gravações novas depois deste instante (Date.now()). */
  ate = Infinity,
): Promise<Record<string, number>> {
  const resultado: Record<string, number> = {};
  for (const id of await mintsComBadgesPendentes(max)) {
    if (Date.now() > ate) break;
    let r: string;
    try {
      r = await gravarBadges(id);
    } catch (e) {
      console.error("[nft] gravação de badges", id, e);
      r = "erro";
    }
    resultado[r] = (resultado[r] ?? 0) + 1;
    // Sem saldo, não adianta tentar os outros.
    if (r === "sem_saldo") break;
  }
  return resultado;
}

/**
 * Cron: confere o que está na rede contra o banco, nos mints conferidos há
 * mais tempo. Diferença (dono trocado, hash da ficha ou badges que o banco não
 * gravou) vira ALERTA no log e os badges são reescritos na rodada seguinte.
 */
export async function conferirNaRede(max: number): Promise<Record<string, number>> {
  const db = pool();
  const resultado: Record<string, number> = {};
  const { rows } = await db.query<{
    id: string;
    asset: string;
    carteira: string;
    ficha_hash: string;
    badges_onchain: string[];
  }>(
    `select id, asset, carteira, ficha_hash, badges_onchain from nft_mints
     where status = 'confirmado' and rede = $2
       and (conferido_em is null or conferido_em < now() - interval '20 hours')
     order by conferido_em asc nulls first limit $1`,
    [max, redeNft()],
  );
  for (const m of rows) {
    let r = "ok";
    try {
      const naRede = await lerNftNaRede(m.asset);
      if (!naRede) {
        r = "sumiu";
        console.error("[nft] ALERTA NFT confirmado não existe na rede", m.id, m.asset);
      } else {
        if (naRede.dono !== m.carteira) {
          r = "dono_diferente";
          console.error("[nft] ALERTA o dono do NFT mudou", m.id, naRede.dono);
        }
        const ids = naRede.dados?.badges ?? [];
        if (naRede.dados?.ficha !== m.ficha_hash) {
          r = "dados_diferentes";
          console.error("[nft] ALERTA hash da ficha diferente na rede", m.id);
          await db.query("update nft_mints set badges_onchain = $2 where id = $1", [
            m.id,
            [REESCREVER],
          ]);
        } else if (!mesmosBadges(ids, m.badges_onchain)) {
          r = "dados_diferentes";
          console.error("[nft] ALERTA badges na rede diferentes do banco", m.id, ids);
          // Passa a valer o que está na rede: a próxima gravação corrige.
          await db.query("update nft_mints set badges_onchain = $2 where id = $1", [
            m.id,
            ids,
          ]);
        }
      }
      await db.query("update nft_mints set conferido_em = now() where id = $1", [m.id]);
    } catch (e) {
      r = "erro";
      console.error("[nft] conferência na rede", m.id, e);
    }
    resultado[r] = (resultado[r] ?? 0) + 1;
  }
  return resultado;
}
