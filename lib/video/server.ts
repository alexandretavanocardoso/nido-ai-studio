import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import type { S3Client } from "@aws-sdk/client-s3";
import { getUserId } from "@/lib/auth/server";
import { getS3 } from "@/lib/storage/s3";

/** Conta logada + S3 configurado, ou a resposta de erro pronta. */
export async function contextoVideo(): Promise<{ userId: string; s3: S3Client } | NextResponse> {
  const s3 = getS3();
  if (!s3) return NextResponse.json({ error: "Armazenamento não configurado.", code: "CONFIG_MISSING" }, { status: 500 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  return { userId, s3 };
}

/** Roda `fn` com uma pasta temporária, apagada no fim (mesmo se der erro). */
export async function comPastaTemporaria<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "nido-video-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
