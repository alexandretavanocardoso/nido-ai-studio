import type { S3Client } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { criarAviso } from "@/lib/avisos-server";
import { status as statusDaFicha } from "@/lib/completion";
import { cobrarOuResponder, planoAtual, type Cobranca } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { DECLARACAO_NFT } from "@/lib/declaracoes";
import { carregarPersonagem } from "@/lib/personagens";
import { bloqueioNft, CREDITOS_MINT_NFT } from "@/lib/planos";
import { getObjectBuffer, ownsKey, putObject } from "@/lib/storage/s3";
import { carteiraDaConta } from "./carteira-server";
import type { MintDoPersonagem, StatusMint } from "./comum";
import {
  baseUrlNft,
  ConfigNftError,
  conferirAmbienteNft,
  linkExplorerNft,
  redeNft,
  saldoMinimoNft,
  tetoDiarioNft,
  uriDoNft,
  type RedeNft,
} from "./config";
import { montarMint } from "./core";
import { hashDaFicha, nomeNaRede } from "./metadados";
import { proximoPasso, type Fatos } from "./decisao";
import {
  alturaFinalizada,
  contaExiste,
  saldoDaChaveDeMint,
  simular,
  situacaoDaTransacao,
  transmitirEAcompanhar,
} from "./rede";

/**
 * Mint do NFT de um personagem (tabela nft_mints).
 *
 * Ordem que não deixa cobrança sem NFT nem NFT sem cobrança:
 *  1. confere tudo (ficha, capa, plano, carteira, teto do dia, saldo da chave);
 *  2. monta e ASSINA a transação e grava a linha (o índice único por
 *     personagem barra o segundo clique e a segunda aba);
 *  3. simula — se a rede recusaria, para aqui sem cobrar;
 *  4. cobra os créditos;
 *  5. grava a assinatura e o último bloco válido (status "enviado") e SÓ ENTÃO
 *     transmite;
 *  6. o resultado sai sempre de conferirMint, que olha a rede: finalizada →
 *     confirmado; recusada ou vencida sem registro → falhou, com estorno.
 * Se o servidor cair em qualquer ponto, conferirMint (tela, cron) termina o
 * serviço: a transação tem prazo de validade na rede, então "não entrou e não
 * entra mais" é um fato que dá para conferir.
 *
 * Cada linha guarda a rede em que nasceu (devnet ou mainnet) e o app só mexe
 * nas linhas da rede em que está (NFT_REDE): um mint de devnet não é julgado
 * pela mainnet, nem impede o mint do mesmo personagem nela.
 */

/** Mint que nunca chegou a ser enviado é dado como falho depois disto. */
const MINUTOS_PREPARANDO = 10;
/** Quanto a rota espera a rede finalizar antes de responder "ainda confirmando". */
const ESPERA_MS = 45_000;
/** Lado maior da capa copiada para o NFT. */
const LADO_CAPA = 1024;

interface Linha {
  id: string;
  user_id: string | null;
  character_id: string;
  carteira: string;
  asset: string;
  rede: RedeNft;
  nome: string;
  ficha_hash: string;
  status: StatusMint;
  assinatura: string | null;
  valido_ate_bloco: string | null;
  cobranca: Cobranca | null;
  erro: string | null;
  created_at: Date;
  updated_at: Date;
  preparando_velho: boolean;
}

const CAMPOS = `id, user_id, character_id, carteira, asset, rede, nome, ficha_hash, status, assinatura,
  valido_ate_bloco, cobranca, erro, created_at, updated_at,
  created_at < now() - interval '${MINUTOS_PREPARANDO} minutes' as preparando_velho`;

function pool() {
  const p = getPool();
  if (!p) throw new Error("DATABASE_URL não configurada.");
  return p;
}

export function paraResposta(l: Linha): MintDoPersonagem {
  return {
    id: l.id,
    status: l.status,
    rede: l.rede,
    asset: l.asset,
    carteira: l.carteira,
    assinatura: l.assinatura,
    erro: l.erro,
    linkAsset: linkExplorerNft("address", l.asset, l.rede),
    linkTransacao: l.assinatura
      ? linkExplorerNft("tx", l.assinatura, l.rede)
      : null,
    criadoEm: l.created_at.toISOString(),
    imagemVersao: l.updated_at.getTime(),
  };
}

