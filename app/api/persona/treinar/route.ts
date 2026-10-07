import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  cobrarOuResponder,
  creditosAtivos,
  estornarSeHouver,
  planoAtual,
  type Cobranca,
} from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { getFal, mensagemDeErro } from "@/lib/fal";
import { armazenamentoOuResponder } from "@/lib/limites";
import {
  ALVO_DO_TREINADOR,
  DECLARACAO_TREINO,
  gerarGatilho,
  iniciarTreino,
  montarZipTreino,
  MODELOS_TREINO,
  treinosGratisNoMes,
} from "@/lib/persona/server";
import { carregarPersonagem } from "@/lib/personagens";
import {
  bloqueioPersona,
  CREDITOS_TREINO,
  PLANOS,
  TREINO_MAX_IMAGENS,
  TREINO_MIN_IMAGENS,
} from "@/lib/planos";
import { readIp } from "@/lib/ai/rate-limit";
import { ownsKey } from "@/lib/storage/s3";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Espaço reservado para os arquivos do modelo treinado. */
const ESPACO_LORA = 400 * 1024 ** 2;

const BodySchema = z.object({
  characterId: z.string().min(1),
  /** rapido = FLUX.1 LoRA Fast (padrão) · pro = FLUX.2 */
  treinador: z.enum(["rapido", "pro"]).default("rapido"),
  keys: z
    .array(z.string().min(1))
    .min(TREINO_MIN_IMAGENS)
    .max(TREINO_MAX_IMAGENS),
  /** Declaração obrigatória — sem ela, não treina. */
  consentimento: z.literal(true, {
    message: "Marque a declaração para continuar.",
  }),
});

/**
 * POST — treina a persona do personagem com as imagens aprovadas.
 * Registra a declaração, cobra (ou usa o treino Rápido incluso no plano) e
 * envia ao fal (webhook do job).
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const fal = getFal();
  const pool = getPool();
  if (!fal || !pool)
    return NextResponse.json(
      { error: "Treino não configurado (FAL_KEY).", code: "CONFIG_MISSING" },
      { status: 500 },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;
  const keys = [...new Set(body.keys)];
  if (keys.length < TREINO_MIN_IMAGENS)
    return NextResponse.json(
      {
        error: `Aprove pelo menos ${TREINO_MIN_IMAGENS} imagens diferentes.`,
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  if (!keys.every((k) => ownsKey(userId, k)))
    return NextResponse.json(
      { error: "Imagem não encontrada." },
      { status: 404 },
    );

  const plano = await planoAtual(userId);
  const bloqueio = bloqueioPersona(plano);
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );
  const semEspaco = await armazenamentoOuResponder(userId, ESPACO_LORA);
  if (semEspaco) return semEspaco;

  const { rowCount: treinando } = await pool.query(
    "select 1 from personas_treino where user_id = $1 and character_id = $2 and status = 'treinando'",
    [userId, body.characterId],
  );
  if (treinando)
    return NextResponse.json(
      {
        error: "Este personagem já está sendo treinado. Aguarde terminar.",
        code: "BAD_INPUT",
      },
      { status: 409 },
    );

  // Declaração obrigatória: fica registrada (quem, o quê, quando, de onde).
  await pool.query(
    "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'treino_persona', $4, $5)",
    [nanoid(14), userId, body.characterId, DECLARACAO_TREINO, readIp(req)],
  );

  const alvo = ALVO_DO_TREINADOR[body.treinador];
  // Treino Rápido incluso no plano (Studio: 1 por mês). Senão, cobra.
  const gratis =
    creditosAtivos() &&
    body.treinador === "rapido" &&
    PLANOS[plano].treinosGratisMes > (await treinosGratisNoMes(userId));
  let cobranca: Cobranca | null = null;
  if (!gratis) {
    const cobrado = await cobrarOuResponder(
      userId,
      CREDITOS_TREINO[body.treinador],
      `persona_treino_${body.treinador}`,
      body.characterId,
    );
    if (cobrado instanceof NextResponse) return cobrado;
    cobranca = cobrado.cobranca;
  }

  const personagem = await carregarPersonagem(userId, body.characterId);
  const gatilho = gerarGatilho(personagem?.identidade.nome ?? "persona");
  try {
    const zip = await montarZipTreino(s3, keys, gatilho);
    const zipUrl = await fal.storage.upload(
      new Blob([new Uint8Array(zip)], { type: "application/zip" }),
    );
    const jobId = nanoid(12);
    const requestId = await iniciarTreino(fal, {
      alvo,
      zipUrl,
      gatilho,
      jobId,
    });
    await pool.query(
      `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input)
       values ($1, $2, $3, 'fal', $4, $5, $6, $7)`,
      [
        jobId,
        userId,
        body.characterId,
        `treino_${alvo}`,
        MODELOS_TREINO[alvo],
        requestId,
        JSON.stringify({ gatilho, imagens: keys.length, cobranca }),
      ],
    );
    await pool.query(
      `insert into personas_treino (id, user_id, character_id, alvo, gatilho, imagens, gratis) values ($1, $2, $3, $4, $5, $6, $7)`,
      [jobId, userId, body.characterId, alvo, gatilho, keys.length, gratis],
    );
    // A cobrança já está no job: o estorno, se houver, sai de lá.
    return NextResponse.json({ jobId, gatilho, gratis });
  } catch (e) {
    await estornarSeHouver(cobranca);
    console.error("[persona/treinar]", e);
    return NextResponse.json(
      { error: mensagemDeErro(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
