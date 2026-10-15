/**
 * Processo da Sombra de vídeo longo (sempre ligado, fora da Vercel: no Railway).
 * A cada 10 s procura no banco um vídeo da Sombra para processar
 * (video_jobs com provedor 'nido'), pega para si e processa (processar.ts).
 * Dá sinal de vida a cada minuto; se cair, outro processo retoma depois de
 * 10 min sem sinal. Ao terminar (ou falhar), chama o cron de vídeos do app,
 * que finaliza: põe o vídeo na Sombra ou devolve os créditos.
 *
 * Variáveis: DATABASE_URL, S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID,
 * AWS_SECRET_ACCESS_KEY, DECART_API_KEY, ELEVENLABS_API_KEY, APP_URL e
 * CRON_SECRET (as mesmas do app). Opcionais: ELEVENLABS_STS_MODEL,
 * SOMBRA_PARALELAS (partes ao mesmo tempo, padrão 3).
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createDecartClient, models } from "@decartai/sdk";
import { Pool } from "@neondatabase/serverless";
import ffmpegStatic from "ffmpeg-static";
import { pegarTrabalho, salvarTrabalho } from "./banco";
import { OPCOES_PADRAO, processar, type JobSombra, type Servicos } from "./processar";

const precisa = (nome: string) => {
  const v = process.env[nome]?.trim();
  if (!v) throw new Error(`Falta a variável ${nome}.`);
  return v;
};

export function servicosReais(): Omit<Servicos, "salvar"> & {
  pool: Pool;
  salvarDe: (id: string) => Servicos["salvar"];
} {
  const pool = new Pool({ connectionString: precisa("DATABASE_URL") });
  const Bucket = precisa("S3_BUCKET");
  const s3 = new S3Client({ region: precisa("AWS_REGION") });
  const decart = createDecartClient({ apiKey: precisa("DECART_API_KEY") });
  const chaveEleven = precisa("ELEVENLABS_API_KEY");
  const modeloVoz = process.env.ELEVENLABS_STS_MODEL?.trim() || "eleven_multilingual_sts_v2";

  return {
    pool,
    ffmpeg: ffmpegStatic as unknown as string,
    log: (...a) => console.log(new Date().toISOString(), ...a),
    salvarDe: (id) => (mudancas) => salvarTrabalho(pool, id, mudancas),
    urlDoS3: (key) => getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 12 * 3600 }),
    baixarDoS3: async (key) => {
      const r = await s3.send(new GetObjectCommand({ Bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
    enviarArquivo: async (key, arquivo) => {
      const { size } = await stat(arquivo);
      await s3.send(
        new PutObjectCommand({ Bucket, Key: key, Body: createReadStream(arquivo), ContentLength: size, ContentType: "video/mp4" }),
      );
    },
    enviarFluxo: (key, fluxo) => enviarEmPartes(s3, Bucket, key, fluxo),
    copiarNoS3: async (de, para) => {
      await s3.send(new CopyObjectCommand({ Bucket, CopySource: `${Bucket}/${encodeURI(de)}`, Key: para, ContentType: "video/mp4", MetadataDirective: "REPLACE" }));
      const h = await s3.send(new HeadObjectCommand({ Bucket, Key: para }));
      return h.ContentLength ?? 0;
    },
    apagarDoS3: async (keys) => {
      for (let i = 0; i < keys.length; i += 1000)
        await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) } }));
    },
    lucy: {
      enviar: async (video, imagem, pedido) =>
        (await decart.queue.submit({ model: models.video("lucy-2.5"), prompt: pedido, data: video, reference_image: imagem })).job_id,
      estado: async (id) => (await decart.queue.status(id)).status,
      resultado: (id) => decart.queue.result(id),
    },
    trocarVoz: async (pcm, voiceId) => {
      const form = new FormData();
      form.append("audio", new Blob([new Uint8Array(pcm)], { type: "application/octet-stream" }), "fala.pcm");
      form.append("model_id", modeloVoz);
      form.append("file_format", "pcm_s16le_16");
      // Tira o som de fundo (jogo, música) antes de trocar: a voz sai limpa.
      form.append("remove_background_noise", "true");
      const r = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`, {
        method: "POST",
        headers: { "xi-api-key": chaveEleven },
        body: form,
      });
      if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}

/** Sobe um fluxo de qualquer tamanho para o S3 em partes de 64 MB. Devolve os bytes. */
export async function enviarEmPartes(s3: S3Client, Bucket: string, Key: string, fluxo: Readable): Promise<number> {
  const { UploadId } = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: "video/mp4" }));
  const PARTE = 64 * 1024 * 1024;
  const partes: { ETag?: string; PartNumber: number }[] = [];
  let pedacos: Buffer[] = [];
  let tam = 0;
  let total = 0;
  const subir = async () => {
    const PartNumber = partes.length + 1;
    const r = await s3.send(new UploadPartCommand({ Bucket, Key, UploadId, PartNumber, Body: Buffer.concat(pedacos) }));
    partes.push({ ETag: r.ETag, PartNumber });
    pedacos = [];
    tam = 0;
  };
  try {
    for await (const c of fluxo) {
      const b = c as Buffer;
      pedacos.push(b);
      tam += b.length;
      total += b.length;
      if (tam >= PARTE) await subir();
    }
    if (tam || !partes.length) await subir();
    await s3.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: partes } }));
    return total;
  } catch (e) {
    await s3.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId })).catch(() => {});
    throw e;
  }
}