async function ler(id: string): Promise<Linha | null> {
  const { rows } = await pool().query<Linha>(
    `select ${CAMPOS} from nft_mints where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * O mint que vale para o personagem nesta rede: o que está vivo, senão o
 * último que falhou.
 */
export async function mintDoPersonagem(
  userId: string,
  characterId: string,
): Promise<Linha | null> {
  const { rows } = await pool().query<Linha>(
    `select ${CAMPOS} from nft_mints where user_id = $1 and character_id = $2 and rede = $3
     order by (status <> 'falhou') desc, created_at desc limit 1`,
    [userId, characterId, redeNft()],
  );
  return rows[0] ?? null;
}

/** Personagens da conta com NFT mintado nesta rede (o selo dos cards). */
export async function personagensComNft(userId: string): Promise<string[]> {
  const { rows } = await pool().query<{ character_id: string }>(
    "select character_id from nft_mints where user_id = $1 and rede = $2 and status = 'confirmado'",
    [userId, redeNft()],
  );
  return rows.map((r) => r.character_id);
}

/**
 * Cópia da imagem só do NFT (JPEG, até 1024 px), feita a partir do Retrato do
 * personagem (lib/nft/imagem.ts). Fica fora do personagem: gerar outro retrato,
 * trocar a capa ou apagar o personagem não muda nem tira a imagem do NFT (a
 * limpeza do S3 poupa as keys de nft_mints — ver lib/storage/cleanup.ts). Só
 * a imagem do NFT é a que foi escolhida antes do mint, e não muda mais.
 */
async function copiarCapa(
  s3: S3Client,
  userId: string,
  mintId: string,
  key: string,
): Promise<string> {
  const original = await getObjectBuffer(s3, key);
  const jpeg = await sharp(original)
    .rotate()
    .resize(LADO_CAPA, LADO_CAPA, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const destino = `users/${userId}/nft/${mintId}.jpg`;
  await putObject(s3, destino, jpeg, "image/jpeg");
  return destino;
}

function recusa(error: string, code: string, status: number): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

const SEM_ARTE =
  "Gere as artes do NFT e escolha uma antes de mintar: ela é a imagem do NFT.";

/** Key da arte ESCOLHIDA para o NFT do personagem (lib/nft/arte-server.ts), ou null. */
async function arteDoNft(
  userId: string,
  characterId: string,
): Promise<string | null> {
  const { rows } = await pool().query<{ key: string }>(
    "select key from nft_artes where character_id = $1 and user_id = $2 and key is not null",
    [characterId, userId],
  );
  return rows[0]?.key ?? null;
}

/**
 * Minta o NFT do personagem para a carteira vinculada à conta. Devolve o mint
 * (confirmado, ou ainda confirmando) ou a resposta de recusa pronta.
 */
export async function mintar(o: {
  userId: string;
  characterId: string;
  ip: string;
  s3: S3Client;
}): Promise<{ mint: MintDoPersonagem } | NextResponse> {
  const { userId, characterId } = o;
  const db = pool();
  const rede = redeNft();
  const base = baseUrlNft();
  const indisponivel = () =>
    recusa(
      "O mint está indisponível no momento. Tente de novo mais tarde.",
      "INDISPONIVEL",
      503,
    );
  try {
    await conferirAmbienteNft();
  } catch (e) {
    if (e instanceof ConfigNftError) {
      console.error("[nft] ALERTA configuração:", e.message);
      return recusa("NFT não configurado.", "CONFIG_MISSING", 500);
    }
    // A rede não respondeu: nada foi cobrado.
    console.error("[nft] rede fora do ar ao conferir o ambiente", e);
    return indisponivel();
  }
  if (!rede || !base)
    return recusa(
      "NFT não configurado (endereço público do app).",
      "CONFIG_MISSING",
      500,
    );

  const personagem = await carregarPersonagem(userId, characterId);
  if (!personagem) return recusa("Personagem não encontrado.", "NOT_FOUND", 404);
  if (statusDaFicha(personagem) !== "completo")
    return recusa(
      "Complete o personagem (nome e pelo menos uma imagem) antes de mintar.",
      "BAD_INPUT",
      400,
    );
  // A imagem do NFT é pública: só a arte gerada para ele serve (nunca uma
  // referência nem outra imagem do personagem).
  const capa = await arteDoNft(userId, characterId);
  if (!capa || !ownsKey(userId, capa)) return recusa(SEM_ARTE, "SEM_ARTE", 400);

  const bloqueio = bloqueioNft(await planoAtual(userId));
  if (bloqueio) return recusa(bloqueio, "PLANO", 403);

  const carteira = await carteiraDaConta(userId);
  if (!carteira)
    return recusa("Conecte uma carteira antes de mintar.", "SEM_CARTEIRA", 400);

  // Mint anterior deste personagem: confere na rede antes de decidir.
  const anterior = await mintDoPersonagem(userId, characterId);
  if (anterior && anterior.status !== "falhou") {
    const agora = await conferirMint(anterior.id);
    if (agora && agora.status !== "falhou")
      return recusa(
        agora.status === "confirmado"
          ? "Este personagem já tem um NFT."
          : "O mint deste personagem já está em andamento.",
        "JA_MINTADO",
        409,
      );
  }

  const { rows: hoje } = await db.query<{ n: number }>(
    `select count(*)::int as n from nft_mints
     where status in ('enviado', 'confirmado') and rede = $1 and created_at > now() - interval '24 hours'`,
    [rede],
  );
  if (hoje[0].n >= tetoDiarioNft()) {
    console.error("[nft] ALERTA teto diário de mints atingido:", hoje[0].n);
    return recusa(
      "O limite de mints de hoje foi atingido. Tente de novo amanhã.",
      "LIMITE",
      429,
    );
  }
  const id = `nft_${nanoid(14)}`;
  const nome = nomeNaRede(personagem);
  const fichaHash = hashDaFicha(personagem);
  let tx: Awaited<ReturnType<typeof montarMint>>;
  try {
    const saldo = await saldoDaChaveDeMint();
    if (saldo < saldoMinimoNft()) {
      console.error(`[nft] ALERTA saldo da chave de mint baixo: ${saldo} SOL`);
      return indisponivel();
    }
    // Sorteia o endereço do NFT e assina. Nada é enviado ainda.
    tx = await montarMint({
      carteira,
      nome,
      uri: (asset) => uriDoNft(base, asset),
      fichaHash,
    });
  } catch (e) {
    // A rede não respondeu: nada foi gravado nem cobrado.
    console.error("[nft] rede fora do ar ao montar o mint", e);
    return indisponivel();
  }

  // A linha é a trava: o índice único por personagem barra o segundo pedido.
  try {
    await db.query(
      `insert into nft_mints (id, user_id, character_id, carteira, asset, rede, nome, ficha_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        userId,
        characterId,
        carteira,
        tx.asset,
        rede,
        nome,
        fichaHash,
      ],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return recusa(
        "O mint deste personagem já está em andamento.",
        "JA_MINTADO",
        409,
      );
    throw e;
  }

  try {
    const capaKey = await copiarCapa(o.s3, userId, id, capa);
    await db.query("update nft_mints set capa_key = $2 where id = $1", [
      id,
      capaKey,
    ]);
    // Declaração obrigatória: fica registrada (quem, o quê, quando, de onde).
    await db.query(
      "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'nft_mint', $4, $5)",
      [nanoid(14), userId, characterId, DECLARACAO_NFT, o.ip],
    );

    const recusada = await simular(tx.bytes);
    if (recusada) {
      console.error("[nft] a simulação recusou o mint", id, recusada);
      await falhar(id, `Simulação: ${recusada}`);
      return recusa(
        "A rede recusou o mint. Nada foi cobrado.",
        "PROVIDER_ERROR",
        502,
      );
    }

    const cobrado = await cobrarOuResponder(
      userId,
      CREDITOS_MINT_NFT,
      "nft_mint",
      id,
    );
    if (cobrado instanceof NextResponse) {
      await falhar(id, "Créditos insuficientes.");
      return cobrado;
    }
    // Assinatura e prazo gravados ANTES do envio: dá para conferir depois.
    const { rowCount } = await db.query(
      `update nft_mints set status = 'enviado', assinatura = $2, valido_ate_bloco = $3, cobranca = $4, updated_at = now()
       where id = $1 and status = 'preparando'`,
      [
        id,
        tx.assinatura,
        tx.validoAteBloco,
        cobrado.cobranca ? JSON.stringify(cobrado.cobranca) : null,
      ],
    );
    if (!rowCount) {
      // Outro pedido fechou a linha no meio: devolve pela regra de uma vez só.
      await devolver(id, userId, cobrado.cobranca);
      return recusa("O mint foi cancelado. Tente de novo.", "CONFLITO", 409);
    }
  } catch (e) {
    // Nada foi transmitido até aqui: falhar() devolve os créditos se a cobrança já tinha saído.
    console.error("[nft] preparo do mint", id, e);
    await falhar(id, (e as Error).message);
    return recusa(
      "Não foi possível preparar o mint. Nada foi cobrado.",
      "INTERNAL",
      500,
    );
  }

  // Daqui em diante a transação pode entrar: o resultado sai só da rede.
  try {
    await transmitirEAcompanhar(tx.bytes, tx.assinatura, ESPERA_MS, "finalizada");
  } catch (e) {
    console.error("[nft] envio do mint", id, e);
  }
  let fim: Linha | null = null;
  try {
    fim = await conferirMint(id);
  } catch (e) {
    console.error("[nft] conferência do mint", id, e);
  }
  fim ??= await ler(id);
  return { mint: paraResposta(fim!) };
}

