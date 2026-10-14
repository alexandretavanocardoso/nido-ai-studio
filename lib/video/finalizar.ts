import {
  videoParaFigurinha,
  type FigurinhaAnimada,
} from "./figurinha-animada";
import { criarAviso } from "@/lib/avisos-server";
import { missaoCumprida } from "@/lib/pontos-server";
import { getPool } from "@/lib/db";
import { getFal } from "@/lib/fal";
import { estornarSeHouver, type Cobranca } from "@/lib/creditos";
import { somarArmazenamento } from "@/lib/limites";
import { getS3, newKey, putObject } from "@/lib/storage/s3";
import type { Character, VideoArquivo } from "@/lib/types";
import { consultarJob, type Provedor } from "./jobs";
import {
  comporLegendaIA,
  estadoLegendaIA,
  type InputLegendaIA,
} from "./legenda-ia";
import {
  comporTroca,
  ehModeloTroca,
  estadoTroca,
  type InputTroca,
} from "./troca";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { S3Client } from "@aws-sdk/client-s3";
import { uploadFromFile } from "@/lib/storage/s3";
import { estadoTreino } from "@/lib/persona/server";
import { comPastaTemporaria } from "./server";
import {
  criarAvatarDaCena,
  enviarCorpoInteiro,
  enviarVideoFalado,
  esperaAvatar,
  estadoAvatar,
  faladoDoJob,
  guardarCenaFalada,
  idDaEspera,
  MAX_RECUSAS_DO_AVATAR,
  unirFalado,
} from "./falado";
import { getRunway, mensagemDeErroRunway } from "./runway";
import {
  cadeiaDoJob,
  FalhaDaCadeia,
  proximaCena,
  unirCenas,
} from "./cadeia";
import { enviarFaladoSapiens, getSapiens } from "./sapiens";
import { enviarFaladoWan } from "./wan";

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

