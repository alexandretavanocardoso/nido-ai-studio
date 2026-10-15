import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** O mesmo bucket do app (variáveis AWS_REGION, S3_BUCKET e as credenciais da AWS). */
export interface ArmazenamentoMotion {
  baixar(key: string): Promise<Buffer>;
  enviar(key: string, corpo: Buffer | string, tipo: string): Promise<void>;
  enviarArquivo(key: string, arquivo: string, tipo: string): Promise<void>;
  url(key: string, segundos?: number): Promise<string>;
}

export function armazenamento(regiao: string, Bucket: string): ArmazenamentoMotion {
  const s3 = new S3Client({ region: regiao });
  return {
    baixar: async (Key) => {
      const r = await s3.send(new GetObjectCommand({ Bucket, Key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
    enviar: async (Key, Body, ContentType) => {
      await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    },
    enviarArquivo: async (Key, arquivo, ContentType) => {
      const { size } = await stat(arquivo);
      await s3.send(
        new PutObjectCommand({ Bucket, Key, Body: createReadStream(arquivo), ContentLength: size, ContentType }),
      );
    },
    url: (Key, segundos = 3 * 3600) => getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: segundos }),
  };
}
