import { z } from "zod";
import { GET as motionGet, POST as motionPost } from "@/app/api/motion/route";
import { GET as umMotionGet, POST as umMotionPost } from "@/app/api/motion/[id]/route";
import { POST as referenciaPost } from "@/app/api/motion/referencia/route";
import { DECLARACAO_REFERENCIA_MOTION } from "@/lib/declaracoes";
import { CREDITOS_LINK } from "@/lib/planos";
import { getPool } from "@/lib/db";
import type { ItemMotion } from "@/lib/motion";
import {
  creditosMotion,
  esforcoDoModelo,
  estimativaMotion,
  MODELO_MOTION_PADRAO,
  MODELOS_MOTION,
  MODELOS_MOTION_IDS,
  ROTULO_ESFORCO,
  type EsforcoMotion,
  type ModeloMotion,
} from "@/worker/motion/modelos";
import { DURACOES_MOTION, REFERENCIA_MAX_SEGUNDOS, TIPOS_MOTION, type TipoMotion } from "@/worker/motion/tipos";
import {
  chamarRota,
  ErroDaFerramenta,
  imagemPadrao,
  linkDoArquivo,
  personagemOuErro,
  type Ferramenta,
} from "./ferramentas";
import { CAMPOS_MUSICA, musicaDoPedido } from "./ferramentas-produto";

/**
 * Ferramentas do MCP para o Motion (tela /app/motion): um modelo de IA
 * escreve uma animação (motion graphics) de um site, produto ou influencer,
 * e o worker grava o MP4. Recurso em teste "motion": só aparecem para quem
 * pode usar a tela.
 */

const ESFORCOS = ["low", "medium", "high", "xhigh", "max"] as const;

/** Rota com [id]: o Next passa o id em `params`. */
const comId =
  (rota: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, id: string) =>
  (req: Request) =>
    rota(req, { params: Promise.resolve({ id }) });

/** Estimativa reservada ao pedir (a tela calcula igual): o acerto vem pelo custo real. */
const estimativa = (modelo: ModeloMotion, esforco: EsforcoMotion, imagens: number) =>
  creditosMotion(estimativaMotion(modelo, esforco, imagens));

const resumoDoMotion = async (m: ItemMotion) => ({
  motion_id: m.id,
  status: m.status,
  tipo: m.tipo,
  assunto: m.assunto,
  formato: m.formato,
  duracao: m.duracao,
  modelo: m.modelo,
  etapa: m.progresso?.etapa ?? null,
  parado: m.parado,
  erro: m.erro,
  creditos_reais: m.uso ? creditosMotion(m.uso.custo) : null,
  mp4: m.render ?? "não gravado",
  erro_do_mp4: m.renderErro,
  musica: m.musica?.nome ?? null,
  link_mp4: m.render === "pronto" && m.videoKey ? await linkDoArquivo(m.videoKey, `motion-${m.id}.mp4`) : null,
  criado_em: m.criadoEm,
});

