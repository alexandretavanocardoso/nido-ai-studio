import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  cobrarOuResponder,
  estornarParcial,
  estornarSeHouver,
  planoAtual,
  type Cobranca,
} from "@/lib/creditos";
import { getPool } from "@/lib/db";
import {
  armazenamentoOuResponder,
  liberarVaga,
  somarArmazenamento,
  vagaOuResponder,
} from "@/lib/limites";
import { carregarPersonagem } from "@/lib/personagens";
import {
  bloqueioVideoFalado,
  CREDITOS_CENARIO,
  creditosVideoFalado,
} from "@/lib/planos";
import {
  getObjectBuffer,
  newKey,
  ownsKey,
  presignGet,
  putObject,
} from "@/lib/storage/s3";
import {
  criarAvatarDaCena,
  enviarCorpoInteiro,
  enviarVideoFalado,
  formatoDaImagem,
  MODELO_CORPO,
  estadoAvatar,
  idDaEspera,
  MODELO_FALADO,
  recorteParaAvatar,
  retratoNoCenario,
  type CenaFalada,
} from "@/lib/video/falado";
import {
  cenasDaFala,
  CORPO_MAX_SEGUNDOS,
  DURACOES_FALADO,
  FALA_MAX_CARACTERES,
  MAX_CENAS_FALADAS,
  segundosDaCenaInteira,
  segundosDoMp3,
} from "@/lib/video/precos";
import { getRunway, mensagemDeErroRunway } from "@/lib/video/runway";
import { contextoVideo } from "@/lib/video/server";
import {
  falar,
  getEleven,
  mensagemDeErroVoz,
  vozPermitida,
} from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  characterId: z.string().min(1),
  imageKey: z.string().min(1, "Escolha a imagem do personagem."),
  voiceId: z.string().min(1, "Escolha a voz do personagem."),
  /** O que o personagem fala: vira áudio com a voz dele (ElevenLabs). */
  fala: z
    .string()
    .trim()
    .min(2, "Escreva o que o personagem vai falar.")
    .max(FALA_MAX_CARACTERES),
  /**
   * Cenário de cada cena (cada parágrafo da fala é uma cena). Vazio: o fundo
   * da imagem escolhida.
   */
  cenarios: z
    .array(z.string().trim().max(400))
    .max(MAX_CENAS_FALADAS)
    .default([]),
  duracao: z.number().int(),
  /** close: avatar (cabeça e ombros) · inteiro: corpo inteiro (Hailuo 3). */
  enquadramento: z.enum(["close", "inteiro"]).default("close"),
});

/** Quanto a fala pode passar da duração escolhida antes de ser recusada. */
const FOLGA = 1.15;

/** Erro com resposta pronta para o usuário (créditos devolvidos). */
class Recusa extends Error {}

