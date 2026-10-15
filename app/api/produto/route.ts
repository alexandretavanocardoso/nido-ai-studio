import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { readIp } from "@/lib/ai/rate-limit";
import {
  generateImage,
  ImageBlockedError,
  ImageConfigError,
  shrinkReferencia,
} from "@/lib/ai/gemini";
import {
  cobrarOuResponder,
  estornarParcial,
  estornarSeHouver,
  planoAtual,
  type Cobranca,
} from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { getFal, mensagemDeErro } from "@/lib/fal";
import { MusicaSchema } from "@/lib/musica";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import { carregarPersonagem, registrarVideoNoBanco } from "@/lib/personagens";
import {
  bloqueioCriarVideo,
  bloqueioVideoFalado,
  creditosCriarVideo,
  creditosVideoFalado,
  PLANOS,
} from "@/lib/planos";
import {
  CENA_MAX_CARACTERES,
  cenasDoProduto,
  creditosImagemDaCena,
  DURACOES_PRODUTO,
  MAX_CENAS_MUDAS_PRODUTO,
  MAX_FOTOS_PRODUTO,
  MODELOS_FALADO_PRODUTO,
  MODELOS_MUDO_PRODUTO,
  PRODUTO_MAX_CARACTERES,
  PRODUTO_SEM_PERSONAGEM,
  promptImagemDaCena,
  promptVideoDaCena,
} from "@/lib/produto";
import {
  getObjectBuffer,
  newKey,
  ownsKey,
  presignGet,
  putObject,
} from "@/lib/storage/s3";
import {
  enviarCorpoInteiro,
  MODELO_CORPO,
  type CenaFalada,
} from "@/lib/video/falado";
import {
  CORPO_MAX_SEGUNDOS,
  FALA_MAX_CARACTERES,
  MODELOS_CRIAR,
  MODELOS_FALADO,
  provedorCriar,
  provedorFalado,
  segundosDaCenaInteira,
  segundosDoMp3,
  type ModeloCriar,
  type ModeloFalado,
} from "@/lib/video/precos";
import {
  enviarCriacao,
  getRunway,
  mensagemDeErroRunway,
} from "@/lib/video/runway";
import {
  enviarCriacaoSapiens,
  enviarFaladoSapiens,
  getSapiens,
  mensagemDeErroSapiens,
  MODELO_SAPIENS_FALADO,
  recortarParaFormato,
} from "@/lib/video/sapiens";
import { contextoVideo } from "@/lib/video/server";
import { enviarCriacaoVeo, getVeo, mensagemDeErroVeo } from "@/lib/video/veo";
import {
  enviarCriacaoWan,
  enviarFaladoWan,
  WAN_REFERENCIA,
} from "@/lib/video/wan";
import {
  falar,
  getEleven,
  mensagemDeErroVoz,
  vozPermitida,
} from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CenaSchema = z.object({
  cena: z
    .string()
    .trim()
    .min(3, "Descreva cada cena.")
    .max(CENA_MAX_CARACTERES),
  fala: z.string().trim().max(FALA_MAX_CARACTERES).optional(),
});

const BodySchema = z.object({
  /** Personagem escolhido, ou null com uma foto avulsa. */
  characterId: z.string().min(1).nullable().default(null),
  imageKey: z.string().min(1, "Escolha quem aparece no vídeo."),
  /** Fotos do produto (a primeira é a principal), até MAX_FOTOS_PRODUTO. */
  produtoKeys: z
    .array(z.string().min(1))
    .min(1, "Envie a foto do produto.")
    .max(MAX_FOTOS_PRODUTO),
  produto: z
    .string()
    .trim()
    .min(2, "Diga qual é o produto.")
    .max(PRODUTO_MAX_CARACTERES),
  modo: z.enum(["falado", "mudo"]),
  modelo: z.string(),
  duracao: z.number().int(),
  vertical: z.boolean().default(true),
  /** Sem fala: som ambiente gerado pelo modelo (só nos que têm áudio). */
  audio: z.boolean().default(false),
  voiceId: z.string().optional(),
  cenas: z.array(CenaSchema).min(1).max(MAX_CENAS_MUDAS_PRODUTO),
  /** Música de fundo (opcional), por baixo do vídeo pronto. */
  musica: MusicaSchema.optional(),
});

