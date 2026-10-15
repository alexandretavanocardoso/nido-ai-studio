import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { readIp } from "@/lib/ai/rate-limit";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import { DECLARACAO_VIDEO_LINK } from "@/lib/declaracoes";
import { cenaParaLucy } from "@/lib/live/cena";
import { enviarSombraVideo, getDecart, MODELO_SOMBRA, pedidoDaSombra } from "@/lib/live/decart";
import { contextoLive } from "@/lib/live/rota";
import type { InputSombraVideo } from "@/lib/live/sombra-video";
import {
  creditosSombraVideo,
  SOMBRA_VIDEO_DIRETO_MAX_SEGUNDOS,
  SOMBRA_VIDEO_MAX_SEGUNDOS,
} from "@/lib/planos";
import { SOMBRA_SEM_PERSONAGEM } from "@/lib/sombra";
import { ownsKey, presignGet } from "@/lib/storage/s3";
import { probe } from "@/lib/video/ffmpeg";
import { vozPermitida } from "@/lib/voz/elevenlabs";
import type { FonteSombra } from "@/worker/sombra/processar";
import { ehLinkVod, ErroVod, infoDoVod } from "@/worker/sombra/vod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z
  .object({
    /** Vídeo enviado (key no S3)… */
    videoKey: z.string().min(1).optional(),
    /** …ou o link já buscado (/api/videos/link devolve o linkId)… */
    linkId: z.string().min(1).optional(),
    /** …ou o link de uma live gravada da Twitch ou do Kick (VOD ou clipe). */
    link: z.string().trim().url("Cole um link válido.").max(2000).optional(),
    /** Só um trecho (segundos). Sem ele, o vídeo inteiro. */
    trecho: z.object({ inicio: z.number().min(0), fim: z.number().positive() }).optional(),
    /** Foto do influencer que entra no lugar da pessoa. */
    imageKey: z.string().min(1, "Escolha a foto do influencer."),
    /** Voz para trocar a do vídeo (vazio: fica a original). */
    voiceId: z.string().min(1).nullable().optional(),
    /** Fundo novo (opcional), em texto. */
    cenario: z.string().trim().max(400).optional(),
    declaracao: z.literal(DECLARACAO_VIDEO_LINK, {
      error: "Marque a declaração de que pode usar este vídeo.",
    }),
  })
  .refine((b) => [b.videoKey, b.linkId, b.link].filter(Boolean).length === 1, {
    message: "Envie um vídeo ou cole um link.",
  });

const semCreditosNaDecart = (e: unknown) => /\b402\b|insufficient credits/i.test((e as Error)?.message ?? "");

/**
 * POST — Sombra de vídeo gravado: troca a pessoa do vídeo (uma live gravada
 * inteira, ou um trecho dela) pelo influencer da foto, com o Lucy 2.5 da
 * Decart em lote. Cobra pelo trecho; o resultado aparece na Sombra, e o
 * andamento em /api/videos/jobs/[id], como os outros vídeos.
 *  - Vídeo inteiro de até 3 min (arquivo ou link buscado): o app manda direto
 *    para a Decart e finaliza (lib/live/sombra-video.ts).
 *  - O resto (lives longas, trechos, Twitch e Kick): o processo da Sombra
 *    (worker/sombra) processa em partes; aqui só cobra e deixa na fila.
 */
