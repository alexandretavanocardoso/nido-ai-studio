import { randomInt } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { criarAviso } from "@/lib/avisos-server";
import { ativarPlano, carregarConta, creditarAvulsos, creditosAtivos } from "@/lib/creditos";
import { carregarPersonagem } from "@/lib/personagens";
import type { PlanoPago } from "@/lib/planos";
import { pontosDoSorteio } from "@/lib/pontos-server";
import { getObjectBuffer, ownsKey } from "@/lib/storage/s3";
import type { Character } from "@/lib/types";
import { CONTAGEM_S, DURACAO_S } from "./corrida";
import { desenharCorredor } from "./corredor";
import {
  corDoCorredor,
  creditosDoPresente,
  nomePremio,
  reais,
  type Entrega,
  type MinhaParticipacao,
  type Premio,
  type SorteioPublico,
  type StatusSorteio,
  type TipoPremio,
} from "./tipos";

/**
 * Sorteio de gift no servidor (tabelas sorteios e sorteio_participantes,
 * migrations 0046 a 0049). O ganhador sai de `crypto.randomInt` na largada,
 * entre quem está participando; a corrida só encena. Quando o ganhador cruza
 * a linha (o primeiro pedido depois disso, de qualquer tela), o sorteio
 * conclui e o prêmio é entregue uma vez só:
 *  - plano: conta no Grátis ganha o plano até daqui a N meses, sem assinatura
 *    (não renova; ao vencer, volta ao Grátis); conta que já paga ganha os
 *    créditos do plano como avulsos (não mexe na assinatura do Stripe);
 *  - créditos / pontos: a quantidade sorteada, direto na conta;
 *  - Pix: fica pendente — o ganhador informa a chave na página do sorteio e
 *    o admin paga à mão e marca como pago.
 */
export interface SorteioRow {
  id: string;
  titulo: string;
  premio: TipoPremio;
  plano: PlanoPago | null;
  meses: number | null;
  /** Créditos, pontos ou centavos do Pix. */
  quantidade: number | null;
  status: StatusSorteio;
  criado_por: string;
  criado_em: Date;
  largada_em: Date | null;
  semente: string | number | null;
  ordem: string[] | null;
  vencedor_id: string | null;
  entrega: Entrega | null;
  concluido_em: Date | null;
}

interface ParticipanteRow {
  id: string;
  user_id: string;
  nome: string;
  character_id: string | null;
  imagem_key: string | null;
  tem_foto: boolean;
  tem_corpo: boolean;
}

/** Quanto tempo depois de concluído o sorteio ainda aparece (para ver o resultado). */
const MOSTRA_RESULTADO_H = 12;

/** Quando o ganhador cruza a linha (ms desde o começo da contagem). */
const CHEGADA_MS = (CONTAGEM_S + DURACAO_S) * 1000;

export class ErroSorteio extends Error {}

/** O prêmio guardado na linha do sorteio. */
export function premioDe(s: Pick<SorteioRow, "premio" | "plano" | "meses" | "quantidade">): Premio {
  if (s.premio === "creditos") return { tipo: "creditos", quantidade: s.quantidade ?? 0 };
  if (s.premio === "pontos") return { tipo: "pontos", quantidade: s.quantidade ?? 0 };
  if (s.premio === "pix") return { tipo: "pix", centavos: s.quantidade ?? 0 };
  return { tipo: "plano", plano: s.plano ?? "starter", meses: s.meses ?? 1 };
}

export async function carregarSorteio(pool: Pool, id: string): Promise<SorteioRow | null> {
  const { rows } = await pool.query<SorteioRow>("select * from sorteios where id = $1", [id]);
  return rows[0] ?? null;
}

/** O sorteio da vez: o que está aberto ou correndo, ou o que acabou há pouco. */
export async function sorteioAtual(pool: Pool): Promise<SorteioRow | null> {
  const { rows } = await pool.query<SorteioRow>(
    `select * from sorteios
      where status in ('aberto', 'fechado', 'correndo')
         or (status = 'concluido' and concluido_em > now() - make_interval(hours => $1))
      order by criado_em desc limit 1`,
    [MOSTRA_RESULTADO_H],
  );
  return rows[0] ?? null;
}

