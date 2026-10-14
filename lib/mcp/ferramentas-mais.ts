import { ESTILOS_TROCA_IDS } from "@/lib/video/estilos";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { z } from "zod";
import { POST as expandirPost } from "@/app/api/expandir-ficha/route";
import { POST as trocarFotoPost } from "@/app/api/imagens/trocar/route";
import { GET as personaGet } from "@/app/api/persona/[characterId]/route";
import { POST as datasetPost } from "@/app/api/persona/dataset/route";
import { POST as treinarPost } from "@/app/api/persona/treinar/route";
import {
  GET as radarGet,
  POST as radarPost,
} from "@/app/api/radar/[characterId]/route";
import { GET as socialGet } from "@/app/api/social/[characterId]/route";
import { POST as conectarPost } from "@/app/api/social/conectar/route";
import { POST as postarPost } from "@/app/api/social/posts/route";
import { POST as uploadPost } from "@/app/api/storage/upload/route";
import { POST as legendaPost } from "@/app/api/videos/legenda/route";
import { POST as substituirPost } from "@/app/api/videos/substituir/route";
import { stripMetadata } from "@/lib/ai/strip";
import { campoAceitoDaIA } from "@/lib/campos-ficha";
import { ehCampoManual } from "@/lib/campos-manuais";
import { planoAtual } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { emptyCharacter } from "@/lib/defaults";
import { readPath, writePath } from "@/lib/paths";
import {
  CREDITOS_IMAGEM_DATASET,
  CREDITOS_LEGENDA,
  CREDITOS_POST_POR_REDE,
  CREDITOS_TEXTO,
  CREDITOS_TREINO,
  creditosRadar,
  creditosTroca,
  PLANOS,
} from "@/lib/planos";
import { REDES } from "@/lib/social/redes";
import { getS3, ownsKey, presignGet } from "@/lib/storage/s3";
import type { Character, VideoArquivo } from "@/lib/types";
import { extrairQuadro } from "@/lib/video/ffmpeg";
import { comPastaTemporaria } from "@/lib/video/server";
import {
  chamarRota,
  ErroDaFerramenta,
  imagemPadrao,
  linkDoArquivo,
  personagemOuErro,
  registrarVideo,
  type Ferramenta,
} from "./ferramentas";

/**
 * Segunda leva de ferramentas do MCP: ficha (criar/editar), radar, redes
 * sociais, legenda de vídeo, persona treinada, troca de pessoa em foto, envio
 * de arquivos e a troca em vídeo escolhendo quem (com o quadro para olhar).
 */

/** Rota com parâmetro na URL ([characterId]): fixa o id. */
const doPersonagem =
  <T>(
    rota: (req: Request, ctx: { params: Promise<{ characterId: string }> }) => T,
    characterId: string,
  ) =>
  (req: Request) =>
    rota(req, { params: Promise.resolve({ characterId }) });

/** Grava a ficha inteira do personagem (como a tela faz ao salvar). */
async function salvarPersonagem(userId: string, c: Character): Promise<void> {
  c.updatedAt = Date.now();
  await getPool()!.query(
    `insert into characters (id, user_id, data, updated_at) values ($1, $2, $3, now())
     on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at
       where characters.user_id = excluded.user_id`,
    [c.id, userId, JSON.stringify(c)],
  );
}

const MODELO_FICHA = emptyCharacter() as unknown as Record<string, unknown>;
/** A IA (ou quem chama) às vezes manda lista onde o campo é texto, ou o contrário. */
function ajustarTipo(fieldId: string, valor: unknown): unknown {
  const modelo = readPath(MODELO_FICHA, fieldId);
  if (typeof modelo === "string" && Array.isArray(valor))
    return valor.map(String).join(", ");
  if (Array.isArray(modelo) && typeof valor === "string")
    return valor
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  return valor;
}

const caixa = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().gt(0).max(1),
  h: z.number().gt(0).max(1),
});

