import sharp from "sharp";
import { z } from "zod";
import {
  DELETE as criarProdutoDelete,
  GET as criarProdutoGet,
  POST as criarProdutoPost,
} from "@/app/api/produto/criar/route";
import { POST as roteiroPost } from "@/app/api/produto/roteiro/route";
import { POST as produtoPost } from "@/app/api/produto/route";
import { POST as musicaPost } from "@/app/api/videos/musica/route";
import { POST as bibliotecaPost } from "@/app/api/voz/biblioteca/route";
import { planoAtual } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { DECLARACAO_MUSICA } from "@/lib/declaracoes";
import { CREDITOS_LINK, CREDITOS_TEXTO, PLANOS } from "@/lib/planos";
import {
  CENA_MAX_CARACTERES,
  creditosProduto,
  DURACOES_PRODUTO,
  MAX_CENAS_MUDAS_PRODUTO,
  MAX_FOTOS_PRODUTO,
  MODELOS_FALADO_PRODUTO,
  MODELOS_MUDO_PRODUTO,
  PRODUTO_MAX_CARACTERES,
  type ModoProduto,
} from "@/lib/produto";
import {
  creditosProdutoCriado,
  DESCRICAO_PRODUTO_MAX,
  NOME_PRODUTO_MAX,
  OPCOES_PRODUTO,
  PROMPT_PRODUTO_MAX,
} from "@/lib/produto-criado";
import { getObjectBuffer, getS3 } from "@/lib/storage/s3";
import type { Character } from "@/lib/types";
import {
  FALA_MAX_CARACTERES,
  MODELOS_CRIAR,
  MODELOS_FALADO,
  modeloPadraoCriar,
  type ModeloCriar,
  type ModeloFalado,
} from "@/lib/video/precos";
import { getSapiens } from "@/lib/video/sapiens";
import {
  chamarRota,
  ErroDaFerramenta,
  imagemPadrao,
  linkDoArquivo,
  personagemOuErro,
  vozesDoPersonagem,
  type Ferramenta,
} from "./ferramentas";

/**
 * Ferramentas do MCP para o vídeo de produto e o "Criar produto" (tela
 * /app/produto) e a música de fundo. Recurso em teste "video_produto": só
 * aparecem para quem pode usar a tela.
 */

const IDS_OPCOES = OPCOES_PRODUTO.map((o) => o.id) as [string, ...string[]];
const MODELO_FALADO_PADRAO: ModeloFalado = MODELOS_FALADO_PRODUTO.includes("seedance20_mini")
  ? "seedance20_mini"
  : MODELOS_FALADO_PRODUTO[0];
const MODELO_MUDO_PADRAO: ModeloCriar = modeloPadraoCriar({ sapiens: !!getSapiens() });
const MODELOS_DO_VIDEO = [...new Set<string>([...MODELOS_FALADO_PRODUTO, ...MODELOS_MUDO_PRODUTO])] as [
  string,
  ...string[],
];

const duracaoProduto = z
  .number()
  .int()
  .refine((d) => (DURACOES_PRODUTO as readonly number[]).includes(d), "Duração: 10, 15, 30, 45 ou 60 segundos.")
  .default(15)
  .describe("Segundos do vídeo: 10, 15, 30, 45 ou 60.");

/** Quem aparece e qual é o produto: os mesmos campos em montar_cenas e criar_video. */
const PEDIDO_DO_VIDEO = {
  personagem_id: z.string().optional().describe("Personagem que aparece (de listar_personagens)."),
  imagem_key: z
    .string()
    .optional()
    .describe("Imagem de quem aparece: uma do personagem (ver_personagem) ou uma foto avulsa enviada com preparar_envio_de_arquivo. Com personagem e sem ela, usa a imagem padrão dele."),
  produto_id: z.string().optional().describe("Produto criado (de listar_produtos ou criar_produto): a imagem dele vira a foto do produto."),
  fotos_do_produto: z
    .array(z.string().min(1))
    .max(MAX_FOTOS_PRODUTO)
    .optional()
    .describe(`Sem produto_id: keys de 1 a ${MAX_FOTOS_PRODUTO} fotos do produto (preparar_envio_de_arquivo, tipo imagem). A primeira é a principal.`),
  produto: z
    .string()
    .max(PRODUTO_MAX_CARACTERES)
    .optional()
    .describe("Qual é o produto, em texto. Com produto_id, vem do produto criado se ficar vazio."),
  com_fala: z.boolean().default(true).describe("true: a pessoa fala sobre o produto · false: sem fala."),
  modelo: z
    .enum(MODELOS_DO_VIDEO)
    .optional()
    .describe(
      `Com fala: ${MODELOS_FALADO_PRODUTO.map((m) => `${m} = ${MODELOS_FALADO[m].label}`).join("; ")} (padrão ${MODELO_FALADO_PADRAO}). Sem fala: ${MODELOS_MUDO_PRODUTO.map((m) => `${m} = ${MODELOS_CRIAR[m].label}`).join("; ")} (padrão ${MODELO_MUDO_PADRAO}).`,
    ),
  duracao: duracaoProduto,
};

