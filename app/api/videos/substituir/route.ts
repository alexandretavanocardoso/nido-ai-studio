import path from "node:path";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { hit, readIp } from "@/lib/ai/rate-limit";
import { DECLARACAO_VIDEO_LINK } from "@/lib/declaracoes";
import { baixarVideo } from "@/lib/video/link";
import {
  cobrarOuResponder,
  creditosAtivos,
  estornarSeHouver,
  planoAtual,
  type Cobranca,
} from "@/lib/creditos";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import {
  bloqueioTroca,
  bloqueioTrocaPremium,
  creditosTroca,
  creditosTrocaPremium,
} from "@/lib/planos";
import { getPool } from "@/lib/db";
import { downloadToFile, getObjectBuffer, ownsKey } from "@/lib/storage/s3";
import { probe } from "@/lib/video/ffmpeg";
import { getFal, mensagemDeErro } from "@/lib/video/fal";
import {
  iniciarTroca,
  MOTORES_TROCA,
  personagemSemFundo,
} from "@/lib/video/troca";
import { descreverPessoas } from "@/lib/video/pessoas";
import {
  custoTroca,
  custoTrocaPremium,
  KLING_TROCA,
  SEEDANCE_TROCA,
} from "@/lib/video/precos";
import { comPastaTemporaria, contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Recorta a personagem e prepara/envia os trechos do vídeo (~10–60s). */
export const maxDuration = 300;

/** Duração máxima por vídeo e cota diária (em segundos de vídeo) por conta. */
const MAX_SEGUNDOS = Number(process.env.VIDEO_MAX_SECONDS ?? 60);
const COTA_DIARIA = Number(process.env.VIDEO_DAILY_SECONDS ?? 180);

const BodySchema = z.object({
  characterId: z.string().min(1),
  /** Vídeo de origem: arquivo no S3 (videoKey) OU link já buscado (linkId, /api/videos/link). */
  videoKey: z.string().min(1).optional(),
  linkId: z.string().min(1).optional(),
  /** Obrigatória com link: declaração de direito de uso do vídeo. */
  direitos: z.boolean().optional(),
  /** Troca automática da pessoa principal: a imagem do personagem. */
  imageKey: z.string().min(1).optional(),
  /**
   * Escolher quem trocar: cada pessoa marcada no vídeo (clique, em frações do
   * quadro, e o instante) com a imagem do personagem que entra no lugar dela.
   */
  pessoas: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        t: z.number().min(0),
        imageKey: z.string().min(1),
      }),
    )
    .min(1)
    .max(3)
    .optional(),
  /** kling = Kling O1 Edit (padrão) · seedance = Seedance 2.5 (premium). Os dois no fal.ai. */
  motor: z.enum(["kling", "seedance"]).default("kling"),
  /** Pede pra remover legendas/textos da tela no mesmo passo. */
  removerTexto: z.boolean().default(false),
});