/** O que mostrar na tela quando o trabalho falha (o detalhe técnico fica no log). */
export function mensagemDoErro(e: unknown): string {
  const m = (e as Error)?.message ?? "";
  if (m.startsWith("ffmpeg falhou")) return "Não consegui ler o vídeo de origem (o link pode ter expirado ou o arquivo está corrompido).";
  if (/ElevenLabs/.test(m)) return "A ElevenLabs não conseguiu trocar a voz.";
  return m.slice(0, 300) || "A troca falhou.";
}

/** Pede ao app que finalize os vídeos prontos (o mesmo cron diário, chamado agora). */
async function avisarApp(log: Servicos["log"]) {
  const base = (process.env.APP_URL || process.env.BETTER_AUTH_URL || "").trim().replace(/\/+$/, "");
  const segredo = process.env.CRON_SECRET?.trim();
  if (!base || !segredo) return log("[sombra] sem APP_URL/CRON_SECRET: o app finaliza quando alguém abrir a Sombra.");
  await fetch(`${base}/api/cron/video-jobs`, { headers: { Authorization: `Bearer ${segredo}` }, signal: AbortSignal.timeout(280_000) })
    .then((r) => log("[sombra] app avisado:", r.status))
    .catch((e) => log("[sombra] não consegui avisar o app:", (e as Error).message));
}

async function rodar() {
  const s = servicosReais();
  const paralelas = Number(process.env.SOMBRA_PARALELAS) || OPCOES_PADRAO.paralelas;
  let parar = false;
  process.on("SIGTERM", () => {
    s.log("[sombra] desligando: o trabalho atual fica para o próximo processo retomar.");
    parar = true;
    setTimeout(() => process.exit(0), 2000);
  });
  s.log("[sombra] no ar, esperando vídeos.");
  while (!parar) {
    let job: JobSombra | null = null;
    try {
      job = await pegarTrabalho(s.pool);
    } catch (e) {
      s.log("[sombra] banco:", (e as Error).message);
    }
    if (!job) {
      await new Promise((ok) => setTimeout(ok, 10_000));
      continue;
    }
    const salvar = s.salvarDe(job.id);
    const sinal = setInterval(() => void salvar({}).catch(() => {}), 60_000);
    try {
      await processar(job, { ...s, salvar }, { ...OPCOES_PADRAO, paralelas });
      // Arquivo enviado só para isto (pasta "lives"): não precisa mais dele.
      if (job.fonte.tipo === "arquivo" && job.fonte.key.includes("/lives/")) await s.apagarDoS3([job.fonte.key]).catch(() => {});
    } catch (e) {
      s.log("[sombra]", job.id, "falhou:", e);
      await salvar({ estado: "erro", erro: mensagemDoErro(e) }).catch(() => {});
    } finally {
      clearInterval(sinal);
    }
    await avisarApp(s.log);
  }
}

if (process.argv[1]?.endsWith("index.ts")) void rodar();
