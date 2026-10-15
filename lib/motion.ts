import type { Pool } from "@neondatabase/serverless";
import type {
  FormatoMotion,
  InputMotion,
  ProgressoMotion,
  RenderMotion,
  StatusMotion,
  TipoMotion,
  UsoMotion,
} from "@/worker/motion/tipos";

/**
 * Motion no app (tela /app/motion, em teste: lib/em-teste.ts): os pedidos
 * ficam na tabela `motions` e o processo worker/motion faz o trabalho (ver
 * worker/motion). Aqui, o que a tela lista de cada pedido. Os créditos ficam em
 * lib/motion-creditos.ts.
 */

export interface ItemMotion {
  id: string;
  status: StatusMotion;
  tipo: TipoMotion;
  modelo: string;
  esforco: string | null;
  brief: string;
  formato: FormatoMotion;
  duracao: number;
  /** Nome do produto ou endereço do site, para reconhecer na lista. */
  assunto: string;
  /** Ajuste de outro motion: o pedido de mudança. */
  ajuste: string | null;
  baseId: string | null;
  render: RenderMotion | null;
  videoKey: string | null;
  renderErro: string | null;
  /** Música de fundo do MP4 (escolhida no painel). */
  musica: InputMotion["musica"] | null;
  progresso: ProgressoMotion | null;
  uso: UsoMotion | null;
  erro: string | null;
  /** Em andamento, mas sem sinal do worker há mais de 10 min. */
  parado: boolean;
  criadoEm: string;
}

interface Linha {
  id: string;
  status: StatusMotion;
  tipo: TipoMotion;
  modelo: string;
  esforco: string | null;
  brief: string | null;
  formato: FormatoMotion;
  duracao: number;
  produto: string | null;
  site: string | null;
  ajuste: string | null;
  base_id: string | null;
  render: RenderMotion | null;
  video_key: string | null;
  render_erro: string | null;
  musica: InputMotion["musica"] | null;
  progresso: ProgressoMotion | null;
  uso: UsoMotion | null;
  error: string | null;
  parado: boolean;
  created_at: Date;
}

/** Os motions da conta (ou um só), dos mais novos para os mais antigos. */
export async function listarMotions(pool: Pool, userId: string, id?: string): Promise<ItemMotion[]> {
  const { rows } = await pool.query<Linha>(
    `select id, status, tipo, modelo, esforco, input->>'brief' as brief, input->>'formato' as formato,
            (input->>'duracao')::int as duracao, input->'produto'->>'nome' as produto, input->'site'->>'url' as site,
            input->'ajuste'->>'pedido' as ajuste, input->'ajuste'->>'baseId' as base_id,
            render, video_key, render_erro, input->'musica' as musica, progresso, uso, error, created_at,
            coalesce((status in ('na_fila', 'gerando') or render in ('na_fila', 'renderizando'))
                     and vivo_em < now() - interval '10 minutes', false) as parado
       from motions where user_id = $1 ${id ? "and id = $2" : ""}
      order by created_at desc limit 60`,
    id ? [userId, id] : [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    tipo: r.tipo,
    modelo: r.modelo,
    esforco: r.esforco,
    brief: r.brief ?? "",
    formato: r.formato,
    duracao: r.duracao,
    assunto: r.produto || r.site || "",
    ajuste: r.ajuste,
    baseId: r.base_id,
    render: r.render,
    videoKey: r.video_key,
    renderErro: r.render_erro,
    musica: r.musica,
    progresso: r.progresso,
    uso: r.uso,
    erro: r.error,
    parado: r.parado,
    criadoEm: r.created_at.toISOString(),
  }));
}

/** O worker deu sinal de vida no último minuto e meio? */
export async function workerLigado(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query<{ vivo: boolean }>(
    "select exists(select 1 from motion_worker where vivo_em > now() - interval '90 seconds') as vivo",
  );
  return !!rows[0]?.vivo;
}
