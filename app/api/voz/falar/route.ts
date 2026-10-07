import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cobrarOuResponder,
  estornarSeHouver,
  planoAtual,
} from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { armazenamentoOuResponder, somarArmazenamento } from "@/lib/limites";
import { bloqueioVoz, creditosFala } from "@/lib/planos";
import { newKey, putObject } from "@/lib/storage/s3";
import { contextoVideo } from "@/lib/video/server";
import { falar, getEleven, mensagemDeErroVoz } from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  characterId: z.string().min(1),
  voiceId: z.string().min(1),
  texto: z
    .string()
    .trim()
    .min(2, "Escreva o que o personagem vai falar.")
    .max(1500),
});

/** POST — gera uma fala (MP3) com a voz do personagem e salva no S3. */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const el = getEleven();
  const pool = getPool();
  if (!el || !pool)
    return NextResponse.json(
      {
        error: "Voz não configurada (ELEVENLABS_API_KEY).",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;

  // Só vozes da própria conta.
  const { rowCount } = await pool.query(
    "select 1 from vozes where voice_id = $1 and user_id = $2",
    [body.voiceId, userId],
  );
  if (!rowCount)
    return NextResponse.json({ error: "Voz não encontrada." }, { status: 404 });
  const bloqueio = bloqueioVoz(await planoAtual(userId));
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );
  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;

  const creditos = creditosFala(body.texto.length);
  const cobrado = await cobrarOuResponder(
    userId,
    creditos,
    "voz_fala",
    body.characterId,
  );
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const mp3 = await falar(el, body.voiceId, body.texto);
    const key = newKey(userId, "audios", "audio/mpeg");
    await putObject(s3, key, mp3, "audio/mpeg");
    await somarArmazenamento(userId, mp3.length);
    return NextResponse.json({ key, size: mp3.length, creditos });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    console.error("[voz/falar]", e);
    return NextResponse.json(
      { error: mensagemDeErroVoz(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