/** Modelo gravado no job (coluna `modelo`): o id do modelo no serviço. */
const faladoNoServico = (m: ModeloFalado): string =>
  m === "hailuo3"
    ? MODELO_CORPO
    : m === "wan3"
      ? WAN_REFERENCIA
      : MODELO_SAPIENS_FALADO[m]!;

/** Quanto a fala pode passar da duração escolhida antes de ser recusada. */
const FOLGA = 1.15;

/** Erro com resposta pronta para o usuário (créditos devolvidos). */
class Recusa extends Error {}

/** Item do histórico da tela. */
export interface VideoDeProduto {
  jobId: string;
  status: string;
  key: string | null;
  erro: string | null;
  duracao: number | null;
  produto: string;
  criadoEm: string;
}

/**
 * GET — os vídeos de produto da conta, dos mais novos para os mais antigos.
 * Em andamento: a tela acompanha em /api/videos/jobs/[id].
 */
export async function GET() {
  const bloqueio = await liberadoOuResponder("video_produto");
  if (bloqueio) return bloqueio;
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { rows } = await getPool()!.query<{
    id: string;
    status: string;
    result_key: string | null;
    error: string | null;
    duracao: string | null;
    produto: string | null;
    created_at: Date;
  }>(
    `select id, status, result_key, error, duracao, input->'produto'->>'nome' as produto, created_at
     from video_jobs where user_id = $1 and input ? 'produto'
     order by created_at desc limit 30`,
    [ctx.userId],
  );
  const videos: VideoDeProduto[] = rows.map((r) => ({
    jobId: r.id,
    status: r.status,
    key: r.result_key,
    erro: r.error,
    duracao: r.duracao === null ? null : Number(r.duracao),
    produto: r.produto ?? "",
    criadoEm: r.created_at.toISOString(),
  }));
  return NextResponse.json({ videos });
}

/**
 * POST — gera o vídeo de produto a partir das cenas montadas (ver
 * /api/produto/roteiro). Cada cena ganha uma imagem nova (a pessoa com o
 * produto, Nano Banana) e, com fala, o áudio na voz escolhida; a primeira
 * cena já vai para o modelo e as outras seguem na finalização do job.
 * Assíncrono: devolve o id do job, acompanhado em /api/videos/jobs/[id].
 */