/** A cobrança de um mint, lida do extrato (quando não deu tempo de gravá-la na linha). */
async function cobrancaPeloExtrato(
  userId: string,
  mintId: string,
): Promise<Cobranca | null> {
  const { rows } = await pool().query<{
    total: number;
    do_plano: number;
    do_avulso: number;
  }>(
    `select -delta as total, -do_plano as do_plano, -do_avulso as do_avulso from creditos_mov
     where user_id = $1 and motivo = 'nft_mint' and ref = $2 and delta < 0 limit 1`,
    [userId, mintId],
  );
  const r = rows[0];
  return r
    ? {
        id: `nft:${mintId}`,
        userId,
        total: r.total,
        doPlano: r.do_plano,
        doAvulso: r.do_avulso,
      }
    : null;
}

/**
 * Devolve os créditos de um mint que falhou — uma vez só. A marca na linha
 * (estornado), o lançamento no extrato e o saldo mudam NO MESMO comando: se o
 * banco cair no meio, ou nada aconteceu (e o cron tenta de novo) ou tudo
 * aconteceu. Quem chega depois encontra a linha marcada e não devolve outra vez.
 */
async function devolver(
  mintId: string,
  userId: string | null,
  cobranca: Cobranca | null,
): Promise<void> {
  if (!userId) return;
  const c = cobranca ?? (await cobrancaPeloExtrato(userId, mintId));
  if (!c) return;
  await pool().query(
    `with marca as (
       update nft_mints set estornado = true where id = $1 and not estornado returning 1
     ), mov as (
       insert into creditos_mov (id, user_id, delta, do_plano, do_avulso, motivo, ref)
       select $2, $3, $4::int, $5::int, $6::int, 'estorno', $7 from marca
       where not exists (
         select 1 from creditos_mov where user_id = $3 and ref = $7 and motivo like 'estorno%')
       returning 1
     )
     update creditos_conta set creditos_plano = creditos_plano + $5::int,
       creditos_avulsos = creditos_avulsos + $6::int, updated_at = now()
     where user_id = $3 and exists (select 1 from mov)`,
    [mintId, nanoid(14), userId, c.total, c.doPlano, c.doAvulso, c.id],
  );
}

