import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import {
  debitar,
  estornarParcial,
  estornarSeHouver,
  type Cobranca,
} from "@/lib/creditos";
import { hydrate } from "@/lib/defaults";
import { CREDITOS_RADAR, creditosRadar } from "@/lib/planos";
import type { Character } from "@/lib/types";
import { gerarRadar } from "./gerar";
import { grokDisponivel } from "./grok";
import {
  diaDeHoje,
  NOTA_DESTAQUE,
  temasDoPersonagem,
  type ItemRadar,
  type Radar,
  type StatusRadar,
} from "./tipos";

const pool = () => getPool()!;

interface Linha {
  id: string;
  character_id: string;
  dia: string | Date;
  status: StatusRadar;
  resumo: string | null;
  itens: ItemRadar[];
  temas: string[];
  com_x: boolean;
  visto_em: Date | null;
  created_at: Date;
}

const paraRadar = (l: Linha): Radar => ({
  id: l.id,
  characterId: l.character_id,
  dia:
    typeof l.dia === "string"
      ? l.dia.slice(0, 10)
      : l.dia.toISOString().slice(0, 10),
  status: l.status,
  resumo: l.resumo,
  itens: l.itens ?? [],
  temas: l.temas ?? [],
  comX: l.com_x,
  vistoEm: l.visto_em ? new Date(l.visto_em).toISOString() : null,
  criadoEm: new Date(l.created_at).toISOString(),
});

const COLUNAS =
  "id, character_id, to_char(dia, 'YYYY-MM-DD') as dia, status, resumo, itens, temas, com_x, visto_em, created_at";

/** Radares de um personagem, do mais recente para o mais antigo (até `limite` dias). */
export async function radaresDoPersonagem(
  userId: string,
  characterId: string,
  limite = 30,
): Promise<Radar[]> {
  const { rows } = await pool().query<Linha>(
    `select ${COLUNAS} from radares where user_id = $1 and character_id = $2 order by dia desc limit $3`,
    [userId, characterId, limite],
  );
  return rows.map(paraRadar);
}

export async function marcarVisto(
  userId: string,
  characterId: string,
): Promise<void> {
  await pool().query(
    "update radares set visto_em = now() where user_id = $1 and character_id = $2 and visto_em is null",
    [userId, characterId],
  );
}

/**
 * Grava a configuração do radar direto na ficha salva no servidor. A ficha
 * inteira também sincroniza sozinha, mas a tarefa diária lê DAQUI — então
 * ligar o radar e fechar a aba em seguida não pode depender dessa sincronia.
 */
export async function salvarConfiguracao(
  userId: string,
  characterId: string,
  cfg: { ativo: boolean; comX: boolean; temas: string[]; idioma: "pt" | "en" },
): Promise<boolean> {
  const { rowCount } = await pool().query(
    "update characters set data = jsonb_set(data, '{radar}', $3::jsonb, true) where id = $1 and user_id = $2",
    [characterId, userId, JSON.stringify(cfg)],
  );
  return !!rowCount;
}

/** Avisos: radares de ontem/hoje ainda não vistos que têm algum destaque. */
export async function avisosDoUsuario(
  userId: string,
): Promise<
  Array<{ characterId: string; dia: string; destaques: number; titulo: string }>
> {
  const { rows } = await pool().query<Linha>(
    `select ${COLUNAS} from radares
      where user_id = $1 and status = 'ok' and visto_em is null and dia >= current_date - 2
      order by dia desc`,
    [userId],
  );
  const vistos = new Set<string>();
  return rows
    .map(paraRadar)
    .filter((r) => !vistos.has(r.characterId) && vistos.add(r.characterId))
    .map((r) => {
      const d = r.itens.filter((i) => i.nota >= NOTA_DESTAQUE);
      return {
        characterId: r.characterId,
        dia: r.dia,
        destaques: d.length,
        titulo: d[0]?.titulo ?? "",
      };
    })
    .filter((a) => a.destaques > 0);
}

async function carregarPersonagem(
  userId: string,
  characterId: string,
): Promise<Character | null> {
  const { rows } = await pool().query<{ data: Character }>(
    "select data from characters where id = $1 and user_id = $2",
    [characterId, userId],
  );
  return rows[0] ? hydrate(rows[0].data) : null;
}