/**
 * POST — troca a pessoa do vídeo pelo personagem. Assíncrono: devolve o id do
 * job; o cliente acompanha em /api/videos/jobs/[id].
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
  if (!!body.videoKey === !!body.linkId)
    return NextResponse.json(
      { error: "Informe o vídeo (arquivo ou link).", code: "BAD_INPUT" },
      { status: 400 },
    );
  // Uma imagem por pessoa marcada, ou uma só para a pessoa principal.
  const imagens = body.pessoas
    ? body.pessoas.map((p) => p.imageKey)
    : body.imageKey
      ? [body.imageKey]
      : [];
  if (!imagens.length)
    return NextResponse.json(
      { error: "Escolha a imagem do personagem.", code: "BAD_INPUT" },
      { status: 400 },
    );
  if (
    (body.videoKey && !ownsKey(userId, body.videoKey)) ||
    !imagens.every((k) => ownsKey(userId, k))
  )
    return NextResponse.json(
      { error: "Arquivo não encontrado." },
      { status: 404 },
    );

  // Vídeo por link: lê da cópia temporária no fal (nunca do S3) e exige a declaração de direito de uso.
  let link: {
    url: string;
    plataforma: string;
    fal_url: string;
    titulo: string | null;
  } | null = null;
  if (body.linkId) {
    if (body.direitos !== true)
      return NextResponse.json(
        {
          error: "Marque a declaração de direito de uso do vídeo.",
          code: "BAD_INPUT",
        },
        { status: 400 },
      );
    const { rows } = await getPool()!.query<{
      url: string;
      plataforma: string;
      fal_url: string;
      titulo: string | null;
    }>(
      `select url, plataforma, fal_url, titulo from links_video
       where id = $1 and user_id = $2 and created_at > now() - interval '24 hours'`,
      [body.linkId, userId],
    );
    link = rows[0] ?? null;
    if (!link)
      return NextResponse.json(
        { error: "Link expirado. Busque o vídeo de novo.", code: "BAD_INPUT" },
        { status: 400 },
      );
    await getPool()!.query(
      "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'uso_video_link', $4, $5)",
      [
        nanoid(14),
        userId,
        body.characterId,
        `${DECLARACAO_VIDEO_LINK} [${link.url}]`,
        readIp(req),
      ],
    );
  }

  const fal = getFal();
  if (!pool || !fal)
    return NextResponse.json(
      {
        error: "Troca de vídeo não configurada (FAL_KEY).",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  const premium = body.motor === "seedance";

  // Limites do plano: espaço e vídeos ao mesmo tempo. A vaga vale até o job
  // ser registrado — a partir daí, o próprio job em processamento ocupa a vaga.
  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "video");
  if (vaga instanceof NextResponse) return vaga;

  let cobranca: Cobranca | null = null;
  try {
    return await comPastaTemporaria(async (dir) => {
      const arquivo = path.join(dir, "entrada.mp4");
      if (link) await baixarVideo(link.fal_url, arquivo);
      else await downloadToFile(s3, body.videoKey!, arquivo);
      const info = await probe(arquivo);
      // Duração medida no servidor: é ela que vale pra cota e pros limites.
      const { duracao } = info;
      if (duracao > MAX_SEGUNDOS)
        return NextResponse.json(
          {
            error: `Vídeo com ${Math.round(duracao)}s. O máximo é ${MAX_SEGUNDOS}s — corte antes de enviar.`,
            code: "BAD_INPUT",
          },
          { status: 400 },
        );
      const minimo = premium
        ? SEEDANCE_TROCA.minSegundos
        : KLING_TROCA.minSegundos;
      if (duracao < minimo)
        return NextResponse.json(
          {
            error: `O vídeo precisa ter pelo menos ${minimo}s.`,
            code: "BAD_INPUT",
          },
          { status: 400 },
        );

      // Plano: motor e duração permitidos.
      const plano = await planoAtual(userId);
      const bloqueio =
        bloqueioTroca(plano, duracao) ??
        (premium ? bloqueioTrocaPremium(plano) : null);
      if (bloqueio)
        return NextResponse.json(
          { error: bloqueio, code: "PLANO" },
          { status: 403 },
        );

      // Sem login (modo dev) vale a cota diária fixa em segundos; com créditos, o saldo é o limite.
      if (!creditosAtivos()) {
        const cota = await hit(
          `vid:${userId}`,
          COTA_DIARIA,
          86_400,
          Math.ceil(duracao),
        );
        if (!cota.ok)
          return NextResponse.json(
            {
              error: `Esse vídeo passaria do limite de ${COTA_DIARIA}s de vídeo por dia. Libera em ~${Math.ceil(cota.retryAfter / 3600)}h.`,
              code: "QUOTA_EXCEEDED",
            },
            { status: 429 },
          );
      }

      const creditos = premium
        ? creditosTrocaPremium(duracao)
        : creditosTroca(duracao);
      const cobrado = await cobrarOuResponder(
        userId,
        creditos,
        "video_troca",
        body.motor,
      );
      if (cobrado instanceof NextResponse) return cobrado;
      cobranca = cobrado.cobranca;

      const jobId = nanoid(12);
      // Quem trocar: descrição de cada pessoa marcada (Gemini lê o quadro marcado).
      const descricoes = body.pessoas
        ? await descreverPessoas(
            arquivo,
            body.pessoas.map((p) => ({
              ...p,
              t: Math.min(p.t, Math.max(0, duracao - 0.1)),
            })),
            dir,
          )
        : [];
      // Personagens sem fundo + vídeo em trechos (webhook do fal em cada um).
      const alvos = await Promise.all(
        imagens.map(async (key, i) => ({
          personagemUrl: await personagemSemFundo(
            fal,
            await getObjectBuffer(s3, key),
          ),
          descricao: descricoes[i],
        })),
      );
      const troca = await iniciarTroca({
        fal,
        motor: body.motor,
        arquivo,
        info,
        alvos,
        removerTexto: body.removerTexto,
        jobId,
      });
      const custo = premium ? custoTrocaPremium(duracao) : custoTroca(duracao);

      await pool.query(
        `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
       values ($1, $2, $3, $4, 'substituir', $5, $6, $7, $8)`,
        [
          jobId,
          userId,
          body.characterId,
          "fal",
          MOTORES_TROCA[body.motor].modelo,
          troca.segmentos[0].requestId,
          JSON.stringify({
            videoKey: body.videoKey,
            link: link
              ? {
                  url: link.url,
                  plataforma: link.plataforma,
                  titulo: link.titulo,
                }
              : undefined,
            imageKey: imagens[0],
            pessoas: body.pessoas?.map((p, i) => ({
              ...p,
              descricao: descricoes[i],
            })),
            // Trechos na fila e o áudio original (volta no vídeo final).
            ...troca,
            removerTexto: body.removerTexto,
            // Devolvida pela rota de acompanhamento se o serviço falhar.
            cobranca,
          }),
          duracao,
        ],
      );

      return NextResponse.json({
        jobId,
        duracao,
        custoEstimado: custo,
        creditos,
      });
    });
  } catch (e) {
    await estornarSeHouver(cobranca);
    console.error("[videos/substituir]", e);
    return NextResponse.json(
      { error: mensagemDeErro(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}
