import { getPool } from "@/lib/db";
import { getFal } from "@/lib/fal";
import { estornarSeHouver, type Cobranca } from "@/lib/creditos";
import { somarArmazenamento } from "@/lib/limites";
import { getS3, newKey, putObject } from "@/lib/storage/s3";
import type { Character, VideoArquivo } from "@/lib/types";
import { consultarJob, type Provedor } from "./jobs";
import { comporLegendaIA, estadoLegendaIA, type InputLegendaIA } from "./legenda-ia";
import { comporTroca, ehModeloTroca, estadoTroca, type InputTroca } from "./troca";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { S3Client } from "@aws-sdk/client-s3";
import { uploadFromFile } from "@/lib/storage/s3";
import { estadoTreino } from "@/lib/persona/server";
import { comPastaTemporaria } from "./server";

/**
 * Finalização de jobs de vídeo, chamada de três lugares:
 *  - a tela (GET /api/videos/jobs/[id], a cada 10s enquanto a página está aberta);
 *  - o webhook do fal (POST /api/videos/webhook), assim que o serviço termina;
 *  - o cron (GET /api/cron/video-jobs), que varre os pendentes — cobre o Runway,
 *    que não tem webhook, e qualquer webhook perdido.
 * Idempotente: um "claim" no banco garante que só uma chamada finaliza.
 * Ao terminar, também atualiza o vídeo dentro do personagem no banco — assim
 * ele aparece ao reabrir o app, mesmo que ninguém estivesse com a página aberta.
 */

export interface EstadoPublico {
  status: string;
  key?: string;
  duracao?: number;
  erro?: string;
  posicao?: number;
  progresso?: number;
}

interface Job {
  id: string;
  user_id: string;
  character_id: string;
  status: string;
  provedor: Provedor;
  tipo: string;
  modelo: string;
  fal_request_id: string;
  input: Record<string, unknown> & { cobranca?: Cobranca | null };
  duracao: number | null;
  result_key: string | null;
  error: string | null;
  travado: boolean;
}

/** Jobs pendentes há mais que isso viram erro (créditos devolvidos). */
const LIMITE_HORAS = 48;