async function participantes(pool: Pool, sorteioId: string): Promise<ParticipanteRow[]> {
  const { rows } = await pool.query<ParticipanteRow>(
    `select id, user_id, nome, character_id, imagem_key, foto is not null as tem_foto, corpo is not null as tem_corpo
       from sorteio_participantes where sorteio_id = $1 and not removido
      order by criado_em, id`,
    [sorteioId],
  );
  return rows;
}

// O influencer (ou a foto enviada) vai no endereço. A figura só aparece quando fica pronta
// (uns 15 s depois de entrar): até lá, as telas desenham o boneco com o rosto.
const versao = (p: ParticipanteRow) => `?v=${encodeURIComponent(p.character_id ?? p.imagem_key?.split("/").pop() ?? "")}`;
const fotoUrl = (p: ParticipanteRow) => (p.tem_foto ? `/api/sorteio/foto/${p.id}${versao(p)}` : null);
const corpoUrl = (p: ParticipanteRow) => (p.tem_corpo ? `/api/sorteio/corredor/${p.id}${versao(p)}` : null);

/** O sorteio para as telas: os corredores (na ordem da corrida, depois da largada) e a receita. */
export async function sorteioPublico(pool: Pool, s: SorteioRow): Promise<SorteioPublico> {
  const lista = await participantes(pool, s.id);
  const corredor = (p: ParticipanteRow) => ({ id: p.id, nome: p.nome, cor: corDoCorredor(p.id), foto: fotoUrl(p), corpo: corpoUrl(p) });
  let corredores = lista.map(corredor);
  let vencedor: number | null = null;
  if (s.ordem && (s.status === "correndo" || s.status === "concluido")) {
    // A ordem da largada vale até o fim (mesmo se alguém sair da plataforma).
    const porId = new Map(lista.map((p) => [p.id, p]));
    corredores = s.ordem.map(
      (id) => (porId.get(id) ? corredor(porId.get(id)!) : { id, nome: "—", cor: corDoCorredor(id), foto: null, corpo: null }),
    );
    vencedor = s.vencedor_id ? s.ordem.indexOf(s.vencedor_id) : null;
  }
  return {
    id: s.id,
    titulo: s.titulo,
    premio: premioDe(s),
    status: s.status,
    corredores,
    largadaEm: s.largada_em ? new Date(s.largada_em).getTime() : null,
    semente: s.semente === null ? null : Number(s.semente),
    vencedor,
    agora: Date.now(),
  };
}

export async function minhaParticipacao(pool: Pool, sorteioId: string, userId: string): Promise<MinhaParticipacao | null> {
  const { rows } = await pool.query<{ id: string; nome: string; character_id: string | null; imagem_key: string | null }>(
    "select id, nome, character_id, imagem_key from sorteio_participantes where sorteio_id = $1 and user_id = $2 and not removido",
    [sorteioId, userId],
  );
  const r = rows[0];
  return r ? { id: r.id, nome: r.nome, characterId: r.character_id, fotoKey: r.imagem_key } : null;
}

/** A capa do influencer: a escolhida, senão o retrato mais recente, senão a 1ª referência. */
export function capaDoPersonagem(c: Character): string | null {
  if (c.visual.capaKey) return c.visual.capaKey;
  const retrato = (c.geradas ?? [])
    .filter((g) => g.tipo === "retrato")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return retrato?.key ?? c.visual.referencias.find((r) => r.key)?.key ?? null;
}