/**
 * POST — vídeo falado: a fala é gerada com a voz do personagem (ElevenLabs) e
 * o Runway (gwm1_avatars) gera o vídeo dele falando o áudio, com os lábios
 * sincronizados. O vídeo dura o que a fala durar.
 * Assíncrono: devolve o id do job, acompanhado em /api/videos/jobs/[id].
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const pool = getPool();
  const runway = getRunway();
  const el = getEleven();
  if (!pool || !runway || !el)
    return NextResponse.json(
      {
        error:
          "Vídeo falado não configurado (RUNWAYML_API_SECRET e ELEVENLABS_API_KEY).",
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
  if (!(DURACOES_FALADO as readonly number[]).includes(body.duracao))
    return NextResponse.json(
      {
        error: `Duração inválida: use ${DURACOES_FALADO.join(", ")}s.`,
        code: "BAD_INPUT",
      },
      { status: 400 },
    );
  if (!ownsKey(userId, body.imageKey))
    return NextResponse.json(
      { error: "Imagem não encontrada." },
      { status: 404 },
    );
  // Só vozes da própria conta, ou as prontas da biblioteca.
  if (!(await vozPermitida(pool, el, userId, body.voiceId)))
    return NextResponse.json({ error: "Voz não encontrada." }, { status: 404 });

  const bloqueio = bloqueioVideoFalado(await planoAtual(userId));
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );
  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "video");
  if (vaga instanceof NextResponse) return vaga;

  // Cobra o teto (a duração escolhida); o que a fala não usar volta em seguida.
  const falas = cenasDaFala(body.fala);
  const cenarios = falas.map((_, i) => body.cenarios[i] ?? "");
  const inteiro = body.enquadramento === "inteiro";
  // Corpo inteiro: cada cena gera no mínimo 5s e segundos inteiros, então o
  // teto considera essa folga por cena (o que não for usado volta).
  const teto =
    creditosVideoFalado(
      inteiro
        ? Math.ceil(body.duracao * FOLGA) + 1 + 6 * falas.length
        : body.duracao,
      body.enquadramento,
    ) +
    cenarios.filter(Boolean).length * CREDITOS_CENARIO;
  const cobrado = await cobrarOuResponder(
    userId,
    teto,
    "video_falado",
    inteiro ? MODELO_CORPO : MODELO_FALADO,
  );
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }
  let cobranca: Cobranca | null = cobrado.cobranca;

  try {
    // Uma fala por cena (cada parágrafo), todas com a voz do personagem.
    let mp3s: Buffer[];
    try {
      mp3s = await Promise.all(falas.map((f) => falar(el, body.voiceId, f)));
    } catch (e) {
      throw new Recusa(mensagemDeErroVoz(e));
    }
    const real = mp3s.reduce((t, m) => t + segundosDoMp3(m.length), 0);
    if (real > body.duracao * FOLGA + 1)
      throw new Recusa(
        `A fala ficou com ${Math.round(real)}s e passa dos ${body.duracao}s escolhidos. Encurte o texto ou escolha uma duração maior.`,
      );
    const porCena = mp3s.map((m) => segundosDoMp3(m.length));
    if (inteiro && porCena.some((s) => s > CORPO_MAX_SEGUNDOS + 0.3))
      throw new Recusa(
        `No corpo inteiro cada cena pode ter até ${CORPO_MAX_SEGUNDOS}s de fala. Divida a fala em mais cenas (uma linha em branco entre elas) ou encurte.`,
      );
    // Duração do vídeo (a da fala) e segundos cobrados: no corpo inteiro o
    // modelo gera segundos inteiros, no mínimo 5 por cena.
    const duracaoVideo = Math.min(body.duracao, Math.max(1, Math.ceil(real)));
    const segundos = inteiro
      ? porCena.reduce((t, s) => t + segundosDaCenaInteira(s), 0)
      : duracaoVideo;

    // Close: o avatar só aceita retrato de perto, então recorta em volta do
    // rosto. Corpo inteiro: a imagem vai inteira. Cada cena com cenário ganha
    // essa mesma imagem no lugar descrito; se a imagem do cenário falhar, a
    // cena fica com o fundo original (e não é cobrada).
    const original = await getObjectBuffer(s3, body.imageKey);
    const formato = await formatoDaImagem(original);
    const retrato = inteiro ? formato.jpeg : await recorteParaAvatar(original);
    const noCenario = await Promise.all(
      cenarios.map((c) =>
        c
          ? retratoNoCenario(
              retrato,
              c,
              inteiro ? { proporcao: formato.proporcao } : undefined,
            ).catch((e) => {
              console.warn("[videos/falado] cenário:", (e as Error).message);
              return null;
            })
          : null,
      ),
    );

    const creditos =
      creditosVideoFalado(segundos, body.enquadramento) +
      noCenario.filter(Boolean).length * CREDITOS_CENARIO;
    if (cobranca && creditos < cobranca.total) {
      // Mesma divisão do estorno parcial: os avulsos voltam primeiro.
      const devolver = cobranca.total - creditos;
      await estornarParcial(cobranca, devolver, "video_falado_ajuste");
      const doAvulso = Math.min(devolver, cobranca.doAvulso);
      cobranca = {
        ...cobranca,
        total: creditos,
        doAvulso: cobranca.doAvulso - doAvulso,
        doPlano: cobranca.doPlano - (devolver - doAvulso),
      };
    }

    const audioKeys = await Promise.all(
      mp3s.map(async (mp3) => {
        const key = newKey(userId, "audios", "audio/mpeg");
        await putObject(s3, key, mp3, "audio/mpeg");
        await somarArmazenamento(userId, mp3.length);
        return key;
      }),
    );

    const jobId = nanoid(12);
    const personagem = await carregarPersonagem(userId, body.characterId);
    const nome = personagem?.identidade.nome || "Personagem";
    const guardar = async (imagem: Buffer) => {
      const key = newKey(userId, "refs", "image/jpeg");
      await putObject(s3, key, imagem, "image/jpeg");
      return key;
    };
    // No corpo inteiro a imagem base vai como está (já é a do personagem).
    const retratoKey = await guardar(retrato);
    const imagens = await Promise.all(
      noCenario.map((img) => (img ? guardar(img) : retratoKey)),
    );
    /** Avatar do retrato sem cenário: reaproveitado entre vídeos da mesma imagem. */
    let avatarBase: string | null = null;
    let cenas: CenaFalada[];
    let idExterno: string;
    try {
      if (inteiro) {
        cenas = imagens.map((imagemKey, i) => ({
          imagemKey,
          audioKey: audioKeys[i],
          duracao: segundosDaCenaInteira(porCena[i]),
        }));
        idExterno = await enviarCorpoInteiro(
          runway,
          s3,
          cenas[0],
          formato.vertical,
        );
      } else {
        if (noCenario.some((img) => !img)) {
          const { rows } = await pool.query<{ avatar: string }>(
            `select input->>'avatarId' as avatar from video_jobs
           where user_id = $1 and modelo = $2 and input->>'imageKey' = $3
             and input->>'avatarId' is not null and status <> 'erro'
           order by created_at desc limit 1`,
            [userId, MODELO_FALADO, body.imageKey],
          );
          const anterior = rows[0]?.avatar;
          if (
            anterior &&
            (await estadoAvatar(runway, anterior)).estado === "pronto"
          )
            avatarBase = anterior;
        }
        cenas = imagens.map((imagemKey, i) => ({
          imagemKey,
          audioKey: audioKeys[i],
          ...(noCenario[i]
            ? {}
            : { base: true, ...(avatarBase ? { avatarId: avatarBase } : {}) }),
        }));
        // Só o avatar da primeira cena é criado agora: o Runway recusa avatares
        // criados ao mesmo tempo, então os outros esperam a vez (na finalização).
        if (cenas[0].avatarId) {
          idExterno = await enviarVideoFalado(runway, s3, {
            avatarId: cenas[0].avatarId,
            audioKey: cenas[0].audioKey,
          });
        } else {
          cenas[0].avatarId = await criarAvatarDaCena(
            runway,
            s3,
            nome,
            cenas[0],
          );
          idExterno = idDaEspera(cenas[0].avatarId);
        }
      }
    } catch (e) {
      throw new Recusa(mensagemDeErroRunway(e));
    }

    await pool.query(
      `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
       values ($1, $2, $3, 'runway', 'criar', $4, $5, $6, $7)`,
      [
        jobId,
        userId,
        body.characterId,
        inteiro ? MODELO_CORPO : MODELO_FALADO,
        idExterno!,
        JSON.stringify({
          imageKey: body.imageKey,
          avatarId: avatarBase ?? undefined,
          audioKey: cenas![0].audioKey,
          voiceId: body.voiceId,
          fala: body.fala,
          cenarios,
          // Cenas a gerar e as que já ficaram prontas (ver lib/video/falado.ts).
          falado: {
            nome,
            cenas: cenas!,
            partes: [],
            ...(inteiro ? { corpo: { vertical: formato.vertical } } : {}),
          },
          // Devolvida pela finalização se o serviço falhar.
          cobranca,
        }),
        duracaoVideo,
      ],
    );
    return NextResponse.json({ jobId, duracao: duracaoVideo, creditos });
  } catch (e) {
    await estornarSeHouver(cobranca);
    if (e instanceof Recusa)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    console.error("[videos/falado]", e);
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