async function salvar(o: {
  userId: string;
  characterId: string;
  dia: string;
  status: StatusRadar;
  resumo: string | null;
  itens: ItemRadar[];
  temas: string[];
  comX: boolean;
  custo: unknown;
}): Promise<Radar> {
  const { rows } = await pool().query<Linha>(
    `insert into radares (id, user_id, character_id, dia, status, resumo, itens, temas, com_x, custo)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (character_id, dia) do update
       set status = excluded.status, resumo = excluded.resumo, itens = excluded.itens, temas = excluded.temas,
           com_x = excluded.com_x, custo = excluded.custo, visto_em = null, created_at = now()
     returning ${COLUNAS}`,
    [
      nanoid(12),
      o.userId,
      o.characterId,
      o.dia,
      o.status,
      o.resumo,
      JSON.stringify(o.itens),
      JSON.stringify(o.temas),
      o.comX,
      o.custo ? JSON.stringify(o.custo) : null,
    ],
  );
  return paraRadar(rows[0]);
}

export class RadarErro extends Error {
  constructor(
    message: string,
    public code: "SEM_TEMAS" | "SEM_CREDITOS" | "NAO_ENCONTRADO" | "FALHA",
  ) {
    super(message);
  }
}

/**
 * Gera (ou refaz) o radar de hoje de um personagem e cobra os créditos.
 * Se o X foi pedido mas não respondeu, a parte do X é devolvida.
 * `automatico` = veio da tarefa diária: sem saldo, grava o motivo em vez de falhar.
 */
export async function atualizarRadar(o: {
  userId: string;
  characterId: string;
  /** Sobrepõe a configuração salva na ficha (botão "Atualizar agora"). */
  comX?: boolean;
  /** Temas como estão na tela agora (a ficha pode ainda não ter sincronizado com o servidor). */
  temas?: string[];
  idioma?: "pt" | "en";
  automatico?: boolean;
}): Promise<Radar> {
  const character = await carregarPersonagem(o.userId, o.characterId);
  if (!character)
    throw new RadarErro("Personagem não encontrado.", "NAO_ENCONTRADO");
  const temas = o.temas?.length ? o.temas : temasDoPersonagem(character);
  if (!temas.length)
    throw new RadarErro(
      "Preencha o nicho do personagem ou adicione pelo menos um tema ao radar.",
      "SEM_TEMAS",
    );
  const comX = (o.comX ?? character.radar?.comX ?? false) && grokDisponivel();
  const idioma = o.idioma ?? character.radar?.idioma ?? "pt";
  const dia = diaDeHoje();
  const base = {
    userId: o.userId,
    characterId: o.characterId,
    dia,
    temas,
    comX,
  };

  const cobranca: Cobranca | null = await debitar(
    o.userId,
    creditosRadar(comX),
    "radar",
    comX ? "noticias+x" : "noticias",
  );
  if (!cobranca) {
    if (o.automatico)
      return salvar({
        ...base,
        status: "sem_creditos",
        resumo: null,
        itens: [],
        custo: null,
      });
    throw new RadarErro(
      `Créditos insuficientes: o radar custa ${creditosRadar(comX)}.`,
      "SEM_CREDITOS",
    );
  }
  try {
    const r = await gerarRadar({ character, temas, comX, idioma, hoje: dia });
    if (comX && !r.usouX) await estornarParcial(cobranca, CREDITOS_RADAR.x);
    return await salvar({
      ...base,
      comX: r.usouX,
      status: "ok",
      resumo: r.resumo,
      itens: r.itens,
      custo: r.custo,
    });
  } catch (e) {
    await estornarSeHouver(cobranca);
    if (o.automatico) {
      console.error("[radar] falhou para", o.characterId, (e as Error).message);
      return salvar({
        ...base,
        status: "erro",
        resumo: null,
        itens: [],
        custo: null,
      });
    }
    throw new RadarErro(
      (e as Error).message || "Não consegui montar o radar agora.",
      "FALHA",
    );
  }
}

/** Personagens com o radar diário ligado que ainda não têm radar hoje. */
export async function pendentesDeHoje(
  limite: number,
): Promise<Array<{ userId: string; characterId: string }>> {
  const { rows } = await pool().query<{ user_id: string; id: string }>(
    `select c.user_id, c.id from characters c
      where (c.data->'radar'->>'ativo')::boolean is true
        and not exists (select 1 from radares r where r.character_id = c.id and r.dia = $1)
      order by c.updated_at desc limit $2`,
    [diaDeHoje(), limite],
  );
  return rows.map((r) => ({ userId: r.user_id, characterId: r.id }));
}