export async function finalizarJob(id: string, userId?: string): Promise<EstadoPublico | null> {
  const pool = getPool();
  const s3 = getS3();
  if (!pool || !s3) return null;

  const { rows } = await pool.query<Job>(
    `select id, user_id, character_id, status, provedor, tipo, modelo, fal_request_id, input, duracao, result_key, error,
            (status = 'finalizando' and updated_at < now() - interval '5 minutes') as travado,
            created_at < now() - interval '${LIMITE_HORAS} hours' as expirou
     from video_jobs where id = $1 ${userId ? "and user_id = $2" : ""}`,
    userId ? [id, userId] : [id]
  );
  const job = rows[0] as (Job & { expirou: boolean }) | undefined;
  if (!job) return null;

  const publico = (p: Partial<EstadoPublico>): EstadoPublico => ({ duracao: job.duracao ?? undefined, ...p, status: p.status! });
  if (job.status === "concluido") return publico({ status: "concluido", key: job.result_key ?? undefined });
  if (job.status === "erro") return publico({ status: "erro", erro: job.error ?? undefined });
  if (job.status === "finalizando" && !job.travado) return publico({ status: "finalizando" });

  // Consulta o serviço.
  let concluido: { url?: string; urls?: string[]; lora?: string } | null = null;
  if (job.tipo.startsWith("treino_")) {
    const fal = getFal();
    if (!fal) return falhar(job, "fal.ai não configurado no servidor.");
    const e = await estadoTreino(fal, job.modelo, job.fal_request_id);
    if (e.estado === "erro") return falhar(job, e.mensagem);
    if (e.estado === "concluido") concluido = { lora: e.principal };
    else return emAndamento(job, e.estado, {});
  } else if (job.tipo === "legenda_ia" || ehModeloTroca(job.modelo)) {
    // Jobs em trechos: pronto quando todos os trechos terminam.
    const fal = getFal();
    if (!fal) return falhar(job, "fal.ai não configurado no servidor.");
    const e =
      job.tipo === "legenda_ia"
        ? await estadoLegendaIA(fal, (job.input as unknown as InputLegendaIA).segmentos)
        : await estadoTroca(fal, job.input as unknown as InputTroca);
    if (e.estado === "erro") return falhar(job, e.mensagem);
    if (e.estado === "concluido") concluido = { urls: e.urls };
    else return emAndamento(job, e.estado, { progresso: e.progresso });
  } else {
    const e = await consultarJob(job.provedor, job.modelo, job.fal_request_id);
    if (e.estado === "erro") return falhar(job, e.mensagem);
    if (e.estado === "concluido") concluido = { url: e.videoUrl };
    else
      return emAndamento(job, e.estado, {
        posicao: e.estado === "na_fila" ? e.posicao : undefined,
        progresso: e.estado === "processando" ? e.progresso : undefined,
      });
  }

  // Pronto no serviço: só uma chamada "pega" a finalização.
  const claim = await pool.query(
    `update video_jobs set status = 'finalizando', updated_at = now()
     where id = $1 and (status in ('na_fila', 'processando')
                        or (status = 'finalizando' and updated_at < now() - interval '5 minutes'))
     returning id`,
    [job.id]
  );
  if (!claim.rowCount) return publico({ status: "finalizando" });

  try {
    let key: string;
    let size: number;
    if (concluido.lora) {
      // Persona treinada: arquivos do LoRA vão pro S3 da conta; a persona fica pronta.
      ({ key, size } = await baixarParaS3(s3, job.user_id, concluido.lora));
      await pool.query("update personas_treino set status = 'pronto', key = $2, updated_at = now() where id = $1", [
        job.id,
        key,
      ]);
      await somarArmazenamento(job.user_id, size);
      await pool.query("update video_jobs set status = 'concluido', result_key = $2, updated_at = now() where id = $1", [
        job.id,
        key,
      ]);
      return publico({ status: "concluido", key });
    }
    if (concluido.urls && ehModeloTroca(job.modelo)) {
      ({ key, size } = await comporTroca({
        s3,
        userId: job.user_id,
        input: job.input as unknown as InputTroca,
        urls: concluido.urls,
      }));
    } else if (concluido.urls) {
      ({ key, size } = await comporLegendaIA({
        s3,
        userId: job.user_id,
        input: job.input as unknown as InputLegendaIA,
        urls: concluido.urls,
      }));
    } else {
      const res = await fetch(concluido.url!);
      if (!res.ok) throw new Error(`download do resultado falhou (HTTP ${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      key = newKey(job.user_id, "videos", "video/mp4");
      await putObject(s3, key, buf, "video/mp4");
      size = buf.length;
    }
    await somarArmazenamento(job.user_id, size);
    await pool.query("update video_jobs set status = 'concluido', result_key = $2, updated_at = now() where id = $1", [
      job.id,
      key,
    ]);
    await atualizarPersonagem(job, { key, size, status: undefined, erro: undefined, duracao: job.duracao ?? undefined });
    return publico({ status: "concluido", key });
  } catch (e) {
    console.error("[videos] finalizar:", job.id, e);
    // Volta pra "processando": a próxima chamada (tela, webhook ou cron) tenta de novo.
    await pool.query("update video_jobs set status = 'processando', updated_at = now() where id = $1", [job.id]);
    return publico({ status: "processando" });
  }

  async function emAndamento(
    j: Job & { expirou: boolean },
    status: "na_fila" | "processando",
    extra: Partial<EstadoPublico>
  ): Promise<EstadoPublico> {
    if (j.expirou) return falhar(j, "O serviço não terminou a tempo.");
    await pool!.query("update video_jobs set status = $2, updated_at = now() where id = $1 and status <> $2", [j.id, status]);
    return publico({ status, ...extra });
  }

  async function falhar(j: Job, mensagem: string): Promise<EstadoPublico> {
    // Só quem muda o status pra "erro" devolve os créditos (uma vez).
    const { rows: falhou } = await pool!.query<{ input: { cobranca?: Cobranca | null } }>(
      "update video_jobs set status = 'erro', error = $2, updated_at = now() where id = $1 and status <> 'erro' returning input",
      [j.id, mensagem]
    );
    const erro = `${mensagem} Os créditos foram devolvidos.`;
    if (falhou[0]) {
      await estornarSeHouver(falhou[0].input?.cobranca, j.tipo.startsWith("treino_") ? "estorno_treino" : "estorno_video");
      if (j.tipo.startsWith("treino_")) {
        await pool!.query("update personas_treino set status = 'erro', error = $2, updated_at = now() where id = $1", [
          j.id,
          erro,
        ]);
      } else {
        await atualizarPersonagem(j, { status: "erro", erro });
      }
    }
    return publico({ status: "erro", erro });
  }
}

/** Atualiza o vídeo do job dentro do personagem salvo no banco (se o personagem já sincronizou). */
async function atualizarPersonagem(job: Job, patch: Partial<VideoArquivo>): Promise<void> {
  const pool = getPool()!;
  const { rows } = await pool.query<{ data: Character }>(
    "select data from characters where id = $1 and user_id = $2",
    [job.character_id, job.user_id]
  );
  const data = rows[0]?.data;
  const video = data?.videos?.find((v) => v.jobId === job.id);
  if (!data || !video) return;
  Object.assign(video, patch);
  if (patch.status === undefined) {
    delete video.status;
    delete video.erro;
  }
  data.updatedAt = Date.now();
  await pool.query("update characters set data = $3, updated_at = now() where id = $1 and user_id = $2", [
    job.character_id,
    job.user_id,
    JSON.stringify(data),
  ]);
}

/** Ids dos jobs que o cron deve verificar (pendentes ou travados nas últimas 48h+). */
export async function jobsPendentes(limite = 25): Promise<string[]> {
  const { rows } = await getPool()!.query<{ id: string }>(
    `select id from video_jobs
     where status in ('na_fila', 'processando')
        or (status = 'finalizando' and updated_at < now() - interval '5 minutes')
     order by created_at limit $1`,
    [limite]
  );
  return rows.map((r) => r.id);
}

/** Baixa um arquivo grande (ex.: LoRA) direto pro disco e envia ao S3, sem carregar na memória. */
async function baixarParaS3(s3: S3Client, userId: string, url: string): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`download do modelo falhou (HTTP ${res.status})`);
    const arquivo = path.join(dir, "modelo.safetensors");
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(arquivo));
    const key = newKey(userId, "loras", "application/octet-stream");
    const size = await uploadFromFile(s3, key, arquivo, "application/octet-stream");
    return { key, size };
  });
}
