import { ESTILOS_TROCA_IDS } from "@/lib/video/estilos";
import path from "node:path";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { hit, readIp } from "@/lib/ai/rate-limit";
import { DECLARACAO_VIDEO_LINK } from "@/lib/declaracoes";
import { baixarVideo } from "@/lib/video/link";
import {
  cobrancaRestante,
  cobrarOuResponder,
  creditosAtivos,
  estornarParcial,
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
import {
  downloadToFile,
  getObjectBuffer,
  newKey,
  ownsKey,
  uploadFromFile,
} from "@/lib/storage/s3";
import {
  cortarInicio,
  cortesDeCamera,
  detectarViradas,
  probe,
  trechosTroca,
} from "@/lib/video/ffmpeg";
import { getFal, mensagemDeErro } from "@/lib/video/fal";
import {
  acaoDoTrecho,
  alvosNosTrechos,
  entradasDosAlvos,
  iniciarTroca,
  MOTORES_TROCA,
  personagemSemFundo,
} from "@/lib/video/troca";
import { descreverPessoas } from "@/lib/video/pessoas";
import {
  acoesDosTrechos,
  linhaDoTempoDosAlvos,
  prepararAncora,
  prepararTomadas,
} from "@/lib/video/ancora";
import {
  custoTroca,
  custoTrocaPremium,
  KLING_TROCA,
  segundosDaTomada,
  trocaPorTomadas,
  QUALIDADES_TROCA,
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
  /** kling = Kling O3 Edit (padrão) · seedance = Seedance 2.5 (premium). Os dois no fal.ai. */
  motor: z.enum(["kling", "seedance"]).default("kling"),
  /** Formato do Kling O3: Standard, Pro ou 4K (o Seedance ignora). */
  qualidade: z.enum(QUALIDADES_TROCA).default("pro"),
  /** Pede pra remover legendas/textos da tela no mesmo passo. */
  removerTexto: z.boolean().default(false),
  /** Estilo visual do vídeo: realista (padrão) ou redesenhado (desenho, anime, 3D). */
  estilo: z.enum(ESTILOS_TROCA_IDS).default("realista"),
  /** Usar só os primeiros N segundos do vídeo (ausente = o vídeo inteiro). */
  segundos: z.union([z.literal(10), z.literal(15), z.literal(30)]).optional(),
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
      let arquivo = path.join(dir, "entrada.mp4");
      let cortado = false;
      if (link) await baixarVideo(link.fal_url, arquivo);
      else await downloadToFile(s3, body.videoKey!, arquivo);
      let info = await probe(arquivo);
      // Só os primeiros N segundos: corta aqui e segue com o trecho como se fosse
      // o vídeo (duração, limites do plano e créditos valem para o trecho).
      if (body.segundos && info.duracao > body.segundos + 0.2) {
        if (body.pessoas?.some((p) => p.t > body.segundos!))
          return NextResponse.json(
            {
              error: `Marque as pessoas dentro dos primeiros ${body.segundos}s do vídeo.`,
              code: "BAD_INPUT",
            },
            { status: 400 },
          );
        const trecho = path.join(dir, "trecho.mp4");
        await cortarInicio(arquivo, body.segundos, trecho);
        arquivo = trecho;
        cortado = true;
        info = await probe(arquivo);
      }
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

      // Cortes de câmera e movimentos bruscos (o Seedance não usa: faz até 30s de uma vez).
      const viradas = premium ? [] : await detectarViradas(arquivo);
      // Vídeo de cortes rápidos (Kling): cada tomada vai sozinha ao motor, as
      // curtas em câmera lenta. O Kling cobra pelo que processa — é isso que é
      // cobrado aqui (o máximo; tomada sem ninguém a trocar é devolvida abaixo).
      const tomadas = premium
        ? null
        : trocaPorTomadas(cortesDeCamera(viradas), duracao);
      let segundosCobrados = tomadas
        ? Number(tomadas.reduce((t, x) => t + segundosDaTomada(x), 0).toFixed(2))
        : duracao;
      let creditos = premium
        ? creditosTrocaPremium(duracao)
        : creditosTroca(segundosCobrados, body.qualidade);
      const cobrado = await cobrarOuResponder(
        userId,
        creditos,
        "video_troca",
        body.motor,
      );
      if (cobrado instanceof NextResponse) return cobrado;
      cobranca = cobrado.cobranca;

      // "Antes e depois": o trecho original que vai ser trocado fica guardado
      // para comparar com o resultado. Vídeo da conta usado inteiro já está lá.
      let antesKey: string | null = !link && !cortado ? body.videoKey! : null;
      if (!antesKey) {
        try {
          antesKey = newKey(userId, "videos", "video/mp4");
          await somarArmazenamento(
            userId,
            await uploadFromFile(s3, antesKey, arquivo, "video/mp4"),
          );
        } catch (e) {
          console.warn("[videos/substituir] original não guardado:", e);
          antesKey = null;
        }
      }

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
      const personagens = await Promise.all(
        imagens.map((key) => getObjectBuffer(s3, key)),
      );
      // Em paralelo: (1) quadro-âncora (só Kling) — a troca feita num quadro do
      // vídeo guia todos os trechos (mesmo visual nas emendas, outras pessoas
      // preservadas) e, sem ninguém marcado, descreve a pessoa principal;
      // (2) personagens sem fundo; (3) com pessoas marcadas, em que momentos
      // cada uma aparece. Tomada por tomada, cada tomada tem a sua âncora: a do
      // vídeo inteiro só é feita se for preciso descrever a pessoa principal.
      const semAncoraGeral = {
        imagem: null,
        descricoes: descricoes as Array<string | undefined>,
        outras: [] as string[],
        naAncora: [] as number[],
      };
      const [ancora, personagensUrl, linha] = await Promise.all([
        body.motor === "kling" && !(tomadas && body.pessoas)
          ? prepararAncora({
              arquivo,
              dir,
              info,
              marcadas: body.pessoas,
              descricoes,
              personagens,
              estilo: body.estilo,
            })
          : semAncoraGeral,
        Promise.all(
          personagens.map((imagem) => personagemSemFundo(fal, imagem)),
        ),
        body.pessoas && !tomadas
          ? linhaDoTempoDosAlvos({
              arquivo,
              dir,
              duracao,
              marcadas: body.pessoas,
              descricoes,
            })
          : null,
      ]);
      const alvos = personagensUrl.map((figura, i) => ({
        personagemUrl: figura.url,
        rostoUrl: figura.rostoUrl,
        descricao: ancora.descricoes[i],
      }));

      let troca: Awaited<ReturnType<typeof iniciarTroca>>;
      let porTrecho: number[][] | undefined;
      let acoes: Array<string | undefined> | undefined;
      /** Para entender um resultado ruim depois: o que foi lido de cada tomada. */
      let resumoDasTomadas:
        | Array<{ inicio: number; duracao: number; alvos: number[]; acao?: string }>
        | undefined;
      if (tomadas) {
        const preparadas = await prepararTomadas({
          arquivo,
          dir,
          info,
          tomadas,
          marcadas: body.pessoas,
          descricoes: ancora.descricoes,
          personagens,
          estilo: body.estilo,
        });
        const enviadas = preparadas.filter((t) => t.presentes.length);
        if (!enviadas.length) {
          await estornarSeHouver(cobranca);
          cobranca = null;
          return NextResponse.json(
            {
              error:
                "Não achei as pessoas marcadas em nenhuma tomada do vídeo. Marque de novo, num momento em que elas aparecem bem.",
              code: "BAD_INPUT",
            },
            { status: 400 },
          );
        }
        // Só as tomadas que vão ao motor são cobradas: a diferença volta agora.
        segundosCobrados = Number(
          enviadas.reduce((t, x) => t + segundosDaTomada(x), 0).toFixed(2),
        );
        const reais = creditosTroca(segundosCobrados, body.qualidade);
        if (cobranca && reais < creditos) {
          await estornarParcial(cobranca, creditos - reais);
          cobranca = cobrancaRestante(cobranca, creditos - reais);
        }
        creditos = Math.min(creditos, reais);
        resumoDasTomadas = preparadas.map((t) => ({
          inicio: t.inicio,
          duracao: t.duracao,
          alvos: t.presentes,
          acao: t.acao,
        }));
        troca = await iniciarTroca({
          fal,
          motor: body.motor,
          qualidade: body.qualidade,
          arquivo,
          info,
          alvos,
          removerTexto: body.removerTexto,
          estilo: body.estilo,
          jobId,
          tomadas: preparadas.map((t) => ({
            inicio: t.inicio,
            duracao: t.duracao,
            alvos: t.presentes.map((n, k) => ({
              ...alvos[n],
              descricao: t.descricoes[k],
            })),
            ancora: t.ancora,
            naAncora: t.naAncora,
            acao: acaoDoTrecho(t.acao, t.presentes, alvos.length, body.motor),
          })),
        });
      } else {
        // Kling: um trecho novo começa quando uma pessoa marcada entra em cena (o
        // motor só troca bem quem já está na tela no começo do trecho) e nos cortes
        // de câmera. O Seedance faz até 30s de uma vez e não tem quadro-âncora: lá
        // mais emendas atrapalham, fica dividido só pelo tamanho.
        const trechos = trechosTroca(
          duracao,
          MOTORES_TROCA[body.motor].maxTrecho,
          viradas,
          minimo,
          linha && !premium ? entradasDosAlvos(linha, imagens.length) : [],
        );
        // Cada trecho recebe só os personagens de quem aparece nele: com todos,
        // o motor "encaixa" o personagem de quem está fora em quem está em cena.
        porTrecho =
          linha && imagens.length > 1
            ? alvosNosTrechos(trechos, linha, imagens.length)
            : undefined;
        // O que acontece em cada trecho, em palavras: sem isso gestos rápidos (um
        // golpe, uma queda) somem do resultado.
        acoes = premium
          ? undefined
          : await acoesDosTrechos({
              arquivo,
              dir,
              duracao,
              trechos,
              viradas,
              marcadas: body.pessoas,
              descricoes: ancora.descricoes,
            });
        troca = await iniciarTroca({
          fal,
          motor: body.motor,
          qualidade: body.qualidade,
          arquivo,
          info,
          alvos,
          removerTexto: body.removerTexto,
          estilo: body.estilo,
          jobId,
          ancora: ancora.imagem,
          outras: ancora.outras,
          naAncora: ancora.naAncora,
          trechos,
          alvosPorTrecho: porTrecho,
          acoesPorTrecho: acoes,
        });
      }
      const custo = premium
        ? custoTrocaPremium(duracao)
        : custoTroca(segundosCobrados, body.qualidade);

      await pool.query(
        `insert into video_jobs (id, user_id, character_id, provedor, tipo, modelo, fal_request_id, input, duracao)
       values ($1, $2, $3, $4, 'substituir', $5, $6, $7, $8)`,
        [
          jobId,
          userId,
          body.characterId,
          "fal",
          troca.modelo ?? MOTORES_TROCA[body.motor].modelo,
          // O primeiro trecho pode ser uma tomada sem troca (sem pedido no motor).
          troca.segmentos.find((g) => g.requestId)?.requestId ?? "",
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
            estilo: body.estilo,
            antesKey,
            pessoas: body.pessoas?.map((p, i) => ({
              ...p,
              descricao: descricoes[i],
            })),
            // Para entender um resultado ruim depois: se houve quadro-âncora, quais
            // alvos apareciam trocados nele e quem a IA listou como "outras pessoas".
            ancora: { usada: !!ancora.imagem, alvos: ancora.naAncora },
            outras: ancora.outras,
            // Quais pessoas marcadas a IA viu em cada trecho (só as vistas vão ao motor).
            alvosPorTrecho: porTrecho,
            // A ação descrita de cada trecho (como foi lida, com [[1]], [[2]]…).
            acoesPorTrecho: acoes,
            // Modo tomada por tomada: quem foi visto e o que acontece em cada uma.
            tomadas: resumoDasTomadas,
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
        antesKey,
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
