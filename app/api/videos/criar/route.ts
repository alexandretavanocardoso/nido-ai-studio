import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { hit } from "@/lib/ai/rate-limit";
import {
  cobrarOuResponder,
  creditosAtivos,
  estornarSeHouver,
  planoAtual,
} from "@/lib/creditos";
import {
  armazenamentoOuResponder,
  liberarVaga,
  vagaOuResponder,
} from "@/lib/limites";
import { bloqueioCriarVideo, creditosCriarVideo } from "@/lib/planos";
import { getPool } from "@/lib/db";
import { ownsKey, presignGet } from "@/lib/storage/s3";
import {
  custoCriar,
  MODELOS_CRIAR,
  type ModeloCriar,
} from "@/lib/video/precos";
import {
  enviarCriacao,
  getRunway,
  mensagemDeErroRunway,
} from "@/lib/video/runway";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COTA_DIARIA = Number(process.env.VIDEO_DAILY_SECONDS ?? 180);

const BodySchema = z.object({
  characterId: z.string().min(1),
  /** Imagem inicial (primeiro quadro). Com a persona: uma imagem gerada com ela. */
  imageKey: z.string().min(1, "Escolha a imagem do personagem."),
  modelo: z.enum(Object.keys(MODELOS_CRIAR) as [ModeloCriar, ...ModeloCriar[]]),
  promptText: z.string().trim().min(3, "Descreva a cena.").max(1000),
  duracao: z.number().int(),
  vertical: z.boolean().default(true),
  audio: z.boolean().default(false),
});

/**
 * POST — cria um vídeo novo do personagem. Assíncrono: devolve o id do job,
 * acompanhado em /api/videos/jobs/[id] (e finalizado por webhook/cron).
 * Runway (Gen-4 Turbo, Gen-4.5, Veo 3.1 Fast): imagem inicial + texto.
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const pool = getPool();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;

  const runway = getRunway();
  if (!pool || !runway)
    return NextResponse.json(
      {
        error: "Criação de vídeo não configurada (RUNWAYML_API_SECRET).",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  if (!ownsKey(userId, body.imageKey))
    return NextResponse.json(
      { error: "Imagem não encontrada." },
      { status: 404 },
    );

  const modelo = MODELOS_CRIAR[body.modelo];
  if (!(modelo.duracoes as readonly number[]).includes(body.duracao))
    return NextResponse.json(
      {
        error: `Duração inválida para ${modelo.label}: use ${modelo.duracoes.join(", ")}s.`,
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  const audio = modelo.audio && body.audio;

  const bloqueio = bloqueioCriarVideo(
    await planoAtual(userId),
    body.modelo,
    audio,
  );
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );

  // Sem login (modo dev) vale a cota diária fixa; com créditos, o saldo é o limite.
  if (!creditosAtivos()) {
    const cota = await hit(`vid:${userId}`, COTA_DIARIA, 86_400, body.duracao);
    if (!cota.ok)
      return NextResponse.json(
        {
          error: `Passaria do limite de ${COTA_DIARIA}s de vídeo por dia. Libera em ~${Math.ceil(cota.retryAfter / 3600)}h.`,
          code: "QUOTA_EXCEEDED",
        },
        { status: 429 },
      );
  }

  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "video");
  if (vaga instanceof NextResponse) return vaga;

  const creditos = creditosCriarVideo(body.modelo, body.duracao, audio);
  const cobrado = await cobrarOuResponder(
    userId,
    creditos,
    "video_criar",
    body.modelo,
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }
  const cobranca = cobrado.cobranca;

  try {
    const jobId = nanoid(12);
    const imageUrl = await presignGet(s3, body.imageKey, 86_400);
    const idExterno = await enviarCriacao(runway, {
      modelo: body.modelo,
      imageUrl,
      promptText: body.promptText,
      vertical: body.vertical,
      duracao: body.duracao,
      audio,
    });

    await pool.query(
      `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
       values ($1, $2, $3, 'runway', 'criar', $4, $5, $6, $7)`,
      [
        jobId,
        userId,
        body.characterId,
        body.modelo,
        idExterno,
        JSON.stringify({
          imageKey: body.imageKey,
          promptText: body.promptText,
          vertical: body.vertical,
          audio,
          // Devolvida pela finalização se o serviço falhar.
          cobranca,
        }),
        body.duracao,
      ],
    );
    return NextResponse.json({
      jobId,
      duracao: body.duracao,
      creditos,
      custoEstimado: custoCriar(body.modelo, body.duracao, audio),
    });
  } catch (e) {
    await estornarSeHouver(cobranca);
    console.error("[videos/criar]", e);
    return NextResponse.json(
      { error: mensagemDeErroRunway(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}