export const FERRAMENTAS_MOTION: Ferramenta[] = [
  {
    name: "criar_motion",
    recurso: "motion",
    description: [
      "Pede um motion: um modelo de IA escreve uma animação (motion graphics) de um site, de um produto, de um influencer, de uma mistura (influencer com produto ou site) ou a partir de um vídeo de referência. Assíncrono: devolve um motion_id; acompanhe com status_do_motion (leva alguns minutos). Para o vídeo, depois use exportar_video_do_motion.",
      "Produto: produto_id (de listar_produtos ou criar_produto) ou fotos_do_produto (preparar_envio_de_arquivo) + produto. Influencer: personagem_id e/ou imagem_key. Site: site_url.",
      `A partir de um vídeo (tipo video, estilo Katana): passe video_referencia_key (um vídeo enviado com preparar_envio_de_arquivo, tipo video) ou video_referencia_link (YouTube, TikTok, Instagram ou X; custa ${CREDITOS_LINK} créditos para baixar), até ${REFERENCIA_MAX_SEGUNDOS}s. O motion recria as cenas, os tempos, o estilo e as batidas do vídeo, com a duração dele; mensagem, produto, influencer e site são opcionais e entram no lugar do conteúdo do vídeo (sem nada, recria o vídeo). O áudio do vídeo vira a música do MP4 (usar_audio_do_video). Antes, mostre à pessoa a declaração e só siga se ela confirmar: "${DECLARACAO_REFERENCIA_MOTION}" A análise do vídeo soma alguns créditos à estimativa.`,
      `Modelos (créditos reservados, no esforço padrão e com 2 imagens; o acerto é pelo custo real): ${MODELOS_MOTION_IDS.map((m) => `${m} = ${MODELOS_MOTION[m].rotulo} (${MODELOS_MOTION[m].nota}), ~${estimativa(m, MODELOS_MOTION[m].padrao, 2)}`).join("; ")}. Confirme com a pessoa antes.`,
    ].join("\n"),
    entrada: z.object({
      tipo: z.enum(TIPOS_MOTION as [TipoMotion, ...TipoMotion[]]).describe("site, produto, influencer ou misto (influencer + produto ou site)."),
      mensagem: z
        .string()
        .max(3000)
        .default("")
        .describe("O que o motion deve dizer: textos na tela, chamada final, estilo, cores…"),
      formato: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
      duracao: z
        .number()
        .int()
        .refine((d) => (DURACOES_MOTION as readonly number[]).includes(d), `Duração: ${DURACOES_MOTION.join(", ")} segundos.`)
        .default(15)
        .describe(`Segundos: ${DURACOES_MOTION.join(", ")}.`),
      modelo: z.enum(MODELOS_MOTION_IDS as [ModeloMotion, ...ModeloMotion[]]).default(MODELO_MOTION_PADRAO),
      esforco: z
        .enum(ESFORCOS)
        .optional()
        .describe(`Quanto o modelo pensa (${ESFORCOS.map((e) => `${e} = ${ROTULO_ESFORCO[e]}`).join(", ")}). Vazio: o padrão do modelo.`),
      site_url: z.string().max(500).optional(),
      produto_id: z.string().optional(),
      fotos_do_produto: z.array(z.string().min(1)).max(3).optional(),
      produto: z.string().max(120).optional().describe("Nome do produto (com produto_id, vem dele se ficar vazio)."),
      descricao_do_produto: z.string().max(400).optional(),
      personagem_id: z.string().optional(),
      imagem_key: z.string().optional().describe("Imagem do influencer (do personagem ou uma foto avulsa enviada)."),
      recortar_fundo: z.boolean().default(true).describe("Recorta o fundo das fotos para flutuarem na animação."),
      video_referencia_key: z.string().optional().describe("Vídeo de referência enviado (preparar_envio_de_arquivo, tipo video)."),
      video_referencia_link: z.string().url().optional().describe("Ou o link do vídeo de referência nas redes."),
      usar_audio_do_video: z.boolean().default(true).describe("O áudio do vídeo de referência vira a música de fundo do MP4."),
      direito_de_uso_do_video: z
        .boolean()
        .optional()
        .describe("Com vídeo de referência: true só depois de a pessoa confirmar a declaração."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        tipo: TipoMotion;
        mensagem: string;
        formato: "9:16" | "16:9" | "1:1";
        duracao: number;
        modelo: ModeloMotion;
        esforco?: EsforcoMotion;
        site_url?: string;
        produto_id?: string;
        fotos_do_produto?: string[];
        produto?: string;
        descricao_do_produto?: string;
        personagem_id?: string;
        imagem_key?: string;
        recortar_fundo: boolean;
        video_referencia_key?: string;
        video_referencia_link?: string;
        usar_audio_do_video: boolean;
        direito_de_uso_do_video?: boolean;
      };
      // No misto e no "a partir de um vídeo", entra o que vier.
      const aberto = a.tipo === "misto" || a.tipo === "video";
      const usaSite = a.tipo === "site" || (aberto && !!a.site_url);
      const usaProduto = a.tipo === "produto" || (aberto && !!(a.produto_id || a.fotos_do_produto?.length));
      const usaInfluencer =
        a.tipo === "influencer" || a.tipo === "misto" || (a.tipo === "video" && !!(a.personagem_id || a.imagem_key));

      // O vídeo de referência: enviado ou buscado no link (até 1 minuto), com a declaração aceita.
      let referencia: Record<string, unknown> | undefined;
      if (a.video_referencia_key || a.video_referencia_link) {
        if (a.direito_de_uso_do_video !== true)
          throw new ErroDaFerramenta(
            `Mostre à pessoa esta declaração e só siga se ela confirmar: "${DECLARACAO_REFERENCIA_MOTION}" Depois chame de novo com direito_de_uso_do_video: true.`,
          );
        if (a.video_referencia_link) {
          const r = await chamarRota(referenciaPost, { url: a.video_referencia_link }, req);
          const ref = r.referencia as { key: string; url: string; titulo: string | null };
          referencia = { key: ref.key, origem: "link", url: ref.url, titulo: ref.titulo ?? undefined };
        } else referencia = { key: a.video_referencia_key, origem: "upload" };
        referencia = { ...referencia, usarAudio: a.usar_audio_do_video, declaracao: DECLARACAO_REFERENCIA_MOTION };
      } else if (a.tipo === "video")
        throw new ErroDaFerramenta("Passe video_referencia_key (um vídeo enviado) ou video_referencia_link (link das redes).");

      let produto: { nome: string; descricao: string; keys: string[] } | undefined;
      if (usaProduto) {
        if (a.produto_id) {
          const { rows } = await getPool()!
            .query<{ nome: string; descricao: string; image_key: string }>(
              "select nome, descricao, image_key from produtos where id = $1 and user_id = $2",
              [a.produto_id, userId],
            )
            .catch(() => ({ rows: [] as Array<{ nome: string; descricao: string; image_key: string }> }));
          if (!rows[0]) throw new ErroDaFerramenta("Produto não encontrado nesta conta. Use listar_produtos para ver os ids.");
          produto = {
            nome: (a.produto?.trim() || rows[0].nome).slice(0, 120),
            descricao: (a.descricao_do_produto?.trim() || rows[0].descricao).slice(0, 400),
            keys: [rows[0].image_key],
          };
        } else {
          if ((a.produto?.trim().length ?? 0) < 2) throw new ErroDaFerramenta("Diga qual é o produto (campo produto) ou passe produto_id.");
          produto = { nome: a.produto!.trim(), descricao: a.descricao_do_produto?.trim() ?? "", keys: a.fotos_do_produto ?? [] };
        }
      }

      let influencer: { characterId: string | null; imageKey: string } | undefined;
      if (usaInfluencer) {
        if (a.personagem_id) {
          const c = await personagemOuErro(userId, a.personagem_id);
          const imageKey = a.imagem_key ?? imagemPadrao(c);
          if (!imageKey) throw new ErroDaFerramenta("Este personagem ainda não tem imagem. Gere uma com gerar_imagem ou passe imagem_key.");
          influencer = { characterId: c.id, imageKey };
        } else if (a.imagem_key) influencer = { characterId: null, imageKey: a.imagem_key };
        else throw new ErroDaFerramenta("Diga quem é o influencer: personagem_id ou imagem_key.");
      }
      if (usaSite && !a.site_url) throw new ErroDaFerramenta("Passe site_url.");

      const esforco = esforcoDoModelo(a.modelo, a.esforco ?? MODELOS_MOTION[a.modelo].padrao);
      const imagens =
        (produto?.keys.length ?? 0) * (a.recortar_fundo ? 2 : 1) +
        (influencer ? (a.recortar_fundo ? 2 : 1) : 0) +
        (usaSite ? 3 : 0);
      const r = await chamarRota(
        motionPost,
        {
          tipo: a.tipo,
          brief: a.mensagem,
          formato: a.formato,
          duracao: a.duracao,
          modelo: a.modelo,
          esforco,
          recortar: a.recortar_fundo,
          ...(usaSite ? { site: { url: a.site_url } } : {}),
          ...(produto ? { produto } : {}),
          ...(influencer ? { influencer } : {}),
          ...(referencia ? { referencia } : {}),
        },
        req,
      );
      const m = r.motion as ItemMotion;
      return {
        motion_id: m.id,
        status: m.status,
        duracao: m.duracao,
        // Com referência, o servidor mediu o vídeo: a duração do motion é a dele.
        creditos_reservados: creditosMotion(estimativaMotion(a.modelo, esforco, imagens, referencia ? m.duracao : 0)),
        aviso: "O valor reservado é uma estimativa: quando termina, a conta é acertada pelo custo real.",
        proximo_passo: "Acompanhe com status_do_motion; quando estiver pronto, use exportar_video_do_motion para o vídeo.",
      };
    },
  },
  {
    name: "status_do_motion",
    recurso: "motion",
    description:
      "Consulta um motion (motion_id de criar_motion, ajustar_motion ou listar_motions): andamento, erro, créditos reais e, depois de exportar_video_do_motion, o link do MP4 (vale 1 hora). A prévia animada fica na tela Motion do app. Não gasta créditos.",
    entrada: z.object({ motion_id: z.string().min(1) }),
    executar: async ({ args, req }) => {
      const { motion_id } = args as { motion_id: string };
      const r = await chamarRota(comId(umMotionGet, motion_id), null, req, "");
      return {
        ...(await resumoDoMotion(r.motion as ItemMotion)),
        tela: `${new URL(req.url).origin}/app/motion`,
      };
    },
  },
  {
    name: "listar_motions",
    recurso: "motion",
    description: "Lista os motions da conta (os mais novos primeiro), com status e link do MP4 quando gravado. Não gasta créditos.",
    entrada: z.object({ limite: z.number().int().min(1).max(30).default(10) }),
    executar: async ({ args, req }) => {
      const { limite } = args as { limite: number };
      const r = await chamarRota(motionGet, null, req, "");
      const motions = ((r.motions ?? []) as ItemMotion[]).slice(0, limite);
      return { motions: await Promise.all(motions.map(resumoDoMotion)), worker_ligado: r.worker ?? null };
    },
  },
  {
    name: "exportar_video_do_motion",
    recurso: "motion",
    description:
      "Grava o MP4 de um motion pronto (o worker grava quadro a quadro; leva alguns minutos). Opcional: música de fundo (musica_de_link ou um áudio enviado). Acompanhe com status_do_motion até o link_mp4. Não gasta créditos (a música de link custa ao tirar, em musica_de_link).",
    entrada: z.object({ motion_id: z.string().min(1), ...CAMPOS_MUSICA }),
    executar: async ({ args, req }) => {
      const a = args as { motion_id: string; musica_key?: string; musica_nome?: string; musica_direito_de_uso?: boolean };
      const musica = musicaDoPedido(a);
      if (musica) await chamarRota(comId(umMotionPost, a.motion_id), { acao: "musica", musica }, req);
      const r = await chamarRota(comId(umMotionPost, a.motion_id), { acao: "exportar" }, req);
      const m = r.motion as ItemMotion;
      return {
        motion_id: m.id,
        mp4: m.render,
        musica: m.musica?.nome ?? null,
        proximo_passo: "Acompanhe com status_do_motion até aparecer o link_mp4.",
      };
    },
  },
  {
    name: "ajustar_motion",
    recurso: "motion",
    description:
      "Pede uma mudança num motion pronto (ex.: \"troque a cor do fundo para azul e aumente o título\"). Cria um motion novo a partir dele, com custo de um motion novo (estimativa reservada e acertada pelo custo real). Confirme com a pessoa antes. Acompanhe o novo motion_id com status_do_motion.",
    entrada: z.object({
      motion_id: z.string().min(1),
      pedido: z.string().min(3).max(2000),
      modelo: z.enum(MODELOS_MOTION_IDS as [ModeloMotion, ...ModeloMotion[]]).optional().describe("Vazio: o mesmo do motion."),
      esforco: z.enum(ESFORCOS).optional(),
    }),
    executar: async ({ args, req }) => {
      const a = args as { motion_id: string; pedido: string; modelo?: ModeloMotion; esforco?: EsforcoMotion };
      const r = await chamarRota(
        comId(umMotionPost, a.motion_id),
        { acao: "ajustar", pedido: a.pedido, modelo: a.modelo, esforco: a.esforco },
        req,
      );
      const m = r.motion as ItemMotion;
      return {
        motion_id: m.id,
        status: m.status,
        proximo_passo: "Acompanhe o novo motion com status_do_motion.",
      };
    },
  },
];