export async function finalizarJob(
  id: string,
  userId?: string,
): Promise<EstadoPublico | null> {
  const pool = getPool();
  const s3 = getS3();
  if (!pool || !s3) return null;

  const { rows } = await pool.query<Job>(
    `select id, user_id, character_id, status, provedor, tipo, modelo, fal_request_id, input, duracao, result_key, error,
            (status = 'finalizando' and updated_at < now() - interval '5 minutes') as travado,
            created_at < now() - interval '${LIMITE_HORAS} hours' as expirou
     from video_jobs where id = $1 ${userId ? "and user_id = $2" : ""}`,
    userId ? [id, userId] : [id],
  );
  const job = rows[0] as (Job & { expirou: boolean }) | undefined;
  if (!job) return null;

  const publico = (p: Partial<EstadoPublico>): EstadoPublico => ({
    duracao: job.duracao ?? undefined,
    ...p,
    status: p.status!,
  });
  if (job.status === "concluido")
    return publico({ status: "concluido", key: job.result_key ?? undefined });
  if (job.status === "erro")
    return publico({ status: "erro", erro: job.error ?? undefined });
  if (job.status === "finalizando" && !job.travado)
    return publico({ status: "finalizando" });

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
        ? await estadoLegendaIA(
            fal,
            (job.input as unknown as InputLegendaIA).segmentos,
          )
        : await estadoTroca(fal, job.input as unknown as InputTroca);
    if (e.estado === "erro") return falhar(job, e.mensagem);
    if (e.estado === "concluido") concluido = { urls: e.urls };
    else return emAndamento(job, e.estado, { progresso: e.progresso });
  } else if (esperaAvatar(job.fal_request_id)) {
    // Vídeo falado: o avatar do Runway ainda estava sendo preparado.
    const avatarId = esperaAvatar(job.fal_request_id)!;
    const rw = getRunway();
    if (!rw) return falhar(job, "Runway não configurado no servidor.");
    const a = await estadoAvatar(rw, avatarId);
    const emCenas = faladoDoJob(job.input);
    const daVez = emCenas?.cenas[emCenas.partes.length];
    if (a.estado === "erro") {
      // O Runway às vezes recusa uma imagem que aceita em seguida: tenta de novo.
      const recusas = (daVez?.recusas ?? 0) + 1;
      if (!emCenas || !daVez || recusas > MAX_RECUSAS_DO_AVATAR)
        return falhar(job, a.mensagem);
      const pegouRecusa = await pool.query(
        `update video_jobs set status = 'finalizando', updated_at = now()
         where id = $1 and fal_request_id = $2
           and (status in ('na_fila', 'processando')
                or (status = 'finalizando' and updated_at < now() - interval '5 minutes'))
         returning id`,
        [job.id, idDaEspera(avatarId)],
      );
      if (!pegouRecusa.rowCount) return publico({ status: "processando" });
      try {
        const novo = await criarAvatarDaCena(rw, s3, emCenas.nome, daVez);
        const cenas = emCenas.cenas.map((c) =>
          c === daVez ? { ...c, avatarId: novo, recusas } : c,
        );
        await pool.query(
          `update video_jobs set status = 'processando', fal_request_id = $2, input = $3, updated_at = now()
           where id = $1`,
          [
            job.id,
            idDaEspera(novo),
            JSON.stringify({ ...job.input, falado: { ...emCenas, cenas } }),
          ],
        );
      } catch (err) {
        console.error("[videos] avatar recusado:", job.id, err);
        return falhar(job, mensagemDeErroRunway(err));
      }
      return publico({ status: "processando" });
    }
    if (a.estado === "preparando") return emAndamento(job, "processando", {});
    // Pronto: só uma chamada pede o vídeo.
    const pegou = await pool.query(
      `update video_jobs set status = 'finalizando', updated_at = now()
       where id = $1 and fal_request_id = $2
         and (status in ('na_fila', 'processando')
              or (status = 'finalizando' and updated_at < now() - interval '5 minutes'))
       returning id`,
      [job.id, idDaEspera(avatarId)],
    );
    if (!pegou.rowCount) return publico({ status: "processando" });
    try {
      // Em cenas: o áudio é o da cena da vez (a seguinte às que já ficaram prontas).
      const tarefa = await enviarVideoFalado(rw, s3, {
        avatarId,
        audioKey: daVez ? daVez.audioKey : String(job.input.audioKey),
      });
      // Avatar do retrato sem cenário: fica anotado para os próximos vídeos da imagem.
      if (daVez?.base && !job.input.avatarId)
        await pool.query(
          "update video_jobs set input = jsonb_set(input, '{avatarId}', to_jsonb($2::text)) where id = $1",
          [job.id, avatarId],
        );
      await pool.query(
        "update video_jobs set status = 'processando', fal_request_id = $2, updated_at = now() where id = $1",
        [job.id, tarefa],
      );
    } catch (err) {
      console.error("[videos] vídeo falado:", job.id, err);
      return falhar(job, mensagemDeErroRunway(err));
    }
    return publico({ status: "processando" });
  } else {
    const e = await consultarJob(job.provedor, job.modelo, job.fal_request_id);
    if (e.estado === "erro") return falhar(job, e.mensagem);
    const cadeia = cadeiaDoJob(job.input);
    // Vídeo em cenas: o progresso conta as cenas prontas mais a que está rodando.
    const feito = (parcial = 0) =>
      cadeia
        ? (cadeia.partes.length + parcial) / cadeia.cenas.length
        : parcial || undefined;
    if (e.estado !== "concluido")
      return emAndamento(job, e.estado, {
        posicao: e.estado === "na_fila" ? e.posicao : undefined,
        progresso:
          e.estado === "processando" ? feito(e.progresso ?? 0) : feito(),
      });
    const falado = faladoDoJob(job.input);
    if (falado && falado.partes.length + 1 < falado.cenas.length) {
      // Vídeo falado em cenas: guarda esta e passa para o avatar da próxima.
      const pegou = await pool.query(
        `update video_jobs set status = 'finalizando', updated_at = now()
         where id = $1 and fal_request_id = $2
           and (status in ('na_fila', 'processando')
                or (status = 'finalizando' and updated_at < now() - interval '5 minutes'))
         returning id`,
        [job.id, job.fal_request_id],
      );
      if (!pegou.rowCount) return publico({ status: "processando" });
      const prontas = falado.partes.length + 1;
      try {
        const parte = await guardarCenaFalada({
          s3,
          userId: job.user_id,
          videoUrl: e.videoUrl,
        });
        const proxima = falado.cenas[prontas];
        let avatarId: string | undefined;
        let seguinte: string;
        if (falado.corpo?.modelo === "wan3") {
          const fal = getFal();
          if (!fal) return falhar(job, "fal.ai não configurado no servidor.");
          seguinte = await enviarFaladoWan(fal, s3, {
            jobId: job.id,
            cena: proxima,
            vertical: falado.corpo.vertical,
          });
        } else if (job.provedor === "sapiens" && falado.corpo?.modelo) {
          const chave = getSapiens();
          if (!chave)
            return falhar(job, "Sapiens não configurado no servidor.");
          seguinte = await enviarFaladoSapiens(chave, s3, {
            modelo: falado.corpo.modelo,
            cena: proxima,
            vertical: falado.corpo.vertical,
          });
        } else {
          // O avatar da próxima cena só é criado agora: um por vez (ver falado.ts).
          const rw = getRunway();
          if (!rw) return falhar(job, "Runway não configurado no servidor.");
          // Corpo inteiro não tem avatar: a próxima cena já vai para o modelo.
          avatarId = falado.corpo
            ? undefined
            : (proxima.avatarId ??
              (await criarAvatarDaCena(rw, s3, falado.nome, proxima)));
          seguinte = falado.corpo
            ? await enviarCorpoInteiro(rw, s3, proxima, falado.corpo.vertical)
            : idDaEspera(avatarId!);
        }
        const cenas = falado.cenas.map((c, i) =>
          i === prontas && avatarId ? { ...c, avatarId } : c,
        );
        await pool.query(
          `update video_jobs set status = 'processando', fal_request_id = $2, input = $3, updated_at = now()
           where id = $1`,
          [
            job.id,
            seguinte,
            JSON.stringify({
              ...job.input,
              falado: { ...falado, cenas, partes: [...falado.partes, parte] },
            }),
          ],
        );
      } catch (err) {
        console.error("[videos] cena falada:", job.id, err);
        // Falha passageira: volta a "processando" e a próxima consulta tenta de novo.
        await pool.query(
          "update video_jobs set status = 'processando', updated_at = now() where id = $1",
          [job.id],
        );
      }
      return publico({
        status: "processando",
        progresso: prontas / falado.cenas.length,
      });
    }
    if (cadeia && cadeia.partes.length + 1 < cadeia.cenas.length) {
      // Ainda faltam cenas: guarda esta e manda a próxima (uma chamada só faz isso).
      const pegou = await pool.query(
        `update video_jobs set status = 'finalizando', updated_at = now()
         where id = $1 and fal_request_id = $2
           and (status in ('na_fila', 'processando')
                or (status = 'finalizando' and updated_at < now() - interval '5 minutes'))
         returning id`,
        [job.id, job.fal_request_id],
      );
      if (!pegou.rowCount) return publico({ status: "processando" });
      try {
        const proxima = await proximaCena({
          s3,
          userId: job.user_id,
          jobId: job.id,
          provedor: job.provedor,
          modelo: job.modelo,
          input: job.input,
          cadeia,
          videoUrl: e.videoUrl,
        });
        await pool.query(
          `update video_jobs set status = 'processando', fal_request_id = $2, input = $3, updated_at = now()
           where id = $1`,
          [job.id, proxima.idExterno, JSON.stringify(proxima.input)],
        );
      } catch (err) {
        console.error("[videos] próxima cena:", job.id, err);
        if (err instanceof FalhaDaCadeia) return falhar(job, err.message);
        // Falha passageira: volta a "processando" e a próxima consulta tenta de novo.
        await pool.query(
          "update video_jobs set status = 'processando', updated_at = now() where id = $1",
          [job.id],
        );
      }
      return publico({ status: "processando", progresso: feito(1) });
    }
    concluido = { url: e.videoUrl };
  }

  // Pronto no serviço: só uma chamada "pega" a finalização.
  const claim = await pool.query(
    `update video_jobs set status = 'finalizando', updated_at = now()
     where id = $1 and (status in ('na_fila', 'processando')
                        or (status = 'finalizando' and updated_at < now() - interval '5 minutes'))
     returning id`,
    [job.id],
  );
  if (!claim.rowCount) return publico({ status: "finalizando" });

  try {
    let key: string;
    let size: number;
    if (concluido.lora) {
      // Persona treinada: arquivos do LoRA vão pro S3 da conta; a persona fica pronta.
      ({ key, size } = await baixarParaS3(s3, job.user_id, concluido.lora));
      await pool.query(
        "update personas_treino set status = 'pronto', key = $2, updated_at = now() where id = $1",
        [job.id, key],
      );
      await somarArmazenamento(job.user_id, size);
      await pool.query(
        "update video_jobs set status = 'concluido', result_key = $2, updated_at = now() where id = $1",
        [job.id, key],
      );
      await missaoCumprida(job.user_id, "persona");
      return publico({ status: "concluido", key });
    }
    if (concluido.urls && ehModeloTroca(job.modelo)) {
      ({ key, size } = await comporTroca({
        s3,
        userId: job.user_id,
        input: job.input as unknown as InputTroca,
        urls: concluido.urls,
      }));
      // Troca feita para uma figurinha animada: o resultado volta a ser WebP animado.
      const figurinha = (job.input as { figurinha?: FigurinhaAnimada })
        .figurinha;
      if (figurinha)
        ({ key, size } = await videoParaFigurinha({
          s3,
          userId: job.user_id,
          videoKey: key,
          figurinha,
        }));
    } else if (concluido.urls) {
      ({ key, size } = await comporLegendaIA({
        s3,
        userId: job.user_id,
        input: job.input as unknown as InputLegendaIA,
        urls: concluido.urls,
      }));
    } else if (
      faladoDoJob(job.input)?.partes.length ||
      faladoDoJob(job.input)?.corpo
    ) {
      // Vídeo falado em cenas: une as guardadas com a última. No corpo inteiro
      // o som de cada cena passa a ser a fala original (a voz do personagem).
      const f = faladoDoJob(job.input)!;
      ({ key, size } = await unirFalado({
        s3,
        userId: job.user_id,
        partes: f.partes,
        ultimaUrl: concluido.url!,
        audios: f.corpo ? f.cenas.map((c) => c.audioKey) : undefined,
      }));
    } else if (cadeiaDoJob(job.input)) {
      // Vídeo em cenas: une as que estavam guardadas com a última e corta no tempo pedido.
      ({ key, size } = await unirCenas({
        s3,
        userId: job.user_id,
        cadeia: cadeiaDoJob(job.input)!,
        ultimaUrl: concluido.url!,
      }));
    } else {
      const res = await fetch(concluido.url!);
      if (!res.ok)
        throw new Error(`download do resultado falhou (HTTP ${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      key = newKey(job.user_id, "videos", "video/mp4");
      await putObject(s3, key, buf, "video/mp4");
      size = buf.length;
    }
    await somarArmazenamento(job.user_id, size);
    await pool.query(
      "update video_jobs set status = 'concluido', result_key = $2, updated_at = now() where id = $1",
      [job.id, key],
    );
    await avisarDoJob(
      job,
      await atualizarPersonagem(job, {
        key,
        size,
        status: undefined,
        erro: undefined,
        duracao: job.duracao ?? undefined,
      }),
      false,
    );
    // Pontos: primeiro vídeo gerado (figurinha animada não conta como vídeo).
    if (!(job.input as { figurinha?: unknown }).figurinha)
      await missaoCumprida(job.user_id, "primeiro_video");
    return publico({ status: "concluido", key });
  } catch (e) {
    console.error("[videos] finalizar:", job.id, e);
    // Volta pra "processando": a próxima chamada (tela, webhook ou cron) tenta de novo.
    await pool.query(
      "update video_jobs set status = 'processando', updated_at = now() where id = $1",
      [job.id],
    );
    return publico({ status: "processando" });
  }

  async function emAndamento(
    j: Job & { expirou: boolean },
    status: "na_fila" | "processando",
    extra: Partial<EstadoPublico>,
  ): Promise<EstadoPublico> {
    if (j.expirou) return falhar(j, "O serviço não terminou a tempo.");
    await pool!.query(
      "update video_jobs set status = $2, updated_at = now() where id = $1 and status <> $2",
      [j.id, status],
    );
    return publico({ status, ...extra });
  }

  async function falhar(j: Job, mensagem: string): Promise<EstadoPublico> {
    // Só quem muda o status pra "erro" devolve os créditos (uma vez).
    const { rows: falhou } = await pool!.query<{
      input: { cobranca?: Cobranca | null };
    }>(
      "update video_jobs set status = 'erro', error = $2, updated_at = now() where id = $1 and status <> 'erro' returning input",
      [j.id, mensagem],
    );
    const erro = `${mensagem} Os créditos foram devolvidos.`;
    if (falhou[0]) {
      await estornarSeHouver(
        falhou[0].input?.cobranca,
        j.tipo.startsWith("treino_") ? "estorno_treino" : "estorno_video",
      );
      if (j.tipo.startsWith("treino_")) {
        await pool!.query(
          "update personas_treino set status = 'erro', error = $2, updated_at = now() where id = $1",
          [j.id, erro],
        );
      } else {
        await avisarDoJob(
          j,
          await atualizarPersonagem(j, { status: "erro", erro }),
          true,
        );
      }
    }
    return publico({ status: "erro", erro });
  }
}

/**
 * Atualiza o vídeo do job dentro do personagem salvo no banco (se o personagem já sincronizou).
 * Uma troca com vários personagens fica no estúdio de cada um: atualiza todos os que têm o job.
 */
async function atualizarPersonagem(
  job: Job,
  patch: Partial<VideoArquivo>,
): Promise<ItemDoJob | null> {
  const pool = getPool()!;
  const { rows } = await pool.query<{ id: string; data: Character }>(
    `select id, data from characters
      where user_id = $2 and (id = $1 or data->'videos' @> $3::jsonb)`,
    [job.character_id, job.user_id, JSON.stringify([{ jobId: job.id }])],
  );
  let primeiro: ItemDoJob | null = null;
  for (const { id, data } of rows)
    primeiro = (await atualizarVideoDoJob(id, data, job, patch)) ?? primeiro;
  return primeiro;
}

/** O vídeo (ou figurinha) do job dentro de um personagem: para o aviso do sino. */
interface ItemDoJob {
  nome: string;
  href: string;
}

/**
 * Aviso do sino: o vídeo terminou ou falhou. Nasce aqui para existir mesmo
 * com o app fechado; a chave é a mesma que a tela usa, então não duplica.
 */
async function avisarDoJob(
  job: Job,
  item: ItemDoJob | null,
  erro: boolean,
): Promise<void> {
  if (!item) return;
  await criarAviso(job.user_id, {
    rotulo: item.nome,
    erro,
    href: item.href,
    chave: `video:${job.id}`,
  });
}

async function atualizarVideoDoJob(
  characterId: string,
  data: Character,
  job: Job,
  patch: Partial<VideoArquivo>,
): Promise<ItemDoJob | null> {
  // O job pode ser de um vídeo ou de uma figurinha animada do personagem.
  const video =
    data?.videos?.find((v) => v.jobId === job.id) ??
    data?.figurinhas?.find((f) => f.jobId === job.id);
  if (!data || !video) return null;
  Object.assign(video, {
    ...(patch.key !== undefined ? { key: patch.key } : {}),
    ...(patch.size !== undefined ? { size: patch.size } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.erro !== undefined ? { erro: patch.erro } : {}),
    ...("contentType" in video && patch.duracao !== undefined
      ? { duracao: patch.duracao }
      : {}),
  });
  if (patch.status === undefined) {
    delete video.status;
    delete video.erro;
  }
  data.updatedAt = Date.now();
  await getPool()!.query(
    "update characters set data = $3, updated_at = now() where id = $1 and user_id = $2",
    [characterId, job.user_id, JSON.stringify(data)],
  );
  const ehVideo = "name" in video;
  return {
    nome: ehVideo ? video.name : video.texto,
    href: `/app/personagem/${characterId}?aba=estudio&secao=${ehVideo ? "videos" : "figurinhas"}`,
  };
}

/** Ids dos jobs que o cron deve verificar (pendentes ou travados nas últimas 48h+). */
export async function jobsPendentes(limite = 25): Promise<string[]> {
  const { rows } = await getPool()!.query<{ id: string }>(
    `select id from video_jobs
     where status in ('na_fila', 'processando')
        or (status = 'finalizando' and updated_at < now() - interval '5 minutes')
     order by created_at limit $1`,
    [limite],
  );
  return rows.map((r) => r.id);
}

/** Baixa um arquivo grande (ex.: LoRA) direto pro disco e envia ao S3, sem carregar na memória. */
async function baixarParaS3(
  s3: S3Client,
  userId: string,
  url: string,
): Promise<{ key: string; size: number }> {
  return comPastaTemporaria(async (dir) => {
    const res = await fetch(url);
    if (!res.ok || !res.body)
      throw new Error(`download do modelo falhou (HTTP ${res.status})`);
    const arquivo = path.join(dir, "modelo.safetensors");
    await pipeline(
      Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
      createWriteStream(arquivo),
    );
    const key = newKey(userId, "loras", "application/octet-stream");
    const size = await uploadFromFile(
      s3,
      key,
      arquivo,
      "application/octet-stream",
    );
    return { key, size };
  });
}