type PedidoDoVideo = {
  personagem_id?: string;
  imagem_key?: string;
  produto_id?: string;
  fotos_do_produto?: string[];
  produto?: string;
  com_fala: boolean;
  modelo?: string;
  duracao: number;
};

/** Banco sem a tabela `produtos` (migration 0044 ainda não aplicada). */
const semTabela = (e: unknown) => (e as { code?: string })?.code === "42P01";

async function quemAparece(
  userId: string,
  a: PedidoDoVideo,
): Promise<{ characterId: string | null; imageKey: string; personagem: Character | null }> {
  if (a.personagem_id) {
    const c = await personagemOuErro(userId, a.personagem_id);
    const imageKey = a.imagem_key ?? imagemPadrao(c);
    if (!imageKey)
      throw new ErroDaFerramenta("Este personagem ainda não tem imagem. Gere uma com gerar_imagem ou passe imagem_key.");
    return { characterId: c.id, imageKey, personagem: c };
  }
  if (a.imagem_key) return { characterId: null, imageKey: a.imagem_key, personagem: null };
  throw new ErroDaFerramenta(
    "Diga quem aparece: personagem_id (de listar_personagens) ou imagem_key (uma foto enviada com preparar_envio_de_arquivo).",
  );
}

/** As fotos do produto e o texto: de um produto criado ou das fotos enviadas. */
async function produtoDoPedido(
  userId: string,
  a: Pick<PedidoDoVideo, "produto_id" | "fotos_do_produto" | "produto">,
): Promise<{ keys: string[]; texto: string; nome: string; descricao: string }> {
  if (a.produto_id) {
    const { rows } = await getPool()!
      .query<{ nome: string; descricao: string; image_key: string }>(
        "select nome, descricao, image_key from produtos where id = $1 and user_id = $2",
        [a.produto_id, userId],
      )
      .catch((e) => {
        if (semTabela(e)) return { rows: [] };
        throw e;
      });
    const p = rows[0];
    if (!p) throw new ErroDaFerramenta("Produto não encontrado nesta conta. Use listar_produtos para ver os ids.");
    const texto = a.produto?.trim() || (p.descricao ? `${p.nome} — ${p.descricao}` : p.nome);
    return { keys: [p.image_key], texto: texto.slice(0, PRODUTO_MAX_CARACTERES), nome: p.nome, descricao: p.descricao };
  }
  if (!a.fotos_do_produto?.length)
    throw new ErroDaFerramenta(
      "Passe produto_id (de listar_produtos ou criar_produto) ou fotos_do_produto (keys enviadas com preparar_envio_de_arquivo).",
    );
  const texto = a.produto?.trim() ?? "";
  if (texto.length < 2) throw new ErroDaFerramenta("Diga qual é o produto (campo produto).");
  return { keys: a.fotos_do_produto, texto, nome: texto, descricao: "" };
}

function modeloDoVideo(a: Pick<PedidoDoVideo, "com_fala" | "modelo">): { modo: ModoProduto; modelo: string } {
  const modo: ModoProduto = a.com_fala ? "falado" : "mudo";
  const lista: readonly string[] = a.com_fala ? MODELOS_FALADO_PRODUTO : MODELOS_MUDO_PRODUTO;
  const modelo = a.modelo ?? (a.com_fala ? MODELO_FALADO_PADRAO : MODELO_MUDO_PADRAO);
  if (!lista.includes(modelo))
    throw new ErroDaFerramenta(
      `O modelo ${modelo} não serve para vídeo ${a.com_fala ? "com fala" : "sem fala"}. Use um destes: ${lista.join(", ")}.`,
    );
  return { modo, modelo };
}

/** Créditos do vídeo no plano da conta (as imagens das cenas saem em Pro quando o plano tem). */
async function creditosDoVideo(userId: string, o: { modo: ModoProduto; modelo: string; duracao: number; audio: boolean }) {
  const pro = PLANOS[await planoAtual(userId)].qualidadePro;
  return creditosProduto({ ...o, pro });
}

