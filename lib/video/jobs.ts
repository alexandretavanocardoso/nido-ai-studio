import { getPool } from "@/lib/db";
import { consultarDecart } from "@/lib/live/decart";
import { consultar as consultarFal, getFal } from "./fal";
import { consultarRunway, getRunway } from "./runway";
import { consultarSapiens, getSapiens } from "./sapiens";
import { endpointFal } from "./wan";

/** Estado de um job de vídeo, igual para qualquer serviço. */
export type EstadoVideo =
  | { estado: "na_fila"; posicao?: number }
  | { estado: "processando"; progresso?: number }
  | { estado: "concluido"; videoUrl: string }
  | { estado: "erro"; mensagem: string };

/** "nido": o processo da Sombra (worker/sombra), que guarda o andamento no próprio job. */
export type Provedor = "fal" | "runway" | "sapiens" | "decart" | "nido";

/** Consulta o job no serviço que o processa (coluna `provedor` de video_jobs). */
export async function consultarJob(
  provedor: Provedor,
  modelo: string,
  idExterno: string,
): Promise<EstadoVideo> {
  if (provedor === "decart") return consultarDecart(idExterno);
  if (provedor === "nido") return consultarNido(idExterno);
  if (provedor === "sapiens") {
    const chave = getSapiens();
    if (!chave)
      return {
        estado: "erro",
        mensagem: "Sapiens não configurado no servidor.",
      };
    return consultarSapiens(chave, idExterno);
  }
  if (provedor === "runway") {
    const rw = getRunway();
    if (!rw)
      return {
        estado: "erro",
        mensagem: "Runway não configurado no servidor.",
      };
    return consultarRunway(rw, idExterno);
  }
  const fal = getFal();
  if (!fal)
    return { estado: "erro", mensagem: "fal.ai não configurado no servidor." };
  return consultarFal(fal, endpointFal(modelo), idExterno);
}

/** Se o processo da Sombra não pegar o vídeo em tanto tempo, ele não está ligado. */
const ESPERA_PROCESSO_MIN = 15;

/**
 * Andamento de um vídeo no processo da Sombra (worker/sombra): ele escreve em
 * `input.trabalho` (partes prontas, pronto com a key, ou o erro). Pronto vira
 * "nido:<key>" — o arquivo já está no S3.
 */
export async function consultarNido(jobId: string): Promise<EstadoVideo> {
  const pool = getPool();
  if (!pool) return { estado: "erro", mensagem: "Banco de dados não configurado." };
  const { rows } = await pool.query<{
    t: { estado?: string; total?: number; partes?: Record<string, unknown>; key?: string; erro?: string } | null;
    parado: boolean;
  }>(
    // Parado: esperando há muito tempo e nenhum vídeo da Sombra deu sinal de vida
    // nesse tempo (o processo faz um por vez: esperar na fila não é estar parado).
    `select input->'trabalho' as t,
            created_at < now() - interval '${ESPERA_PROCESSO_MIN} minutes'
            and not exists (
              select 1 from video_jobs o
               where o.provedor = 'nido'
                 and coalesce((o.input->'trabalho'->>'vivoEm')::bigint, 0) > $2::bigint
            ) as parado
       from video_jobs where id = $1`,
    [jobId, Date.now() - ESPERA_PROCESSO_MIN * 60_000],
  );
  const r = rows[0];
  if (!r) return { estado: "erro", mensagem: "Vídeo não encontrado." };
  const t = r.t;
  if (!t?.estado)
    return r.parado
      ? { estado: "erro", mensagem: "O processo da Sombra não está ligado (worker/sombra)." }
      : { estado: "na_fila" };
  if (t.estado === "concluido" && t.key) return { estado: "concluido", videoUrl: `nido:${t.key}` };
  if (t.estado === "erro") return { estado: "erro", mensagem: t.erro || "A troca falhou." };
  const feitas = Object.keys(t.partes ?? {}).length;
  return { estado: "processando", progresso: t.total ? feitas / t.total : undefined };
}

/** Resultado que o processo da Sombra já deixou no S3. */
export const keyDoNido = (url: string): string | null => (url.startsWith("nido:") ? url.slice(5) : null);