/** Arquivo de vídeo para o ffmpeg ler: o link buscado ou o arquivo da conta. */
async function origemDoVideo(
  userId: string,
  o: { link_id?: string; video_key?: string },
): Promise<string> {
  if (o.link_id) {
    const { rows } = await getPool()!.query<{ fal_url: string }>(
      "select fal_url from links_video where id = $1 and user_id = $2",
      [o.link_id, userId],
    );
    if (!rows[0])
      throw new ErroDaFerramenta(
        "Link não encontrado. Use buscar_video_por_link primeiro.",
      );
    return rows[0].fal_url;
  }
  const s3 = getS3();
  if (!o.video_key || !s3 || !ownsKey(userId, o.video_key))
    throw new ErroDaFerramenta("Informe link_id ou video_key de um vídeo da conta.");
  return presignGet(s3, o.video_key, 900);
}

export const MAIS_FERRAMENTAS: Ferramenta[] = [
  {
    name: "ver_ficha_completa",
    description:
      "A ficha inteira do personagem em JSON (identidade, visual, personalidade, nicho, voz…). Os caminhos dos campos (ex.: identidade.bio, nicho.pilares) são os usados em editar_personagem. Não gasta créditos.",
    entrada: z.object({ personagem_id: z.string().min(1) }),
    executar: async ({ userId, args }) => {
      const c = await personagemOuErro(
        userId,
        (args as { personagem_id: string }).personagem_id,
      );
      const { geradas, videos, audios, textos, ...ficha } = stripMetadata(
        c,
      ) as Record<string, unknown>;
      void geradas, videos, audios, textos;
      return ficha;
    },
  },
  {
    name: "criar_personagem",
    description: `Cria um personagem novo: a IA escreve a ficha inteira (personalidade, nicho, voz, ideias de conteúdo) a partir de uma descrição. Custa ${CREDITOS_TEXTO.expandirFicha} créditos. O plano limita quantos personagens a conta pode ter. Depois use gerar_imagem para dar um rosto a ele.`,
    entrada: z.object({
      nome: z.string().trim().min(1).max(80),
      descricao: z
        .string()
        .min(10)
        .max(4000)
        .describe("Quem é o personagem: idade, estilo, nicho, jeito de falar, público."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as { nome: string; descricao: string };
      const pool = getPool()!;
      const limite = PLANOS[await planoAtual(userId)].personagens;
      const { rows } = await pool.query<{ n: number }>(
        "select count(*)::int as n from characters where user_id = $1",
        [userId],
      );
      if (rows[0].n >= limite)
        throw new ErroDaFerramenta(
          `O plano da conta permite ${limite} ${limite === 1 ? "personagem" : "personagens"} e esse limite já foi atingido.`,
        );
      const r = await chamarRota(
        expandirPost,
        { contexto: a.descricao, nome: a.nome },
        req,
      );
      const c = emptyCharacter();
      c.identidade.nome = a.nome;
      const sugestoes = (r.suggestions ?? []) as Array<{
        fieldId: string;
        valor: unknown;
        origem: "contexto" | "suposicao";
      }>;
      for (const s of sugestoes) {
        if (ehCampoManual(s.fieldId)) continue;
        writePath(
          c as unknown as Record<string, unknown>,
          s.fieldId,
          ajustarTipo(s.fieldId, s.valor),
        );
        c._suggestions[s.fieldId] = s.origem;
      }
      c.pontosEmAberto =
        (r.pontosEmAberto as Character["pontosEmAberto"] | undefined) ?? [];
      await salvarPersonagem(userId, c);
      return {
        personagem_id: c.id,
        nome: a.nome,
        bio: c.identidade.bio ?? "",
        campos_preenchidos: sugestoes.length,
        pontos_em_aberto: c.pontosEmAberto,
        creditos_gastos: CREDITOS_TEXTO.expandirFicha,
      };
    },
  },
  {
    name: "editar_personagem",
    description:
      'Altera campos da ficha do personagem. Passe os caminhos e os novos valores, ex.: {"identidade.bio": "…", "nicho.pilares": ["…", "…"]}. Veja os caminhos em ver_ficha_completa. Não gasta créditos. Imagens, vídeos e vozes não são editados por aqui.',
    entrada: z.object({
      personagem_id: z.string().min(1),
      campos: z
        .record(z.string(), z.unknown())
        .describe("Caminho do campo → novo valor."),
    }),
    executar: async ({ userId, args }) => {
      const a = args as { personagem_id: string; campos: Record<string, unknown> };
      const c = await personagemOuErro(userId, a.personagem_id);
      const alterados: string[] = [];
      const recusados: string[] = [];
      for (const [campo, valor] of Object.entries(a.campos)) {
        if (!campoAceitoDaIA(campo) && !ehCampoManual(campo)) {
          recusados.push(campo);
          continue;
        }
        writePath(
          c as unknown as Record<string, unknown>,
          campo,
          ajustarTipo(campo, valor),
        );
        // Foi quem usa a conta que mandou: não é mais sugestão da IA.
        delete c._suggestions[campo];
        alterados.push(campo);
      }
      if (alterados.length) await salvarPersonagem(userId, c);
      return {
        alterados,
        recusados,
        ...(recusados.length
          ? { aviso: "Os campos recusados não existem na ficha (confira em ver_ficha_completa)." }
          : {}),
      };
    },
  },
  {
    name: "ver_radar",
    description:
      "Os radares já gerados do personagem (assuntos em alta no nicho dele, com ideias de post), do mais recente para o mais antigo. Não gasta créditos.",
    entrada: z.object({ personagem_id: z.string().min(1) }),
    executar: async ({ userId, args, req }) => {
      const c = await personagemOuErro(
        userId,
        (args as { personagem_id: string }).personagem_id,
      );
      const r = await chamarRota(doPersonagem(radarGet, c.id), null, req, "");
      return { radares: (r.radares as unknown[]).slice(0, 5) };
    },
  },
  {
    name: "gerar_radar_do_dia",
    description: `Gera (ou refaz) o radar de hoje do personagem: o que está em alta no nicho dele, com ideias de conteúdo. Custa ${creditosRadar(false)} créditos (${creditosRadar(true)} incluindo o que está em alta no X).`,
    entrada: z.object({
      personagem_id: z.string().min(1),
      incluir_x: z.boolean().default(false),
      temas: z
        .array(z.string().min(1).max(80))
        .max(8)
        .optional()
        .describe("Temas a acompanhar. Ausente: os do nicho do personagem."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as { personagem_id: string; incluir_x: boolean; temas?: string[] };
      const c = await personagemOuErro(userId, a.personagem_id);
      const r = await chamarRota(
        doPersonagem(radarPost, c.id),
        { comX: a.incluir_x, temas: a.temas },
        req,
      );
      return { radar: r.radar };
    },
  },
  {
    name: "redes_do_personagem",
    description:
      "Contas de redes sociais conectadas ao personagem e os posts publicados, agendados e com falha. Não gasta créditos.",
    entrada: z.object({ personagem_id: z.string().min(1) }),
    executar: async ({ userId, args, req }) => {
      const c = await personagemOuErro(
        userId,
        (args as { personagem_id: string }).personagem_id,
      );
      const r = await chamarRota(doPersonagem(socialGet, c.id), null, req, "");
      return {
        conectado: r.conectado,
        contas: r.contas,
        posts: ((r.posts as unknown[]) ?? []).slice(0, 30),
      };
    },
  },
  {
    name: "link_para_conectar_redes",
    description:
      "Devolve o link para a pessoa conectar as redes sociais do personagem (Instagram, TikTok, YouTube, X, LinkedIn). A conexão é feita por ela no navegador. Não gasta créditos.",
    entrada: z.object({
      personagem_id: z.string().min(1),
      redes: z.array(z.enum(REDES)).optional(),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as { personagem_id: string; redes?: string[] };
      const c = await personagemOuErro(userId, a.personagem_id);
      const r = await chamarRota(
        conectarPost,
        { characterId: c.id, nome: c.identidade.nome, redes: a.redes },
        req,
      );
      return { link: r.url };
    },
  },
  {
    name: "publicar_nas_redes",
    description: [
      `Publica agora, agenda ou guarda no backlog um post do personagem. Custa ${CREDITOS_POST_POR_REDE} créditos por rede ao publicar ou agendar. A conta da rede precisa estar conectada (veja redes_do_personagem).`,
      "É uma publicação de verdade, visível para o público: confirme o texto, as redes e o horário com a pessoa antes de chamar.",
      "midia_key é a key de um vídeo ou imagem do personagem. quando é a data e hora em UTC (ISO 8601); ausente = publicar agora.",
    ].join("\n"),
    entrada: z.object({
      personagem_id: z.string().min(1),
      redes: z.array(z.enum(REDES)).min(1),
      texto: z.string().max(5000).default(""),
      titulo: z.string().max(100).optional().describe("Título (YouTube)."),
      midia_key: z.string().optional(),
      midia_tipo: z.enum(["video", "imagem"]).optional(),
      quando: z.string().datetime().optional(),
      backlog: z.boolean().optional().describe("Só guardar como ideia, sem publicar nem agendar."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        redes: string[];
        texto: string;
        titulo?: string;
        midia_key?: string;
        midia_tipo?: string;
        quando?: string;
        backlog?: boolean;
      };
      const c = await personagemOuErro(userId, a.personagem_id);
      return chamarRota(
        postarPost,
        {
          characterId: c.id,
          redes: a.redes,
          texto: a.texto,
          titulo: a.titulo,
          midiaKey: a.midia_key,
          midiaTipo: a.midia_tipo,
          quando: a.quando,
          backlog: a.backlog,
        },
        req,
      );
    },
  },
  {
    name: "ver_quadro_do_video",
    description:
      "Mostra um quadro de um vídeo (buscado por link ou da conta) num instante. Use para ver quem aparece e escolher as posições em trocar_pessoas_no_video ou a área da legenda em editar_legenda_do_video. As posições são frações do quadro: x de 0 (esquerda) a 1 (direita), y de 0 (topo) a 1 (base). Não gasta créditos.",
    entrada: z.object({
      link_id: z.string().optional(),
      video_key: z.string().optional(),
      segundo: z.number().min(0).default(1),
    }),
    executar: async ({ userId, args }) => {
      const a = args as { link_id?: string; video_key?: string; segundo: number };
      const origem = await origemDoVideo(userId, a);
      const jpeg = await comPastaTemporaria(async (dir) => {
        const saida = path.join(dir, "quadro.jpg");
        await extrairQuadro(origem, a.segundo, saida, 30_000);
        return sharp(await readFile(saida))
          .resize(900, 900, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      }).catch(() => {
        throw new ErroDaFerramenta(
          "Não consegui ler o quadro: confira se o instante está dentro da duração do vídeo.",
        );
      });
      const { width, height } = await sharp(jpeg).metadata();
      return {
        segundo: a.segundo,
        largura: width,
        altura: height,
        _imagem: { data: jpeg.toString("base64"), mimeType: "image/jpeg" },
      };
    },
  },
  {
    name: "trocar_pessoas_no_video",
    description: [
      "Troca até 3 pessoas escolhidas de um vídeo, cada uma por um personagem. Olhe o vídeo com ver_quadro_do_video e passe, para cada pessoa, a posição dela no quadro (x, y, em frações) e o instante (t, em segundos) em que ela aparece bem, com a imagem do personagem que entra no lugar. De preferência marque todas no mesmo instante. A posição também pode ser a de um animal ou objeto (um cachorro, um carro): ele é trocado pelo que a imagem mostra. Assíncrono: acompanhe com status_do_video.",
      `Custo: ${creditosTroca(1, "standard")}, ${creditosTroca(1, "pro")} ou ${creditosTroca(1, "4k")} créditos por segundo (standard, pro, 4k). Confirme o custo e que a pessoa tem direito de usar o vídeo antes de chamar.`,
    ].join("\n"),
    entrada: z.object({
      personagem_id: z.string().min(1).describe("Personagem em cuja lista o vídeo fica."),
      link_id: z.string().optional(),
      video_key: z.string().optional(),
      direitos_confirmados: z.boolean(),
      pessoas: z
        .array(
          z.object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            t: z.number().min(0),
            imagem_key: z.string().min(1).describe("Imagem do personagem que entra no lugar."),
          }),
        )
        .min(1)
        .max(3),
      segundos: z.union([z.literal(10), z.literal(15), z.literal(30)]).optional(),
      qualidade: z.enum(["standard", "pro", "4k"]).default("pro"),
      estilo: z
        .enum(ESTILOS_TROCA_IDS)
        .default("realista")
        .describe("Estilo visual do vídeo: realista (só a pessoa muda) ou o vídeo inteiro redesenhado no estilo escolhido (desenho, anime, animação 3D, quadrinhos, aquarela, massinha, pixel art, neon ou blocos)."),
      roupa: z
        .enum(["personagem", "video"])
        .default("personagem")
        .describe("Roupa de quem é trocado: personagem (padrão: ele entra com o look dele) ou video (só a cabeça, o rosto, o cabelo e a pele mudam; a roupa do vídeo original fica)."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        link_id?: string;
        video_key?: string;
        direitos_confirmados: boolean;
        pessoas: Array<{ x: number; y: number; t: number; imagem_key: string }>;
        segundos?: number;
        qualidade: string;
        estilo: string;
        roupa: "personagem" | "video";
      };
      if (!a.link_id === !a.video_key)
        throw new ErroDaFerramenta("Informe link_id OU video_key.");
      if (a.link_id && !a.direitos_confirmados)
        throw new ErroDaFerramenta(
          "Confirme com a pessoa que ela tem direito de usar este vídeo antes de trocar.",
        );
      const c = await personagemOuErro(userId, a.personagem_id);
      const r = await chamarRota(
        substituirPost,
        {
          characterId: c.id,
          linkId: a.link_id,
          videoKey: a.video_key,
          direitos: a.link_id ? true : undefined,
          pessoas: a.pessoas.map((p) => ({
            x: p.x,
            y: p.y,
            t: p.t,
            imageKey: p.imagem_key,
          })),
          motor: "kling",
          qualidade: a.qualidade,
          segundos: a.segundos,
          estilo: a.estilo,
          // Na rota, "foto" = manter a roupa do original (o mesmo nome da troca em imagem).
          roupa: a.roupa === "video" ? "foto" : "personagem",
          // A rota põe o vídeo na lista do personagem com este nome.
          nome: "Vídeo (com os personagens · Claude Code).mp4",
        },
        req,
      );
      return {
        job_id: r.jobId,
        duracao_segundos: r.duracao,
        creditos_gastos: r.creditos,
      };
    },
  },
  {
    name: "editar_legenda_do_video",
    description: `Remove ou troca a legenda/texto de uma área de um vídeo da conta. Olhe o vídeo com ver_quadro_do_video e passe a área (x, y do canto de cima à esquerda; w, h largura e altura — tudo em frações do quadro). Qualidade "rapida" custa ${CREDITOS_LEGENDA} créditos e sai na hora; "ia" (fundo complexo) cobra por segundo e é assíncrona (acompanhe com status_do_video).`,
    entrada: z.object({
      personagem_id: z.string().min(1),
      video_key: z.string().min(1),
      area: caixa,
      modo: z.enum(["remover", "trocar"]),
      texto: z.string().max(200).optional().describe("Texto novo (modo trocar)."),
      qualidade: z.enum(["rapida", "ia"]).default("rapida"),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        video_key: string;
        area: z.infer<typeof caixa>;
        modo: string;
        texto?: string;
        qualidade: string;
      };
      const c = await personagemOuErro(userId, a.personagem_id);
      const r = await chamarRota(
        legendaPost,
        {
          key: a.video_key,
          caixa: a.area,
          modo: a.modo,
          texto: a.texto,
          qualidade: a.qualidade,
          characterId: c.id,
        },
        req,
      );
      if (r.jobId) {
        await registrarVideo(userId, c, {
          name: "Vídeo (legenda editada · Claude Code).mp4",
          jobId: String(r.jobId),
          origem: "legenda",
          duracao: Number(r.duracao) || undefined,
        });
        return { job_id: r.jobId, creditos_gastos: r.creditos };
      }
      const key = String(r.key ?? "");
      if (key) {
        const video: VideoArquivo = {
          id: nanoid(10),
          name: "Vídeo (legenda editada · Claude Code).mp4",
          key,
          size: Number(r.size) || 0,
          contentType: "video/mp4",
          createdAt: Date.now(),
          origem: "legenda",
          duracao: Number(r.duracao) || undefined,
          jobId: r.edicaoId ? String(r.edicaoId) : undefined,
        };
        await getPool()!.query(
          `update characters
             set data = jsonb_set(data, '{videos}', $3::jsonb || coalesce(data->'videos', '[]'::jsonb)),
                 updated_at = now()
           where id = $1 and user_id = $2`,
          [c.id, userId, JSON.stringify([video])],
        );
      }
      return {
        video_key: key || null,
        link_para_baixar: key ? await linkDoArquivo(key, "video.mp4") : null,
      };
    },
  },
  {
    name: "trocar_pessoa_na_foto",
    description:
      "Troca a pessoa de uma foto da conta pelo personagem (ou até 3 pessoas, cada uma por um personagem, passando a posição de cada uma em frações da foto; a posição também pode ser a de um animal ou objeto). Custa os créditos de uma imagem (mais na qualidade pro). A foto precisa estar na conta: envie com preparar_envio_de_arquivo. O resultado entra na galeria do personagem.",
    entrada: z.object({
      personagem_id: z.string().min(1),
      foto_key: z.string().min(1),
      qualidade: z.enum(["padrao", "pro"]).default("padrao"),
      roupa: z
        .enum(["foto", "personagem"])
        .default("foto")
        .describe("De onde vem a roupa: da foto original ou do personagem."),
      imagem_key: z.string().optional().describe("Imagem do personagem (troca a pessoa principal)."),
      pessoas: z
        .array(
          z.object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            imagem_key: z.string().min(1),
          }),
        )
        .max(3)
        .optional(),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        foto_key: string;
        qualidade: "padrao" | "pro";
        roupa: string;
        imagem_key?: string;
        pessoas?: Array<{ x: number; y: number; imagem_key: string }>;
      };
      const c = await personagemOuErro(userId, a.personagem_id);
      const imageKey = a.pessoas?.length
        ? undefined
        : (a.imagem_key ?? imagemPadrao(c) ?? undefined);
      const r = await chamarRota(
        trocarFotoPost,
        {
          characterId: c.id,
          fotoKey: a.foto_key,
          qualidade: a.qualidade,
          roupa: a.roupa,
          imageKey,
          pessoas: a.pessoas?.map((p) => ({
            x: p.x,
            y: p.y,
            imageKey: p.imagem_key,
          })),
        },
        req,
      );
      const key = String(r.key);
      await getPool()!.query(
        `update characters
           set data = jsonb_set(data, '{geradas}', $3::jsonb || coalesce(data->'geradas', '[]'::jsonb)),
               updated_at = now()
         where id = $1 and user_id = $2`,
        [
          c.id,
          userId,
          JSON.stringify([
            {
              id: nanoid(10),
              key,
              tipo: "troca",
              estilo: c.visual.estilo,
              qualidade: a.qualidade,
              size: Number(r.size) || 0,
              createdAt: Date.now(),
            },
          ]),
        ],
      );
      return { imagem_key: key, link_para_ver: await linkDoArquivo(key) };
    },
  },
  {
    name: "status_da_persona",
    description:
      "Situação da persona treinada do personagem (o modelo que mantém o rosto idêntico nas imagens) e quantos treinos grátis restam no mês. Não gasta créditos.",
    entrada: z.object({ personagem_id: z.string().min(1) }),
    executar: async ({ userId, args, req }) => {
      const c = await personagemOuErro(
        userId,
        (args as { personagem_id: string }).personagem_id,
      );
      const r = await chamarRota(doPersonagem(personaGet, c.id), null, req, "");
      return { persona: r.persona, treinos_gratis_restantes: r.gratisRestantes };
    },
  },
  {
    name: "gerar_fotos_de_treino",
    description: `Gera variações do personagem (ângulos, expressões, cenários) para treinar a persona. Custa ${CREDITOS_IMAGEM_DATASET} créditos por foto (20 fotos = ${20 * CREDITOS_IMAGEM_DATASET} créditos). Devolve as keys para usar em treinar_persona.`,
    entrada: z.object({
      personagem_id: z.string().min(1),
      referencia_key: z.string().optional().describe("Imagem base. Ausente: a imagem padrão."),
      quantidade: z.number().int().min(4).max(30).default(20),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as { personagem_id: string; referencia_key?: string; quantidade: number };
      const c = await personagemOuErro(userId, a.personagem_id);
      const referenciaKey = a.referencia_key ?? imagemPadrao(c);
      if (!referenciaKey)
        throw new ErroDaFerramenta("Este personagem ainda não tem imagem. Use gerar_imagem antes.");
      const r = await chamarRota(
        datasetPost,
        { characterId: c.id, referenciaKey, quantidade: a.quantidade },
        req,
      );
      return { imagens: r.imagens, falhas: r.falhas };
    },
  },
  {
    name: "treinar_persona",
    description: `Treina a persona do personagem com as fotos dele (de gerar_fotos_de_treino). Custa ${CREDITOS_TREINO.rapido} créditos (rápido) ou ${CREDITOS_TREINO.pro} (pro), salvo se o plano ainda tiver treino grátis no mês. Leva vários minutos: acompanhe com status_da_persona. Só para personagens sintéticos ou pessoas que autorizaram: declaracao_aceita precisa ser true, confirmada pela pessoa.`,
    entrada: z.object({
      personagem_id: z.string().min(1),
      imagens_keys: z.array(z.string().min(1)).min(4).max(40),
      treinador: z.enum(["rapido", "pro"]).default("rapido"),
      declaracao_aceita: z
        .boolean()
        .describe("A pessoa declarou que o rosto é sintético ou que tem autorização de uso."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        imagens_keys: string[];
        treinador: string;
        declaracao_aceita: boolean;
      };
      if (!a.declaracao_aceita)
        throw new ErroDaFerramenta(
          "A pessoa precisa declarar que o rosto é sintético ou que tem autorização de uso antes de treinar.",
        );
      const c = await personagemOuErro(userId, a.personagem_id);
      const r = await chamarRota(
        treinarPost,
        {
          characterId: c.id,
          treinador: a.treinador,
          keys: a.imagens_keys,
          consentimento: true,
        },
        req,
      );
      return { job_id: r.jobId, treino_gratis: r.gratis };
    },
  },
  {
    name: "preparar_envio_de_arquivo",
    description:
      "Prepara o envio de um arquivo do computador para a conta (imagem JPEG/PNG/WebP, vídeo MP4/MOV/WebM ou áudio). Devolve a key e o comando curl para enviar o arquivo; rode o comando e depois chame registrar_arquivo para ele aparecer no personagem. Não gasta créditos (conta no armazenamento do plano).",
    entrada: z.object({
      tipo: z.enum(["imagem", "video", "audio"]),
      content_type: z.string().min(3).describe("Ex.: image/jpeg, video/mp4, audio/mpeg."),
      tamanho_bytes: z.number().int().positive(),
    }),
    executar: async ({ args, req }) => {
      const a = args as { tipo: string; content_type: string; tamanho_bytes: number };
      const r = await chamarRota(
        uploadPost,
        {
          kind: a.tipo === "imagem" ? "refs" : a.tipo === "video" ? "videos" : "audios",
          contentType: a.content_type,
          size: a.tamanho_bytes,
        },
        req,
      );
      return {
        key: r.key,
        comando: `curl -X PUT -H "Content-Type: ${a.content_type}" --data-binary @CAMINHO_DO_ARQUIVO "${r.url}"`,
        proximo_passo:
          "Rode o comando trocando CAMINHO_DO_ARQUIVO; depois chame registrar_arquivo com esta key.",
      };
    },
  },
  {
    name: "registrar_arquivo",
    description:
      "Coloca no personagem um arquivo já enviado (key de preparar_envio_de_arquivo): vídeo entra na lista de vídeos; imagem entra como referência visual. Não gasta créditos.",
    entrada: z.object({
      personagem_id: z.string().min(1),
      key: z.string().min(1),
      tipo: z.enum(["imagem", "video"]),
      nome: z.string().min(1).max(120),
      tamanho_bytes: z.number().int().nonnegative().default(0),
    }),
    executar: async ({ userId, args }) => {
      const a = args as {
        personagem_id: string;
        key: string;
        tipo: "imagem" | "video";
        nome: string;
        tamanho_bytes: number;
      };
      if (!ownsKey(userId, a.key))
        throw new ErroDaFerramenta("Arquivo não encontrado nesta conta.");
      const c = await personagemOuErro(userId, a.personagem_id);
      if (a.tipo === "video") {
        c.videos = [
          {
            id: nanoid(10),
            name: a.nome,
            key: a.key,
            size: a.tamanho_bytes,
            contentType: "video/mp4",
            createdAt: Date.now(),
            origem: "upload",
          },
          ...(c.videos ?? []),
        ];
      } else {
        c.visual.referencias = [
          ...c.visual.referencias,
          { id: nanoid(10), name: a.nome, dataUrl: "", size: a.tamanho_bytes, key: a.key },
        ];
      }
      await salvarPersonagem(userId, c);
      return { ok: true, key: a.key };
    },
  },
];