/** Música de fundo do pedido: só com a declaração de direito de uso aceita pela pessoa. */
export function musicaDoPedido(a: { musica_key?: string; musica_nome?: string; musica_direito_de_uso?: boolean }) {
  if (!a.musica_key) return undefined;
  if (a.musica_direito_de_uso !== true)
    throw new ErroDaFerramenta(
      `Mostre à pessoa esta declaração e só siga se ela confirmar: "${DECLARACAO_MUSICA}" Depois chame de novo com musica_direito_de_uso: true.`,
    );
  return { key: a.musica_key, nome: a.musica_nome?.trim() || "Música", declaracao: DECLARACAO_MUSICA };
}

/** Campos da música de fundo (vídeo de produto e motion). */
export const CAMPOS_MUSICA = {
  musica_key: z
    .string()
    .optional()
    .describe("Música de fundo (opcional): key de musica_de_link ou de um áudio enviado com preparar_envio_de_arquivo (tipo audio)."),
  musica_nome: z.string().max(200).optional(),
  musica_direito_de_uso: z
    .boolean()
    .optional()
    .describe(`Com música: true só depois de a pessoa confirmar a declaração "${DECLARACAO_MUSICA}"`),
};

/** A imagem do produto para o Claude enxergar (reduzida). */
async function imagemParaVer(key: string): Promise<{ data: string; mimeType: string } | undefined> {
  const s3 = getS3();
  if (!s3) return undefined;
  try {
    const jpeg = await sharp(await getObjectBuffer(s3, key))
      .resize(768, 768, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { data: jpeg.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return undefined;
  }
}

export const FERRAMENTAS_PRODUTO: Ferramenta[] = [
  {
    name: "listar_produtos",
    recurso: "video_produto",
    description:
      "Lista os produtos criados em 3D (criar_produto ou a aba Criar produto da tela), dos mais novos aos mais antigos, com link da imagem (vale 1 hora). Use o produto_id em criar_video_de_produto ou criar_motion. Não gasta créditos.",
    entrada: z.object({}),
    executar: async ({ req }) => {
      const r = await chamarRota(criarProdutoGet, null, req, "");
      const produtos = (r.produtos ?? []) as Array<{ id: string; nome: string; descricao: string; imageKey: string; modelo: string; criadoEm: string }>;
      return {
        produtos: await Promise.all(
          produtos.map(async (p) => ({
            produto_id: p.id,
            nome: p.nome,
            descricao: p.descricao,
            modelo: p.modelo,
            criado_em: p.criadoEm,
            link_da_imagem: await linkDoArquivo(p.imageKey),
          })),
        ),
      };
    },
  },
  {
    name: "criar_produto",
    recurso: "video_produto",
    description: [
      "Cria a imagem do produto em 3D com a logo da empresa aplicada, a partir de uma foto básica do produto (foto_key) ou da descrição de como ele é (aparencia). A logo e a foto entram antes com preparar_envio_de_arquivo (tipo imagem). O produto fica salvo para usar em criar_video_de_produto e criar_motion.",
      'cores: "logo" pinta o produto com as cores da logo; "produto" mantém as cores dele e só aplica a logo (ex.: uma caneca branca continua branca).',
      `Modelos (créditos por imagem): ${OPCOES_PRODUTO.map((o) => `${o.id} = ${o.label}, ${creditosProdutoCriado(o)} (${o.nota})`).join("; ")}. Confirme com a pessoa antes de gerar. Devolve a imagem para você ver.`,
    ].join("\n"),
    entrada: z.object({
      nome: z.string().min(2).max(NOME_PRODUTO_MAX),
      descricao: z.string().max(DESCRICAO_PRODUTO_MAX).default("").describe("O que é, para que serve (opcional)."),
      foto_key: z.string().optional().describe("Foto básica do produto: a IA mantém a forma."),
      aparencia: z
        .string()
        .max(PROMPT_PRODUTO_MAX)
        .optional()
        .describe("Sem foto: como o produto é (formato, cor, material, detalhes)."),
      logo_key: z.string().min(1).describe("Logo da empresa."),
      cores: z.enum(["logo", "produto"]).default("logo"),
      modelo: z.enum(IDS_OPCOES).default("nano-banana:pro"),
    }),
    executar: async ({ args, req }) => {
      const a = args as {
        nome: string;
        descricao: string;
        foto_key?: string;
        aparencia?: string;
        logo_key: string;
        cores: "logo" | "produto";
        modelo: string;
      };
      if (!a.foto_key && (a.aparencia?.trim().length ?? 0) < 3)
        throw new ErroDaFerramenta("Passe foto_key (foto básica do produto) ou aparencia (como o produto é).");
      const r = await chamarRota(
        criarProdutoPost,
        {
          nome: a.nome,
          descricao: a.descricao,
          fotoKey: a.foto_key,
          prompt: a.foto_key ? "" : (a.aparencia ?? ""),
          logoKey: a.logo_key,
          cores: a.cores,
          opcao: a.modelo,
        },
        req,
      );
      const p = r.produto as { id: string; nome: string; descricao: string; imageKey: string };
      const opcao = OPCOES_PRODUTO.find((o) => o.id === a.modelo)!;
      return {
        produto_id: p.id,
        nome: p.nome,
        descricao: p.descricao,
        link_da_imagem: await linkDoArquivo(p.imageKey),
        creditos_gastos: creditosProdutoCriado(opcao),
        proximo_passo: "Use produto_id em montar_cenas_do_produto / criar_video_de_produto ou em criar_motion.",
        _imagem: await imagemParaVer(p.imageKey),
      };
    },
  },
  {
    name: "excluir_produto",
    recurso: "video_produto",
    description:
      "Exclui um produto criado (some da lista; os vídeos já feitos com ele não mudam). Confirme com a pessoa antes. Não gasta créditos.",
    entrada: z.object({ produto_id: z.string().min(1) }),
    executar: async ({ args, req }) => {
      const { produto_id } = args as { produto_id: string };
      await chamarRota(criarProdutoDelete, null, req, `id=${encodeURIComponent(produto_id)}`, "DELETE");
      return { ok: true };
    },
  },
  {
    name: "montar_cenas_do_produto",
    recurso: "video_produto",
    description: [
      `Primeiro passo do vídeo de produto (o influencer mostrando e usando o produto, até 60s): a IA olha as fotos e monta as cenas — o que se vê em cada uma e, com fala, o que a pessoa diz. Custa ${CREDITOS_TEXTO.escrever} créditos.`,
      "Mostre as cenas à pessoa (dá para editar) e passe-as em criar_video_de_produto com os mesmos campos. Devolve também quantos créditos o vídeo vai custar.",
    ].join("\n"),
    entrada: z.object({
      ...PEDIDO_DO_VIDEO,
      falas: z
        .string()
        .max(FALA_MAX_CARACTERES)
        .default("")
        .describe("Com fala: o que a pessoa fala (a IA divide entre as cenas). Vazio: a IA escreve a partir do produto."),
      cenario: z.string().max(400).default("").describe("Onde o vídeo acontece. Vazio: a IA escolhe."),
      detalhes: z.string().max(1000).default("").describe("Como usa o produto, o que destacar, o estilo do vídeo (opcional)."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as PedidoDoVideo & { falas: string; cenario: string; detalhes: string };
      const quem = await quemAparece(userId, a);
      const produto = await produtoDoPedido(userId, a);
      const { modo, modelo } = modeloDoVideo(a);
      const r = await chamarRota(
        roteiroPost,
        {
          produto: produto.texto,
          cenario: a.cenario,
          detalhes: a.detalhes,
          falas: modo === "falado" ? a.falas : "",
          modo,
          modelo,
          duracao: a.duracao,
          imageKey: quem.imageKey,
          produtoKeys: produto.keys,
        },
        req,
      );
      return {
        cenas: r.cenas,
        segundos_por_cena: r.segundos,
        modelo,
        duracao: a.duracao,
        creditos_gastos: CREDITOS_TEXTO.escrever,
        creditos_do_video: await creditosDoVideo(userId, { modo, modelo, duracao: a.duracao, audio: false }),
        proximo_passo:
          "Mostre as cenas à pessoa; depois chame criar_video_de_produto com as cenas (editadas ou não) e os mesmos personagem/imagem, produto, com_fala, modelo e duração.",
      };
    },
  },
  {
    name: "criar_video_de_produto",
    recurso: "video_produto",
    description: [
      "Gera o vídeo de produto a partir das cenas de montar_cenas_do_produto (mesmos campos). Cada cena ganha uma imagem nova da pessoa com o produto e, com fala, o áudio na voz escolhida. Assíncrono: devolve um job_id; acompanhe com status_do_video (leva alguns minutos).",
      "O custo é o creditos_do_video que montar_cenas_do_produto devolveu (mais o som ambiente, se pedir). Com fala, cobra o teto e devolve o que a fala não usar. Confirme com a pessoa antes de gerar.",
      "Com fala: a voz é a do personagem; para outra (ou com foto avulsa), passe voz_id e dono_id de vozes_prontas.",
    ].join("\n"),
    entrada: z.object({
      ...PEDIDO_DO_VIDEO,
      cenas: z
        .array(
          z.object({
            cena: z.string().min(3).max(CENA_MAX_CARACTERES),
            fala: z.string().max(FALA_MAX_CARACTERES).optional(),
          }),
        )
        .min(1)
        .max(MAX_CENAS_MUDAS_PRODUTO)
        .describe("As cenas de montar_cenas_do_produto, na ordem (com fala, cada uma com a fala)."),
      voz_id: z.string().optional().describe("Voz da fala (de vozes_prontas ou de ver_personagem)."),
      dono_id: z.string().optional().describe("Com voz de vozes_prontas: o dono_id que veio junto."),
      voz_nome: z.string().max(120).optional(),
      formato: z.enum(["9:16", "16:9"]).default("9:16").describe("9:16 em pé (Reels, TikTok) ou 16:9 deitado."),
      som_ambiente: z.boolean().default(false).describe("Sem fala: som ambiente gerado pelo modelo (só nos que têm áudio; custa mais)."),
      ...CAMPOS_MUSICA,
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as PedidoDoVideo & {
        cenas: Array<{ cena: string; fala?: string }>;
        voz_id?: string;
        dono_id?: string;
        voz_nome?: string;
        formato: "9:16" | "16:9";
        som_ambiente: boolean;
        musica_key?: string;
        musica_nome?: string;
        musica_direito_de_uso?: boolean;
      };
      const quem = await quemAparece(userId, a);
      const produto = await produtoDoPedido(userId, a);
      const { modo, modelo } = modeloDoVideo(a);
      const musica = musicaDoPedido(a);
      let voiceId: string | undefined;
      if (modo === "falado") {
        if (a.voz_id && a.dono_id) {
          // Voz pronta da biblioteca: entra na conta da NIDO (uma vez só) antes de falar.
          const v = await chamarRota(
            bibliotecaPost,
            { voiceId: a.voz_id, publicOwnerId: a.dono_id, nome: a.voz_nome?.trim() || "Voz pronta" },
            req,
          );
          voiceId = String(v.voiceId);
        } else voiceId = a.voz_id ?? (quem.personagem ? (await vozesDoPersonagem(userId, quem.personagem))[0]?.voz_id : undefined);
        if (!voiceId)
          throw new ErroDaFerramenta("Escolha a voz: use vozes_prontas e passe voz_id e dono_id (ou o voz_id de uma voz do personagem, em ver_personagem).");
      }
      const r = await chamarRota(
        produtoPost,
        {
          characterId: quem.characterId,
          imageKey: quem.imageKey,
          produtoKeys: produto.keys,
          produto: produto.texto,
          modo,
          modelo,
          duracao: a.duracao,
          vertical: a.formato === "9:16",
          audio: modo === "mudo" && a.som_ambiente,
          voiceId,
          cenas: a.cenas.map((c) => (modo === "falado" ? c : { cena: c.cena })),
          musica,
        },
        req,
      );
      return {
        job_id: r.jobId,
        duracao_segundos: r.duracao,
        creditos_cobrados: r.creditos,
        proximo_passo: "Acompanhe com status_do_video (leva alguns minutos). O vídeo também aparece na tela Produto do app.",
      };
    },
  },
  {
    name: "musica_de_link",
    recurso: "video_produto",
    description: `Tira a música de um link (YouTube, TikTok, Instagram, X ou arquivo direto), até 5 minutos, para usar como música de fundo em criar_video_de_produto ou exportar_video_do_motion. Custa ${CREDITOS_LINK} créditos. Antes, mostre à pessoa a declaração e só siga se ela confirmar: "${DECLARACAO_MUSICA}"`,
    entrada: z.object({
      url: z.string().url(),
      direito_de_uso: z.literal(true).describe("true só depois de a pessoa confirmar a declaração."),
    }),
    executar: async ({ args, req }) => {
      const { url } = args as { url: string };
      const r = await chamarRota(musicaPost, { url, declaracao: DECLARACAO_MUSICA }, req);
      const m = r.musica as { key: string; nome: string };
      return {
        musica_key: m.key,
        musica_nome: m.nome,
        creditos_gastos: CREDITOS_LINK,
        proximo_passo: "Passe musica_key, musica_nome e musica_direito_de_uso: true no vídeo de produto ou no MP4 do motion.",
      };
    },
  },
];
