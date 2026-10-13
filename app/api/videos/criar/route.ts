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
import {
  getObjectBuffer,
  newKey,
  ownsKey,
  presignGet,
  putObject,
} from "@/lib/storage/s3";
import {
  custoCriar,
  MODELOS_CRIAR,
  DURACOES_CRIAR,
  cenasDoVideo,
  provedorCriar,
  type ModeloCriar,
} from "@/lib/video/precos";
import {
  enviarCriacao,
  getRunway,
  mensagemDeErroRunway,
} from "@/lib/video/runway";
import {
  enviarCriacaoSapiens,
  getSapiens,
  mensagemDeErroSapiens,
  recortarParaFormato,
} from "@/lib/video/sapiens";
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
 * Runway (Gen-4 Turbo, Gen-4.5, Veo 3.1 Fast) ou Sapiens (Kling V3, e o Veo
 * quando a chave dele está configurada): imagem inicial + texto.
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
  const sapiens = getSapiens();
  const provedor = provedorCriar(body.modelo, {
    runway: !!runway,
    sapiens: !!sapiens,
  });
  if (!pool || !provedor)
    return NextResponse.json(
      {
        error:
          runway || sapiens
            ? "Este modelo de vídeo não está configurado neste servidor."
            : "Criação de vídeo não configurada (RUNWAYML_API_SECRET).",
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
  if (!(DURACOES_CRIAR as readonly number[]).includes(body.duracao))
    return NextResponse.json(
      {
        error: `Duração inválida: use ${DURACOES_CRIAR.join(", ")}s.`,
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  // O modelo gera poucos segundos por vez: o vídeo sai em cenas seguidas (cada
  // uma parte do último quadro da anterior) e é unido na finalização.
  const cenas = cenasDoVideo(body.modelo, body.duracao);
  const gerados = cenas.reduce((t, n) => t + n, 0);
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
    const cota = await hit(`vid:${userId}`, COTA_DIARIA, 86_400, gerados);
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

  const creditos = creditosCriarVideo(body.modelo, gerados, audio);
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
    const pedido = {
      modelo: body.modelo,
      promptText: body.promptText,
      vertical: body.vertical,
      duracao: cenas[0],
      audio,
    };
    let idExterno: string;
    if (provedor === "sapiens") {
      // O Sapiens segue o formato da imagem: ela vai recortada em 9:16 ou 16:9.
      const quadroKey = newKey(userId, "refs", "image/jpeg");
      await putObject(
        s3,
        quadroKey,
        await recortarParaFormato(
          await getObjectBuffer(s3, body.imageKey),
          body.vertical,
        ),
        "image/jpeg",
      );
      idExterno = await enviarCriacaoSapiens(sapiens!, {
        ...pedido,
        imageUrl: await presignGet(s3, quadroKey, 86_400),
      });
    } else
      idExterno = await enviarCriacao(runway!, {
        ...pedido,
        imageUrl: await presignGet(s3, body.imageKey, 86_400),
      });

    await pool.query(
      `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
       values ($1, $2, $3, $8, 'criar', $4, $5, $6, $7)`,
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
          // Cenas a gerar e as que já ficaram prontas (ver lib/video/cadeia.ts).
          cadeia: { alvo: body.duracao, cenas, partes: [] },
          // Devolvida pela finalização se o serviço falhar.
          cobranca,
        }),
        body.duracao,
        provedor,
      ],
    );
    return NextResponse.json({
      jobId,
      duracao: body.duracao,
      creditos,
      custoEstimado: custoCriar(body.modelo, gerados, audio),
    });
  } catch (e) {
    await estornarSeHouver(cobranca);
    console.error("[videos/criar]", e);
    return NextResponse.json(
      {
        error:
          provedor === "sapiens"
            ? mensagemDeErroSapiens(e)
            : mensagemDeErroRunway(e),
        code: "PROVIDER_ERROR",
      },
      { status: 502 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}