export async function POST(req: Request) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, pool, s3, el } = ctx;
  if (!getDecart())
    return NextResponse.json(
      { error: "Sombra não configurada no servidor (DECART_API_KEY).", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;
  if (!ownsKey(userId, body.imageKey) || (body.videoKey && !ownsKey(userId, body.videoKey)))
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  if (body.voiceId && !(await vozPermitida(pool, el, userId, body.voiceId)))
    return NextResponse.json({ error: "Voz não encontrada." }, { status: 404 });

  // O vídeo e a duração vêm do servidor (não do navegador): é por ela que cobra.
  let total: number;
  let fonte: FonteSombra;
  /** Para mandar direto à Decart (vídeo curto). */
  let videoUrl: string | null = null;
  if (body.link) {
    if (!ehLinkVod(body.link))
      return NextResponse.json(
        { error: "Cole o link de um vídeo (VOD) ou clipe da Twitch ou do Kick.", code: "BAD_INPUT" },
        { status: 400 },
      );
    try {
      total = (await infoDoVod(body.link)).duracao;
    } catch (e) {
      if (e instanceof ErroVod) return NextResponse.json({ error: e.message, code: "BAD_INPUT" }, { status: 400 });
      console.error("[sombra-video] link", e);
      return NextResponse.json({ error: "Não consegui abrir esse link agora. Tente de novo." }, { status: 502 });
    }
    fonte = { tipo: "vod", url: body.link };
  } else if (body.linkId) {
    const { rows } = await pool.query<{ fal_url: string; duracao: number }>(
      "select fal_url, duracao from links_video where id = $1 and user_id = $2",
      [body.linkId, userId],
    );
    if (!rows[0])
      return NextResponse.json({ error: "Link não encontrado. Cole de novo." }, { status: 404 });
    total = Number(rows[0].duracao);
    fonte = { tipo: "url", url: rows[0].fal_url };
    videoUrl = rows[0].fal_url;
  } else {
    videoUrl = await presignGet(s3, body.videoKey!, 6 * 3600);
    try {
      total = (await probe(videoUrl)).duracao;
    } catch (e) {
      console.warn("[sombra-video] duração", (e as Error).message);
      return NextResponse.json(
        { error: "Não consegui ler esse vídeo. Envie um MP4, MOV ou WebM." },
        { status: 400 },
      );
    }
    fonte = { tipo: "arquivo", key: body.videoKey! };
  }
  if (!(total > 0))
    return NextResponse.json({ error: "Não consegui ler a duração desse vídeo.", code: "BAD_INPUT" }, { status: 400 });

  // Trecho: dentro do vídeo; o vídeo inteiro se não vier.
  const inicio = Math.min(Math.max(0, body.trecho?.inicio ?? 0), total);
  const fim = Math.min(total, body.trecho?.fim ?? total);
  const duracao = fim - inicio;
  if (duracao < 1)
    return NextResponse.json({ error: "Escolha um trecho de pelo menos 1 segundo.", code: "BAD_INPUT" }, { status: 400 });
  if (duracao > SOMBRA_VIDEO_MAX_SEGUNDOS + 1)
    return NextResponse.json({ error: "O trecho pode ter até 12 horas.", code: "BAD_INPUT" }, { status: 400 });
  const inteiro = inicio < 0.5 && fim > total - 0.5;
  const direto = !!videoUrl && inteiro && duracao <= SOMBRA_VIDEO_DIRETO_MAX_SEGUNDOS;

  const cobrado = await cobrarOuResponder(userId, creditosSombraVideo(duracao), "sombra_video", MODELO_SOMBRA);
  if (cobrado instanceof NextResponse) return cobrado;
  const jobId = nanoid(12);
  try {
    const cena = body.cenario ? await cenaParaLucy(body.cenario) : null;
    if (direto) {
      const idExterno = await enviarSombraVideo({
        videoUrl: videoUrl!,
        imagemUrl: await presignGet(s3, body.imageKey, 6 * 3600),
        cena,
      });
      const origem: InputSombraVideo["origem"] = fonte.tipo === "arquivo" ? { key: fonte.key } : { url: videoUrl! };
      const input: InputSombraVideo & Record<string, unknown> = {
        origemDoJob: "sombra_video",
        origem,
        voiceId: body.voiceId ?? null,
        imageKey: body.imageKey,
        // Antes e depois na Sombra (só com o vídeo enviado, que fica guardado).
        ...("key" in origem ? { antesKey: origem.key } : {}),
        cobranca: cobrado.cobranca,
      };
      await pool.query(
        `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
         values ($1, $2, $3, 'decart', 'substituir', $4, $5, $6, $7)`,
        [jobId, userId, SOMBRA_SEM_PERSONAGEM, MODELO_SOMBRA, idExterno, JSON.stringify(input), duracao],
      );
    } else {
      // Fica na fila do processo da Sombra (worker/sombra), que pega pelo provedor 'nido'.
      const input = {
        origemDoJob: "sombra_video",
        fonte,
        trecho: inteiro ? null : { inicio, fim },
        pedido: pedidoDaSombra(cena),
        voiceId: body.voiceId ?? null,
        imageKey: body.imageKey,
        cobranca: cobrado.cobranca,
      };
      await pool.query(
        `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
         values ($1, $2, $3, 'nido', 'substituir', $4, $1, $5, $6)`,
        [jobId, userId, SOMBRA_SEM_PERSONAGEM, MODELO_SOMBRA, JSON.stringify(input), duracao],
      );
    }
    await pool.query(
      "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'uso_video_sombra', $4, $5)",
      [nanoid(14), userId, SOMBRA_SEM_PERSONAGEM, DECLARACAO_VIDEO_LINK, readIp(req)],
    );
    return NextResponse.json({ jobId, duracao, creditos: cobrado.cobranca?.total ?? 0, emPartes: !direto });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    console.error("[sombra-video]", e);
    return NextResponse.json(
      {
        error: semCreditosNaDecart(e)
          ? "A conta da Decart está sem créditos. Os créditos foram devolvidos."
          : "A Decart recusou o vídeo. Os créditos foram devolvidos.",
        code: "PROVIDER_ERROR",
      },
      { status: 502 },
    );
  }
}
