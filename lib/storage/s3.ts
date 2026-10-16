import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { nanoid } from "nanoid";
import { recursosDisponiveis } from "@/lib/recursos";
import type { StorageKind } from "./env";

/**
 * Bucket S3 privado. O navegador nunca recebe credenciais: envia arquivos
 * por URL pré-assinada (PUT) e lê por /api/storage/file/<key>, que
 * redireciona pra uma URL pré-assinada de leitura.
 */
let client: S3Client | null = null;

export function getBucket(): string | null {
  return process.env.S3_BUCKET?.trim() || null;
}

export function getS3(): S3Client | null {
  if (!recursosDisponiveis().armazenamento) return null;
  // Credenciais vêm de AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (cadeia padrão do SDK).
  if (!client) client = new S3Client({ region: process.env.AWS_REGION });
  return client;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "weba",
  "audio/ogg": "ogg",
  "application/octet-stream": "safetensors",
  "model/gltf-binary": "glb",
};

export function newKey(
  userId: string,
  kind: StorageKind | "generated" | "dataset" | "loras" | "modelos",
  contentType: string
): string {
  return `users/${userId}/${kind}/${nanoid(12)}.${EXT[contentType] ?? "bin"}`;
}

/** Toda key de um usuário começa com o prefixo dele — é o controle de acesso. */
export function ownsKey(userId: string, key: string): boolean {
  return key.startsWith(`users/${userId}/`) && !key.includes("..");
}

export async function presignPut(s3: S3Client, key: string, contentType: string, size: number) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: getBucket()!, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 600 }
  );
}

/** URL pré-assinada de leitura. Com `baixarComo`, o navegador baixa o arquivo com esse nome em vez de abrir. */
export async function presignGet(s3: S3Client, key: string, expiresIn = 3600, baixarComo?: string) {
  const disposicao = baixarComo
    ? `attachment; filename="${baixarComo.replace(/[^\w.\- ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(baixarComo)}`
    : undefined;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: getBucket()!, Key: key, ResponseContentDisposition: disposicao }),
    { expiresIn }
  );
}

export async function putObject(s3: S3Client, key: string, body: Buffer, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: getBucket()!, Key: key, Body: body, ContentType: contentType }));
}

export async function getObjectBuffer(s3: S3Client, key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: getBucket()!, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

/** Baixa um objeto do bucket pra um arquivo local (sem carregar tudo na memória). */
export async function downloadToFile(s3: S3Client, key: string, arquivo: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: getBucket()!, Key: key }));
  await pipeline(res.Body as Readable, createWriteStream(arquivo));
}

/** Envia um arquivo local pro bucket, em streaming. */
export async function uploadFromFile(s3: S3Client, key: string, arquivo: string, contentType: string) {
  const { size } = await stat(arquivo);
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket()!,
      Key: key,
      Body: createReadStream(arquivo),
      ContentLength: size,
      ContentType: contentType,
    })
  );
  return size;
}

/** Soma o tamanho (bytes) de todos os arquivos sob um prefixo. */
export async function somarTamanho(s3: S3Client, prefixo: string): Promise<number> {
  let total = 0;
  let ContinuationToken: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: getBucket()!, Prefix: prefixo, ContinuationToken }));
    for (const o of res.Contents ?? []) total += o.Size ?? 0;
    ContinuationToken = res.NextContinuationToken;
  } while (ContinuationToken);
  return total;
}