/**
 * Marca o mint como falho e devolve os créditos. Só quem consegue mudar o
 * status (uma vez só) faz o estorno. NUNCA chamar com a transação ainda
 * podendo entrar na rede.
 */
async function falhar(id: string, erro: string): Promise<void> {
  const { rows } = await pool().query<{
    user_id: string | null;
    cobranca: Cobranca | null;
    nome: string;
    character_id: string;
    antes: StatusMint;
  }>(
    `with antes as (
       select id, status from nft_mints where id = $1 and status in ('preparando', 'enviado') for update
     )
     update nft_mints m set status = 'falhou', erro = $2, updated_at = now()
       from antes where m.id = antes.id
     returning m.user_id, m.cobranca, m.nome, m.character_id, antes.status as antes`,
    [id, erro.slice(0, 500)],
  );
  const l = rows[0];
  if (!l) return;
  await devolver(id, l.user_id, l.cobranca).catch((e) =>
    console.error("[nft] ALERTA estorno do mint falhou (o cron tenta de novo):", id, e),
  );
  // Só avisa quem já tinha sido cobrado e estava esperando.
  if (l.antes === "enviado" && l.user_id)
    await criarAviso(l.user_id, {
      rotulo: `NFT de ${l.nome}`,
      erro: true,
      href: `/app/personagem/${l.character_id}?aba=nft`,
      chave: `nft:${id}`,
    });
}

