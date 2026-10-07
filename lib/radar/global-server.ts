import { nanoid } from "nanoid";
import { getPool } from "@/lib/db";
import { gerarRadar } from "./gerar";
import { grokDisponivel } from "./grok";
import {
  idiomasDoRadarGlobal,
  NICHOS_GLOBAIS,
  nichoGlobal,
  perfilDoNicho,
  type IdiomaRadar,
  type RadarGlobal,
} from "./global";
import { diaDeHoje, type ItemRadar } from "./tipos";

const pool = () => getPool()!;

interface Linha {
  id: string;
  nicho: string;
  idioma: IdiomaRadar;
  dia: string;
  resumo: string | null;
  itens: ItemRadar[];
  com_x: boolean;
  created_at: Date;
}

const COLUNAS =
  "id, nicho, idioma, to_char(dia, 'YYYY-MM-DD') as dia, resumo, itens, com_x, created_at";

const paraRadar = (l: Linha): RadarGlobal => ({
  id: l.id,
  nicho: l.nicho,
  idioma: l.idioma,
  dia: l.dia,
  resumo: l.resumo,
  itens: l.itens ?? [],
  comX: l.com_x,
  criadoEm: new Date(l.created_at).toISOString(),
});

/** Radares globais dos últimos `dias` dias num idioma, do mais recente para o mais antigo. */
export async function radaresGlobais(
  idioma: IdiomaRadar,
  dias = 14,
): Promise<RadarGlobal[]> {
  const { rows } = await pool().query<Linha>(
    `select ${COLUNAS} from radares_globais
      where idioma = $1 and dia > $2::date - $3::int
      order by dia desc`,
    [idioma, diaDeHoje(), dias],
  );
  return rows.map(paraRadar);
}

/** O radar global usa o X quando há chave, a menos que RADAR_GLOBAL_X=0. */
export const globalComX = () =>
  grokDisponivel() && process.env.RADAR_GLOBAL_X?.trim() !== "0";

/** Monta (ou refaz) o radar de hoje de um nicho num idioma. Quem paga é a plataforma. */
export async function gerarRadarGlobal(
  nichoId: string,
  idioma: IdiomaRadar,
): Promise<RadarGlobal> {
  const nicho = nichoGlobal(nichoId);
  if (!nicho) throw new Error(`Nicho desconhecido: ${nichoId}`);
  const dia = diaDeHoje();
  const temas = nicho.temas[idioma];
  const r = await gerarRadar({
    perfil: perfilDoNicho(nicho, idioma),
    temas,
    // Só o tema principal vai para o X: cada tema é uma busca paga.
    temasX: temas.slice(0, 1),
    comX: globalComX(),
    idioma,
    hoje: dia,
  });
  const { rows } = await pool().query<Linha>(
    `insert into radares_globais (id, nicho, idioma, dia, resumo, itens, com_x, custo)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (nicho, idioma, dia) do update
       set resumo = excluded.resumo, itens = excluded.itens, com_x = excluded.com_x,
           custo = excluded.custo, created_at = now()
     returning ${COLUNAS}`,
    [
      nanoid(12),
      nicho.id,
      idioma,
      dia,
      r.resumo,
      JSON.stringify(r.itens),
      r.usouX,
      JSON.stringify(r.custo),
    ],
  );
  return paraRadar(rows[0]);
}

/** Combinações nicho × idioma que ainda não têm radar hoje. */
export async function globaisPendentesDeHoje(): Promise<
  Array<{ nicho: string; idioma: IdiomaRadar }>
> {
  const { rows } = await pool().query<{ nicho: string; idioma: string }>(
    "select nicho, idioma from radares_globais where dia = $1",
    [diaDeHoje()],
  );
  const feitos = new Set(rows.map((r) => `${r.nicho}:${r.idioma}`));
  return idiomasDoRadarGlobal()
    .flatMap((idioma) => NICHOS_GLOBAIS.map((n) => ({ nicho: n.id, idioma })))
    .filter((p) => !feitos.has(`${p.nicho}:${p.idioma}`));
}