export async function POST(req: Request) {
  const bloqueado = await liberadoOuResponder("video_produto");
  if (bloqueado) return bloqueado;
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
  const falado = body.modo === "falado";
  const modelos: readonly string[] = falado
    ? MODELOS_FALADO_PRODUTO
    : MODELOS_MUDO_PRODUTO;
  if (
    !modelos.includes(body.modelo) ||
    !(DURACOES_PRODUTO as readonly number[]).includes(body.duracao)
  )
    return NextResponse.json(
      { error: "Modelo ou duração inválidos.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const planejadas = cenasDoProduto(body.modo, body.modelo, body.duracao);
  if (body.cenas.length !== planejadas.length)
    return NextResponse.json(
      {
        error: "As cenas não batem com a duração escolhida. Monte as cenas de novo.",
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  if (
    !ownsKey(userId, body.imageKey) ||
    body.produtoKeys.some((k) => !ownsKey(userId, k)) ||
    (body.musica && !ownsKey(userId, body.musica.key))
  )
    return NextResponse.json(
      { error: "Imagem não encontrada." },
      { status: 404 },
    );

  // Serviços: a voz e o modelo falado, ou o modelo do "Criar vídeo".
  const el = falado ? getEleven() : null;
  const runway = getRunway();
  const sapiens = getSapiens();
  const fal = getFal();
  const gemini = getVeo();
  const modeloFalado = body.modelo as ModeloFalado;
  const modeloMudo = body.modelo as ModeloCriar;
  const provedor = falado
    ? provedorFalado(modeloFalado)
    : provedorCriar(modeloMudo, {
        runway: !!runway,
        sapiens: !!sapiens,
        fal: !!fal,
        gemini: !!gemini,
      });
  const ligado =
    provedor === "runway"
      ? !!runway
      : provedor === "sapiens"
        ? !!sapiens
        : provedor === "fal"
          ? !!fal
          : provedor === "google"
            ? !!gemini
            : false;
  if (!pool || !ligado || (falado && !el))
    return NextResponse.json(
      {
        error: "Este modelo de vídeo não está configurado neste servidor.",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  if (falado) {
    if (!body.voiceId)
      return NextResponse.json(
        { error: "Escolha a voz.", code: "BAD_INPUT" },
        { status: 400 },
      );
    if (body.cenas.some((c) => (c.fala ?? "").length < 2))
      return NextResponse.json(
        { error: "Escreva a fala de cada cena.", code: "BAD_INPUT" },
        { status: 400 },
      );
    if (!(await vozPermitida(pool, el!, userId, body.voiceId)))
      return NextResponse.json(
        { error: "Voz não encontrada." },
        { status: 404 },
      );
  }

  const plano = await planoAtual(userId);
  const audio = !falado && MODELOS_CRIAR[modeloMudo].audio && body.audio;
  const motivo = falado
    ? bloqueioVideoFalado(plano)
    : bloqueioCriarVideo(plano, modeloMudo, audio);
  if (motivo)
    return NextResponse.json({ error: motivo, code: "PLANO" }, { status: 403 });
  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "video");
  if (vaga instanceof NextResponse) return vaga;

  // A imagem de cada cena sai no Nano Banana Pro quando o plano tem a qualidade Pro.
  const pro = PLANOS[plano].qualidadePro;
  const imagensCreditos = planejadas.length * creditosImagemDaCena(pro);
  const gerados = planejadas.reduce((t, n) => t + n, 0);
  // Com fala, cobra o teto (cada cena gera segundos inteiros, com um mínimo);
  // o que a fala não usar volta assim que as falas ficam prontas.
  const teto =
    imagensCreditos +
    (falado
      ? creditosVideoFalado(
          Math.min(
            planejadas.length * CORPO_MAX_SEGUNDOS,
            Math.ceil(body.duracao * FOLGA) +
              1 +
              (MODELOS_FALADO[modeloFalado].minSegundos + 1) *
                planejadas.length,
          ),
          modeloFalado,
        )
      : creditosCriarVideo(modeloMudo, gerados, audio));
  const cobrado = await cobrarOuResponder(
    userId,
    teto,
    falado ? "video_falado" : "video_criar",
    `produto:${body.modelo}`,
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }
  let cobranca: Cobranca | null = cobrado.cobranca;

  try {
    const jobId = nanoid(12);
    // A pessoa primeiro; depois as fotos do produto (ângulos e detalhes do mesmo produto).
    const [pessoa, ...fotosProduto] = await Promise.all(
      [body.imageKey, ...body.produtoKeys].map((k) => getObjectBuffer(s3, k).then(shrinkReferencia)),
    );
    const imagemDaCena = async (cena: string): Promise<Buffer> => {
      const pedido = {
        prompt: promptImagemDaCena({
          cena,
          produto: body.produto,
          vertical: body.vertical,
          falado,
          fotosProduto: fotosProduto.length,
        }),
        referencias: [pessoa, ...fotosProduto],
        aspectRatio: body.vertical ? "9:16" : "16:9",
        imageSize: "1K" as const,
        qualidade: pro ? ("pro" as const) : ("padrao" as const),
      };
      try {
        return await generateImage(pedido);
      } catch (e) {
        if (e instanceof ImageConfigError) throw e;
        // Recusa ou falha passageira: uma segunda tentativa costuma passar.
        return generateImage(pedido);
      }
    };

    // Imagens e falas ao mesmo tempo: são o que mais demora.
    const [imagens, mp3s] = await Promise.all([
      Promise.all(body.cenas.map((c) => imagemDaCena(c.cena))).catch((e) => {
        if (e instanceof ImageConfigError) throw e;
        throw new Recusa(
          e instanceof ImageBlockedError
            ? "A IA de imagem recusou uma das cenas. Mude a descrição dela e tente de novo."
            : (e as Error).message,
        );
      }),
      falado
        ? Promise.all(
            body.cenas.map((c) => falar(el!, body.voiceId!, c.fala!)),
          ).catch((e) => {
            throw new Recusa(mensagemDeErroVoz(e));
          })
        : Promise.resolve([] as Buffer[]),
    ]);

    let duracaoVideo = body.duracao;
    let porCena: number[] = [];
    if (falado) {
      porCena = mp3s.map((m) => segundosDoMp3(m.length));
      const real = porCena.reduce((t, s) => t + s, 0);
      if (real > body.duracao * FOLGA + 1)
        throw new Recusa(
          `A fala ficou com ${Math.round(real)}s e passa dos ${body.duracao}s escolhidos. Encurte o texto ou escolha uma duração maior.`,
        );
      const longa = porCena.findIndex((s) => s > CORPO_MAX_SEGUNDOS + 0.3);
      if (longa >= 0)
        throw new Recusa(
          `A fala da cena ${longa + 1} passa de ${CORPO_MAX_SEGUNDOS}s. Encurte essa fala.`,
        );
      duracaoVideo = Math.min(body.duracao, Math.max(1, Math.ceil(real)));
      // Acerta a cobrança: os segundos que as falas de fato geram.
      const creditos =
        imagensCreditos +
        creditosVideoFalado(
          porCena.reduce((t, s) => t + segundosDaCenaInteira(s, modeloFalado), 0),
          modeloFalado,
        );
      if (cobranca && creditos < cobranca.total) {
        const devolver = cobranca.total - creditos;
        await estornarParcial(cobranca, devolver, "estorno_ajuste_falado");
        const doAvulso = Math.min(devolver, cobranca.doAvulso);
        cobranca = {
          ...cobranca,
          total: creditos,
          doAvulso: cobranca.doAvulso - doAvulso,
          doPlano: cobranca.doPlano - (devolver - doAvulso),
        };
      }
    }

    // Guarda as imagens (no formato exato do vídeo, sem fala) e as falas.
    const imagemKeys = await Promise.all(
      imagens.map(async (img) => {
        const key = newKey(userId, "refs", "image/jpeg");
        await putObject(
          s3,
          key,
          falado ? img : await recortarParaFormato(img, body.vertical),
          "image/jpeg",
        );
        return key;
      }),
    );
    const audioKeys = await Promise.all(
      mp3s.map(async (mp3) => {
        const key = newKey(userId, "audios", "audio/mpeg");
        await putObject(s3, key, mp3, "audio/mpeg");
        await somarArmazenamento(userId, mp3.length);
        return key;
      }),
    );

    const personagem = body.characterId
      ? await carregarPersonagem(userId, body.characterId)
      : null;
    const nome = personagem?.identidade.nome || "Influencer";
    const produtoInput = { nome: body.produto, keys: body.produtoKeys };
    // Música de fundo: entra na finalização, depois de unir as cenas (lib/video/musica.ts).
    const musica = body.musica ? { key: body.musica.key, nome: body.musica.nome, origem: body.musica.origem } : undefined;

    let idExterno: string;
    let input: Record<string, unknown>;
    let modeloDoJob: string;
    try {
      if (falado) {
        const cenas: CenaFalada[] = imagemKeys.map((imagemKey, i) => ({
          imagemKey,
          audioKey: audioKeys[i],
          duracao: segundosDaCenaInteira(porCena[i], modeloFalado),
          acao: body.cenas[i].cena,
        }));
        idExterno =
          provedor === "fal"
            ? await enviarFaladoWan(fal!, s3, {
                jobId,
                cena: cenas[0],
                vertical: body.vertical,
              })
            : provedor === "sapiens"
              ? await enviarFaladoSapiens(sapiens!, s3, {
                  modelo: modeloFalado,
                  cena: cenas[0],
                  vertical: body.vertical,
                })
              : await enviarCorpoInteiro(runway!, s3, cenas[0], body.vertical);
        modeloDoJob = faladoNoServico(modeloFalado);
        input = {
          produto: produtoInput,
          musica,
          imageKey: body.imageKey,
          voiceId: body.voiceId,
          cenasProduto: body.cenas,
          // Cenas a gerar e as prontas (ver lib/video/falado.ts).
          falado: {
            nome,
            cenas,
            partes: [],
            corpo: { vertical: body.vertical, modelo: modeloFalado },
          },
        };
      } else {
        const prompts = body.cenas.map((c) => promptVideoDaCena(c.cena));
        const pedido = {
          modelo: modeloMudo,
          imageUrl: await presignGet(s3, imagemKeys[0], 86_400),
          promptText: prompts[0],
          vertical: body.vertical,
          duracao: planejadas[0],
          audio,
        };
        idExterno =
          provedor === "sapiens"
            ? await enviarCriacaoSapiens(sapiens!, pedido)
            : provedor === "fal"
              ? await enviarCriacaoWan(fal!, { ...pedido, jobId })
              : provedor === "google"
                ? await enviarCriacaoVeo(gemini!, pedido)
                : await enviarCriacao(runway!, pedido);
        modeloDoJob = modeloMudo;
        input = {
          produto: produtoInput,
          musica,
          imageKey: body.imageKey,
          cenasProduto: body.cenas,
          promptText: prompts[0],
          vertical: body.vertical,
          audio,
          // Cada cena parte da imagem dela, com o pedido dela (ver lib/video/cadeia.ts).
          cadeia: {
            alvo: body.duracao,
            cenas: planejadas,
            partes: [],
            imagens: imagemKeys,
            prompts,
          },
        };
      }
    } catch (e) {
      throw new Recusa(
        provedor === "fal"
          ? mensagemDeErro(e)
          : provedor === "sapiens"
            ? mensagemDeErroSapiens(e)
            : provedor === "google"
              ? mensagemDeErroVeo(e)
              : mensagemDeErroRunway(e),
      );
    }

    const characterId = personagem ? body.characterId! : PRODUTO_SEM_PERSONAGEM;
    await pool.query(
      `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
       values ($1, $2, $3, $8, 'criar', $4, $5, $6, $7)`,
      [
        jobId,
        userId,
        characterId,
        modeloDoJob,
        idExterno,
        // Devolvida pela finalização se o serviço falhar.
        JSON.stringify({ ...input, cobranca }),
        duracaoVideo,
        provedor,
      ],
    );
    if (body.musica)
      await pool
        .query(
          "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'uso_musica', $4, $5)",
          [nanoid(14), userId, characterId, `${body.musica.declaracao} [${body.musica.key}]`, readIp(req)],
        )
        .catch((e) => console.warn("[produto] declaração da música:", (e as Error).message));
    // Com personagem, o vídeo também aparece no Estúdio dele.
    if (personagem)
      await registrarVideoNoBanco(userId, characterId, {
        name: `Produto: ${body.produto.slice(0, 60)}`,
        duracao: duracaoVideo,
        origem: "criado",
        jobId,
      });
    return NextResponse.json({
      jobId,
      duracao: duracaoVideo,
      creditos: cobranca?.total ?? teto,
    });
  } catch (e) {
    await estornarSeHouver(cobranca);
    if (e instanceof Recusa)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    if (e instanceof ImageConfigError)
      return NextResponse.json(
        { error: e.message, code: "CONFIG_MISSING" },
        { status: 500 },
      );
    console.error("[produto]", e);
    return NextResponse.json(
      {
        error: (e as Error).message || "Falha ao criar o vídeo.",
        code: "UNKNOWN",
      },
      { status: 500 },
    );
  } finally {
    await liberarVaga(vaga.vaga);
  }
}