async function confirmar(l: Linha): Promise<void> {
  const { rowCount } = await pool().query(
    `update nft_mints set status = 'confirmado', confirmado_em = now(), erro = null, updated_at = now()
     where id = $1 and status = 'enviado'`,
    [l.id],
  );
  if (rowCount && l.user_id)
    await criarAviso(l.user_id, {
      rotulo: `NFT de ${l.nome}`,
      href: `/app/personagem/${l.character_id}?aba=nft`,
      chave: `nft:${l.id}`,
    });
}

/**
 * Olha a rede e fecha o mint: finalizada → confirmado; recusada, ou vencida
 * sem registro → falhou, com estorno. Enquanto a transação ainda pode entrar,
 * não muda nada. Pode ser chamado quantas vezes for (tela, cron, a própria rota).
 */
export async function conferirMint(id: string): Promise<Linha | null> {
  const l = await ler(id);
  if (!l) return null;
  // Mint de outra rede (devnet × mainnet no mesmo banco): quem julga é a outra.
  if (l.rede !== redeNft()) return l;
  if (l.status === "preparando") {
    // Sem assinatura gravada, nada foi transmitido.
    if (l.preparando_velho) await falhar(id, "O mint não chegou a ser enviado.");
    return ler(id);
  }
  if (l.status !== "enviado" || !l.assinatura) return l;
  // O RPC tem de estar na rede da linha: julgar pela rede errada estornaria um
  // mint que entrou. Se não estiver, lança erro e a linha fica como está.
  await conferirAmbienteNft();

  // Junta os fatos na ordem que a regra pede (lib/nft/decisao.ts) até ela decidir.
  const fatos: Fatos = {
    situacao: await situacaoDaTransacao(l.assinatura),
    validoAteBloco: Number(l.valido_ate_bloco ?? 0),
  };
  for (;;) {
    const passo = proximoPasso(fatos);
    if (passo === "ler_altura") {
      fatos.altura = await alturaFinalizada();
    } else if (passo === "ler_de_novo") {
      fatos.situacaoDepois = await situacaoDaTransacao(l.assinatura);
      fatos.contaExiste = await contaExiste(l.asset);
    } else {
      if (passo === "confirmar") await confirmar(l);
      else if (passo === "falhar_recusada")
        await falhar(id, "A rede recusou a transação.");
      else if (passo === "falhar_vencida")
        await falhar(id, "A transação venceu sem entrar na rede.");
      return passo === "aguardar" ? l : ler(id);
    }
  }
}

/**
 * Cron: fecha os mints em aberto e refaz estornos que não completaram.
 * Devolve quantos acabaram em cada situação.
 */
export async function conferirMintsPendentes(): Promise<Record<string, number>> {
  const db = pool();
  const resultado: Record<string, number> = {};
  const { rows } = await db.query<{ id: string }>(
    `select id from nft_mints where status in ('preparando', 'enviado') and rede = $1
     order by created_at limit 100`,
    [redeNft()],
  );
  for (const { id } of rows) {
    try {
      const l = await conferirMint(id);
      const s = l?.status ?? "sumiu";
      resultado[s] = (resultado[s] ?? 0) + 1;
    } catch (e) {
      console.error("[nft] conferência do mint", id, e);
      resultado.falha = (resultado.falha ?? 0) + 1;
    }
  }
  // Mint que falhou e cujo estorno não completou (banco fora do ar na hora).
  const { rows: semEstorno } = await db.query<{
    id: string;
    user_id: string | null;
    cobranca: Cobranca | null;
  }>(
    `update nft_mints set updated_at = now()
     where status = 'falhou' and not estornado and created_at > now() - interval '7 days'
       and updated_at < now() - interval '10 minutes'
       and (cobranca is not null or exists (
         select 1 from creditos_mov cm
         where cm.user_id = nft_mints.user_id and cm.motivo = 'nft_mint' and cm.ref = nft_mints.id))
     returning id, user_id, cobranca`,
  );
  for (const l of semEstorno) {
    try {
      await devolver(l.id, l.user_id, l.cobranca);
    } catch (e) {
      console.error("[nft] ALERTA estorno do mint falhou de novo:", l.id, e);
    }
  }
  return resultado;
}

