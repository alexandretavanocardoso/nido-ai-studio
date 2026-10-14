import type RunwayML from "@runwayml/sdk";
import type { S3Client } from "@aws-sdk/client-s3";
import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Pool } from "@neondatabase/serverless";
import { NextResponse } from "next/server";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { getUserId } from "@/lib/auth/server";
import { getPool } from "@/lib/db";
import { getS3 } from "@/lib/storage/s3";
import { getRunway } from "@/lib/video/runway";
import { getEleven } from "@/lib/voz/elevenlabs";
import { configLiveKit, type ConfigLiveKit } from "./livekit";

export interface ContextoLive {
  userId: string;
  pool: Pool;
  s3: S3Client;
  rw: RunwayML;
  el: ElevenLabsClient;
  lk: ConfigLiveKit;
}

/**
 * Para as rotas /api/live/*: recurso liberado (em teste: só admin), conta
 * logada e os serviços configurados — ou a resposta de recusa pronta.
 */
export async function contextoLive(): Promise<ContextoLive | NextResponse> {
  const bloqueio = await liberadoOuResponder("live");
  if (bloqueio) return bloqueio;
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const pool = getPool();
  const s3 = getS3();
  const rw = getRunway();
  const el = getEleven();
  const lk = configLiveKit();
  if (!pool || !s3 || !rw || !el || !lk)
    return NextResponse.json(
      {
        error:
          "Live não configurada no servidor (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, RUNWAYML_API_SECRET e ELEVENLABS_API_KEY).",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  return { userId, pool, s3, rw, el, lk };
}

export const liveNaoEncontrada = () =>
  NextResponse.json({ error: "Live não encontrada." }, { status: 404 });