/** Rosto para a corrida: quadrado de 256 px, recortado onde a foto chama atenção (o rosto). */
export async function rostoParaCorrida(foto: Buffer): Promise<Buffer> {
  return sharp(foto)
    .rotate()
    .resize(256, 256, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/**
 * Entra no sorteio — de uma vez: depois de entrar, não dá para trocar o nome
 * nem quem corre (o mesmo pedido de novo só devolve a participação). Quem
 * corre é um influencer da conta, uma foto enviada (para quem não tem
 * influencer, ou prefere) ou o boneco genérico. Com influencer ou foto, a
 * corrida ganha o rosto (para a classificação) e a figura correndo
 * (lib/sorteio/corredor.ts) — cópias públicas: as fotos da conta são
 * privadas, a corrida é vista por todos. A vaga é garantida antes de desenhar
 * (uns 15 s): se o admin fechar ou largar nesse meio-tempo, a pessoa corre
 * assim mesmo, com o boneco e o rosto até a figura ficar pronta (se desenhar
 * falhar, fica o boneco).
 */
export async function participar(
  pool: Pool,
  s3: S3Client | null,
  o: { userId: string; sorteioId: string; nome: string; characterId: string | null; fotoKey?: string | null },
): Promise<MinhaParticipacao> {
  const fotoKey = o.characterId ? null : (o.fotoKey ?? null);
  if (fotoKey && !ownsKey(o.userId, fotoKey)) throw new ErroSorteio("Foto não encontrada.");
  const s = await carregarSorteio(pool, o.sorteioId);
  if (!s || s.status !== "aberto") throw new ErroSorteio("As inscrições deste sorteio estão fechadas.");
  const { rows: antes } = await pool.query<{
    id: string;
    nome: string;
    character_id: string | null;
    imagem_key: string | null;
    removido: boolean;
  }>(
    `select id, nome, character_id, imagem_key, removido
       from sorteio_participantes where sorteio_id = $1 and user_id = $2`,
    [o.sorteioId, o.userId],
  );
  const anterior = antes[0];
  if (anterior?.removido) throw new ErroSorteio("Você não pode participar deste sorteio.");
  if (anterior) {
    if (anterior.nome !== o.nome || anterior.character_id !== o.characterId || anterior.imagem_key !== fotoKey)
      throw new ErroSorteio("Você já está no sorteio — depois de entrar, não dá para trocar.");
    return { id: anterior.id, nome: anterior.nome, characterId: anterior.character_id, fotoKey: anterior.imagem_key };
  }
  let origem: string | null = fotoKey;
  if (o.characterId) {
    const c = await carregarPersonagem(o.userId, o.characterId);
    if (!c) throw new ErroSorteio("Influencer não encontrado.");
    const key = capaDoPersonagem(c);
    origem = key && ownsKey(o.userId, key) ? key : null;
  }
  // O rosto é rápido (uns décimos de segundo) e já entra com a vaga.
  let original: Buffer | null = null;
  let foto: Buffer | null = null;
  if (origem && s3) {
    try {
      original = await getObjectBuffer(s3, origem);
      foto = await rostoParaCorrida(original);
    } catch (e) {
      console.warn("[sorteio] rosto do corredor", (e as Error).message);
    }
  }
  // Só entra com as inscrições abertas.
  const { rows } = await pool.query<{ id: string; nome: string; character_id: string | null; imagem_key: string | null }>(
    `insert into sorteio_participantes (id, sorteio_id, user_id, nome, character_id, imagem_key, foto)
     select $1, $2, $3, $4, $5, $7, $6
      where exists (select 1 from sorteios where id = $2 and status = 'aberto')
     on conflict (sorteio_id, user_id) do nothing
     returning id, nome, character_id, imagem_key`,
    [nanoid(12), o.sorteioId, o.userId, o.nome, o.characterId, foto, fotoKey],
  );
  const r = rows[0];
  if (!r) {
    // Outro pedido da mesma conta entrou antes deste.
    if (await minhaParticipacao(pool, o.sorteioId, o.userId))
      throw new ErroSorteio("Você já está no sorteio — depois de entrar, não dá para trocar.");
    throw new ErroSorteio("As inscrições deste sorteio estão fechadas.");
  }
  // A figura correndo vem depois, com a vaga garantida (vale mesmo se a corrida já largou).
  if (original) {
    try {
      const corpo = await desenharCorredor(original);
      await pool.query("update sorteio_participantes set corpo = $2 where id = $1", [r.id, corpo]);
    } catch (e) {
      console.warn("[sorteio] figura do corredor", (e as Error).message);
    }
  }
  return { id: r.id, nome: r.nome, characterId: r.character_id, fotoKey: r.imagem_key };
}

/** Sai do sorteio (só com as inscrições abertas). */
export async function sairDoSorteio(pool: Pool, userId: string, sorteioId: string): Promise<void> {
  await pool.query(
    `delete from sorteio_participantes p using sorteios s
      where p.sorteio_id = s.id and s.id = $1 and p.user_id = $2 and s.status = 'aberto' and not p.removido`,
    [sorteioId, userId],
  );
}

/**
 * Imagem do corredor — o rosto (`foto`, JPEG) ou o influencer correndo
 * (`corpo`, WebP). Pública: quem tem o id dele está vendo a corrida.
 */
export async function imagemDoCorredor(pool: Pool, participanteId: string, qual: "foto" | "corpo"): Promise<Buffer | null> {
  const { rows } = await pool.query<{ img: Buffer | Uint8Array | null }>(
    `select ${qual === "corpo" ? "corpo" : "foto"} as img from sorteio_participantes where id = $1 and not removido`,
    [participanteId],
  );
  const f = rows[0]?.img;
  return f ? Buffer.from(f) : null;
}

/* ------------------------------------------------------------------ */
/* Admin                                                                */
/* ------------------------------------------------------------------ */

export async function criarSorteio(
  pool: Pool,
  o: { titulo: string; premio: Premio; adminEmail: string },
): Promise<SorteioRow> {
  const aberto = await pool.query("select 1 from sorteios where status in ('aberto', 'fechado', 'correndo') limit 1");
  if (aberto.rowCount) throw new ErroSorteio("Já existe um sorteio em andamento. Conclua ou cancele antes de criar outro.");
  const p = o.premio;
  const { rows } = await pool.query<SorteioRow>(
    `insert into sorteios (id, titulo, premio, plano, meses, quantidade, criado_por)
     values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [
      nanoid(12),
      o.titulo,
      p.tipo,
      p.tipo === "plano" ? p.plano : null,
      p.tipo === "plano" ? p.meses : null,
      p.tipo === "creditos" || p.tipo === "pontos" ? p.quantidade : p.tipo === "pix" ? p.centavos : null,
      o.adminEmail,
    ],
  );
  return rows[0];
}

/** Fecha ou reabre as inscrições. */
export async function mudarInscricoes(pool: Pool, id: string, abrir: boolean): Promise<SorteioRow> {
  const { rows } = await pool.query<SorteioRow>(
    `update sorteios set status = $2 where id = $1 and status = $3 returning *`,
    [id, abrir ? "aberto" : "fechado", abrir ? "fechado" : "aberto"],
  );
  if (!rows[0]) throw new ErroSorteio(abrir ? "Só dá para reabrir um sorteio fechado." : "Só dá para fechar um sorteio aberto.");
  return rows[0];
}

/**
 * Larga a corrida: sorteia o ganhador entre quem está participando (crypto),
 * guarda a ordem dos corredores e a semente. A contagem começa agora.
 */
export async function largar(pool: Pool, id: string): Promise<SorteioRow> {
  const lista = await participantes(pool, id);
  if (!lista.length) throw new ErroSorteio("Ninguém está participando ainda.");
  const ordem = lista.map((p) => p.id);
  const vencedor = ordem[randomInt(ordem.length)];
  // A largada sai do relógio deste servidor — o mesmo do `agora` que as telas
  // usam para sincronizar e da hora de concluir. O relógio do banco pode estar
  // adiantado ou atrasado (no teste, 57 s): a corrida ficava presa na contagem.
  const { rows } = await pool.query<SorteioRow>(
    `update sorteios set status = 'correndo', largada_em = $5, semente = $2, ordem = $3, vencedor_id = $4
      where id = $1 and status in ('aberto', 'fechado') returning *`,
    [id, randomInt(2 ** 31), JSON.stringify(ordem), vencedor, new Date()],
  );
  if (!rows[0]) throw new ErroSorteio("Este sorteio já largou ou foi cancelado.");
  return rows[0];
}

export async function cancelarSorteio(pool: Pool, id: string): Promise<SorteioRow> {
  const { rows } = await pool.query<SorteioRow>(
    `update sorteios set status = 'cancelado' where id = $1 and status in ('aberto', 'fechado') returning *`,
    [id],
  );
  if (!rows[0]) throw new ErroSorteio("Só dá para cancelar antes da largada.");
  return rows[0];
}

/** Tira um participante (nome ofensivo, conta repetida…) antes da largada. */
export async function removerParticipante(pool: Pool, sorteioId: string, participanteId: string): Promise<void> {
  const { rowCount } = await pool.query(
    `update sorteio_participantes p set removido = true from sorteios s
      where p.sorteio_id = s.id and s.id = $1 and p.id = $2 and s.status in ('aberto', 'fechado')`,
    [sorteioId, participanteId],
  );
  if (!rowCount) throw new ErroSorteio("Só dá para tirar alguém antes da largada.");
}

/* ------------------------------------------------------------------ */
/* Fim da corrida e entrega                                             */
/* ------------------------------------------------------------------ */

/**
 * O ganhador já cruzou a linha? Conclui o sorteio e entrega o presente. Só
 * quem muda o status de "correndo" para "concluido" entrega: chamar de novo
 * (ou de várias telas ao mesmo tempo) não entrega duas vezes.
 */
export async function concluirSeAcabou(pool: Pool, s: SorteioRow, agora = Date.now()): Promise<SorteioRow> {
  if (s.status !== "correndo" || !s.largada_em || !s.vencedor_id) return s;
  if (agora < new Date(s.largada_em).getTime() + CHEGADA_MS) return s;
  const { rows } = await pool.query<SorteioRow>(
    `update sorteios set status = 'concluido', concluido_em = now() where id = $1 and status = 'correndo' returning *`,
    [s.id],
  );
  if (!rows[0]) return (await carregarSorteio(pool, s.id)) ?? s;
  const { rows: v } = await pool.query<{ user_id: string }>(
    "select user_id from sorteio_participantes where id = $1",
    [s.vencedor_id],
  );
  if (!v[0]) return rows[0]; // a conta do ganhador foi excluída no meio da corrida
  let entrega: Entrega | null = null;
  try {
    entrega = await entregarPresente(v[0].user_id, s);
  } catch (e) {
    // Não tenta de novo sozinho (poderia entregar duas vezes): fica "—" na lista
    // do admin, que entrega à mão pela aba Usuários.
    console.error("[sorteio] entrega falhou", s.id, e);
    return rows[0];
  }
  const { rows: final } = await pool.query<SorteioRow>(
    "update sorteios set entrega = $2 where id = $1 returning *",
    [s.id, entrega ? JSON.stringify(entrega) : null],
  );
  if (entrega)
    await criarAviso(v[0].user_id, {
      rotulo: avisoDoGanhador(premioDe(s), entrega),
      href: "/app/sorteio",
      chave: `sorteio:${s.id}`,
    });
  return final[0] ?? rows[0];
}

/** O aviso no sino de quem ganhou. */
function avisoDoGanhador(p: Premio, e: Entrega): string {
  if (e.tipo === "plano") return `Você ganhou o sorteio! ${nomePremio(p)} ativado, sem renovação automática.`;
  if (e.tipo === "creditos")
    return `Você ganhou o sorteio! ${e.creditos.toLocaleString("pt-BR")} créditos${e.plano ? ` do ${nomePremio(p)}` : ""} na sua conta.`;
  if (e.tipo === "pontos") return `Você ganhou o sorteio! ${e.pontos.toLocaleString("pt-BR")} pontos na sua conta.`;
  return `Você ganhou ${reais(e.centavos)} no sorteio! Informe sua chave Pix na página do sorteio para receber.`;
}

/** Entrega o prêmio na conta do ganhador (ver a regra no topo). */
export async function entregarPresente(
  userId: string,
  s: Pick<SorteioRow, "id" | "premio" | "plano" | "meses" | "quantidade">,
): Promise<Entrega | null> {
  const p = premioDe(s);
  const ref = `sorteio:${s.id}`;
  // Pix e pontos não dependem da conta de créditos.
  if (p.tipo === "pix") return { tipo: "pix", centavos: p.centavos };
  if (p.tipo === "pontos") {
    await pontosDoSorteio(userId, p.quantidade, s.id);
    return { tipo: "pontos", pontos: p.quantidade };
  }
  if (!creditosAtivos()) return null;
  if (p.tipo === "creditos") {
    await creditarAvulsos(userId, p.quantidade, "sorteio", ref);
    return { tipo: "creditos", creditos: p.quantidade };
  }
  const conta = await carregarConta(userId);
  if (conta.plano !== "gratis") {
    const creditos = creditosDoPresente(p.plano, p.meses);
    await creditarAvulsos(userId, creditos, "sorteio", ref);
    return { tipo: "creditos", plano: p.plano, creditos };
  }
  const ate = new Date();
  ate.setMonth(ate.getMonth() + p.meses);
  await ativarPlano(userId, p.plano, p.meses >= 12 ? "anual" : "mensal", ate, { ref });
  return { tipo: "plano", plano: p.plano, ate: ate.toISOString() };
}

/* ------------------------------------------------------------------ */
/* Pix (pagamento à mão)                                                */
/* ------------------------------------------------------------------ */

/**
 * O ganhador de um prêmio em Pix informa (ou corrige) a chave e o nome do
 * titular. Só quem ganhou, depois da corrida e antes de o admin pagar.
 */
export async function informarPix(
  pool: Pool,
  o: { userId: string; sorteioId: string; chave: string; titular: string },
): Promise<Entrega> {
  const { rows } = await pool.query<{ entrega: Entrega | null }>(
    `update sorteios s
        set entrega = coalesce(s.entrega, '{}'::jsonb) || jsonb_build_object('chave', $3::text, 'titular', $4::text, 'informadoEm', now())
       from sorteio_participantes p
      where s.id = $1 and p.id = s.vencedor_id and p.user_id = $2
        and s.status = 'concluido' and s.premio = 'pix'
        and s.entrega is not null and s.entrega->>'pagoEm' is null
      returning s.entrega`,
    [o.sorteioId, o.userId, o.chave, o.titular],
  );
  if (!rows[0]?.entrega) throw new ErroSorteio("Não dá para informar a chave Pix deste sorteio.");
  return rows[0].entrega;
}

/** O admin pagou o Pix: marca como pago e avisa o ganhador. */
export async function marcarPixPago(pool: Pool, sorteioId: string): Promise<void> {
  const { rows } = await pool.query<{ user_id: string; entrega: Entrega }>(
    `update sorteios s set entrega = s.entrega || jsonb_build_object('pagoEm', now())
       from sorteio_participantes p
      where s.id = $1 and p.id = s.vencedor_id and s.premio = 'pix' and s.status = 'concluido'
        and s.entrega->>'chave' is not null and s.entrega->>'pagoEm' is null
      returning p.user_id, s.entrega`,
    [sorteioId],
  );
  if (!rows[0]) throw new ErroSorteio("O ganhador ainda não informou a chave Pix (ou o Pix já foi pago).");
  const e = rows[0].entrega;
  if (e.tipo === "pix")
    await criarAviso(rows[0].user_id, {
      rotulo: `Pagamos ${reais(e.centavos)} do sorteio no seu Pix.`,
      href: "/app/sorteio",
      chave: `sorteio-pix:${sorteioId}`,
    });
}

/* ------------------------------------------------------------------ */
/* Listas do admin                                                      */
/* ------------------------------------------------------------------ */

export interface SorteioAdmin {
  id: string;
  titulo: string;
  premio: Premio;
  status: StatusSorteio;
  criadoEm: string;
  criadoPor: string;
  participantes: number;
  ganhador: { nome: string; email: string; userId: string } | null;
  entrega: Entrega | null;
}

export async function listarSorteios(pool: Pool): Promise<SorteioAdmin[]> {
  const { rows } = await pool.query<
    SorteioRow & { total: string; g_nome: string | null; g_email: string | null; g_user: string | null }
  >(
    `select s.*,
            (select count(*) from sorteio_participantes p where p.sorteio_id = s.id and not p.removido) as total,
            g.nome as g_nome, u.email as g_email, g.user_id as g_user
       from sorteios s
       left join sorteio_participantes g on g.id = s.vencedor_id
       left join "user" u on u.id = g.user_id
      order by s.criado_em desc limit 30`,
  );
  return rows.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    premio: premioDe(r),
    status: r.status,
    criadoEm: new Date(r.criado_em).toISOString(),
    criadoPor: r.criado_por,
    participantes: Number(r.total),
    ganhador: r.status === "concluido" && r.g_user ? { nome: r.g_nome ?? "", email: r.g_email ?? "", userId: r.g_user } : null,
    entrega: r.entrega,
  }));
}

export interface ParticipanteAdmin {
  id: string;
  nome: string;
  email: string;
  userId: string;
  foto: string | null;
  removido: boolean;
  criadoEm: string;
}

export async function participantesAdmin(pool: Pool, sorteioId: string): Promise<ParticipanteAdmin[]> {
  const { rows } = await pool.query<{
    id: string;
    nome: string;
    email: string;
    user_id: string;
    tem_foto: boolean;
    removido: boolean;
    criado_em: Date;
  }>(
    `select p.id, p.nome, u.email, p.user_id, p.foto is not null as tem_foto, p.removido, p.criado_em
       from sorteio_participantes p join "user" u on u.id = p.user_id
      where p.sorteio_id = $1 order by p.criado_em, p.id`,
    [sorteioId],
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    email: r.email,
    userId: r.user_id,
    foto: r.tem_foto ? `/api/sorteio/foto/${r.id}` : null,
    removido: r.removido,
    criadoEm: new Date(r.criado_em).toISOString(),
  }));
}
