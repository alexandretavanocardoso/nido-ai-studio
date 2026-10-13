import { ESTILOS_TROCA_IDS } from "@/lib/video/estilos";
import { nanoid } from "nanoid";
import { z } from "zod";
import { POST as escreverPost } from "@/app/api/escrever/route";
import { POST as imagemPost } from "@/app/api/gerar-imagem/route";
import { POST as cenaPost } from "@/app/api/videos/cena/route";
import { POST as criarPost } from "@/app/api/videos/criar/route";
import { POST as faladoPost } from "@/app/api/videos/falado/route";
import { POST as linkPost } from "@/app/api/videos/link/route";
import { POST as substituirPost } from "@/app/api/videos/substituir/route";
import {
  GET as bibliotecaGet,
  POST as bibliotecaPost,
} from "@/app/api/voz/biblioteca/route";
import { POST as falarPost } from "@/app/api/voz/falar/route";
import { carregarConta } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { carregarPersonagem } from "@/lib/personagens";
import {
  CORPO_INTEIRO_POR_SEGUNDO,
  CREDITOS_CENARIO,
  CREDITOS_LINK,
  CREDITOS_TEXTO,
  creditosCriarVideo,
  creditosFala,
  creditosImagem,
  creditosTroca,
  FALADO_POR_SEGUNDO,
  PLANOS,
} from "@/lib/planos";
import { getS3, presignGet } from "@/lib/storage/s3";
import type { Character, VideoArquivo } from "@/lib/types";
import { finalizarJob } from "@/lib/video/finalizar";
import {
  DURACOES_CRIAR,
  DURACOES_FALADO,
  FALA_MAX_CARACTERES,
  MAX_CENAS_FALADAS,
  MODELOS_CRIAR,
  modeloPadraoCriar,
  ROTEIRO_INTEIRO,
  type ModeloCriar,
} from "@/lib/video/precos";
import { getSapiens } from "@/lib/video/sapiens";

/** Modelo de "criar vídeo" quando a pessoa não escolhe: o do Sapiens, se configurado. */
const MODELO_PADRAO_CRIAR = modeloPadraoCriar({ sapiens: !!getSapiens() });

/**
 * Ferramentas do MCP (/api/mcp): o que o Claude Code pode fazer na conta de
 * quem conectou. Cada uma roda como o usuário do token (ver lib/auth/contexto)
 * e reaproveita as mesmas rotas da tela — então plano, créditos e limites
 * valem do mesmo jeito. As que gastam créditos dizem quanto na descrição:
 * é isso que o Claude (e a pessoa) lê antes de chamar.
 */
export interface Ferramenta {
  name: string;
  description: string;
  entrada: z.ZodType;
  executar: (o: {
    userId: string;
    args: unknown;
    req: Request;
  }) => Promise<unknown>;
}

/** Erro com mensagem para quem chamou (vira `isError` na resposta da ferramenta). */
export class ErroDaFerramenta extends Error {}

/** Chama uma rota da tela com o corpo dado, repassando a origem da request do MCP. */
export async function chamarRota(
  rota: (req: Request) => Promise<Response> | Response,
  corpo: unknown,
  req: Request,
  /** Para rotas GET: a query string (sem o "?"). */
  query?: string,
): Promise<Record<string, unknown>> {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const h of ["x-forwarded-for", "x-real-ip", "accept-language"]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const res = await rota(
    query === undefined
      ? new Request(new URL(req.url).origin + "/mcp", {
          method: "POST",
          headers,
          body: JSON.stringify(corpo),
        })
      : new Request(`${new URL(req.url).origin}/mcp?${query}`, { headers }),
  );
  const dados = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok)
    throw new ErroDaFerramenta(
      String(dados.error ?? `Falha (HTTP ${res.status}).`),
    );
  return dados;
}

export async function personagemOuErro(userId: string, id: string): Promise<Character> {
  const c = await carregarPersonagem(userId, id);
  if (!c)
    throw new ErroDaFerramenta(
      "Personagem não encontrado nesta conta. Use listar_personagens para ver os ids.",
    );
  return c;
}

/** Imagem padrão do personagem: a capa; senão o retrato mais recente; senão a 1ª referência. */
export function imagemPadrao(c: Character): string | null {
  if (c.visual.capaKey) return c.visual.capaKey;
  const geradas = [...(c.geradas ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  return (
    geradas.find((g) => g.tipo === "retrato")?.key ??
    geradas[0]?.key ??
    c.visual.referencias.find((r) => r.key)?.key ??
    null
  );
}

async function vozesDoPersonagem(userId: string, c: Character) {
  const { rows } = await getPool()!.query<{
    voice_id: string;
    nome: string;
    origem: string;
  }>(
    "select voice_id, nome, origem from vozes where user_id = $1 and character_id = $2 order by created_at desc",
    [userId, c.id],
  );
  return [
    ...(c.vozBiblioteca
      ? [
          {
            voz_id: c.vozBiblioteca.voiceId,
            nome: c.vozBiblioteca.nome,
            origem: "biblioteca",
          },
        ]
      : []),
    ...rows.map((r) => ({ voz_id: r.voice_id, nome: r.nome, origem: r.origem })),
  ];
}

/** Põe um vídeo em geração na lista do personagem, para aparecer no app também. */
export async function registrarVideo(
  userId: string,
  c: Character,
  v: Pick<
    VideoArquivo,
    "name" | "jobId" | "origem" | "duracao" | "fonte" | "antesKey"
  >,
): Promise<void> {
  const video: VideoArquivo = {
    id: nanoid(10),
    key: "",
    size: 0,
    contentType: "video/mp4",
    createdAt: Date.now(),
    status: "processando",
    ...v,
  };
  await getPool()!.query(
    `update characters
       set data = jsonb_set(data, '{videos}', $3::jsonb || coalesce(data->'videos', '[]'::jsonb)),
           updated_at = now()
     where id = $1 and user_id = $2`,
    [c.id, userId, JSON.stringify([video])],
  );
}

export async function linkDoArquivo(key: string, nome?: string): Promise<string | null> {
  const s3 = getS3();
  return s3 ? presignGet(s3, key, 3600, nome) : null;
}

const resumoDoVideo = (v: VideoArquivo) => ({
  nome: v.name,
  origem: v.origem ?? "upload",
  status: v.status ?? "pronto",
  duracao: v.duracao ?? null,
  job_id: v.jobId ?? null,
  erro: v.erro ?? null,
});

export const FERRAMENTAS: Ferramenta[] = [
  {
    name: "saldo",
    description:
      "Mostra o plano da conta e quantos créditos restam. Use antes de gerar algo caro. Não gasta créditos.",
    entrada: z.object({}),
    executar: async ({ userId }) => {
      const c = await carregarConta(userId);
      return {
        plano: PLANOS[c.plano].nome,
        creditos: c.total,
        creditos_do_plano: c.creditosPlano,
        creditos_avulsos: c.creditosAvulsos,
        proxima_recarga: c.proximaRecargaEm,
      };
    },
  },
  {
    name: "listar_personagens",
    description:
      "Lista os personagens (influenciadores) da conta, com id, nome e nicho. Os ids são usados nas outras ferramentas. Não gasta créditos.",
    entrada: z.object({}),
    executar: async ({ userId }) => {
      const { rows } = await getPool()!.query<{ data: Character }>(
        "select data from characters where user_id = $1 order by updated_at desc",
        [userId],
      );
      return {
        personagens: rows.map(({ data: c }) => ({
          id: c.id,
          nome: c.identidade?.nome || "(sem nome)",
          bio: c.identidade?.bio?.slice(0, 200) ?? "",
          imagens: c.geradas?.length ?? 0,
          videos: c.videos?.length ?? 0,
          roteiros_salvos:
            c.textos?.filter((t) => t.tipo === "roteiro").length ?? 0,
        })),
      };
    },
  },
  {
    name: "ver_personagem",
    description:
      "Detalhes de um personagem: bio, ideias de conteúdo, imagens (keys), vozes disponíveis, textos salvos (legendas e roteiros) e vídeos. Use para escolher imagem, voz ou roteiro antes de criar um vídeo. Não gasta créditos.",
    entrada: z.object({
      personagem_id: z.string().min(1).describe("id do personagem"),
    }),
    executar: async ({ userId, args }) => {
      const { personagem_id } = args as { personagem_id: string };
      const c = await personagemOuErro(userId, personagem_id);
      return {
        id: c.id,
        nome: c.identidade.nome,
        bio: c.identidade.bio,
        ideias_de_conteudo: c.nicho.ideiasConteudo
          .slice(0, 10)
          .map((i) => ({ titulo: i.titulo, descricao: i.descricao })),
        imagem_padrao: imagemPadrao(c),
        imagens: (c.geradas ?? [])
          .slice(0, 20)
          .map((g) => ({ imagem_key: g.key, tipo: g.tipo })),
        vozes: await vozesDoPersonagem(userId, c),
        textos_salvos: (c.textos ?? []).slice(0, 15).map((t) => ({
          tipo: t.tipo,
          tema: t.tema,
          opcoes: t.opcoes,
        })),
        videos: (c.videos ?? []).slice(0, 20).map(resumoDoVideo),
      };
    },
  },
  {
    name: "escrever_como_personagem",
    description: `Escreve na voz do personagem: legenda (3 opções), roteiro de vídeo curto ou respostas a um comentário. Custa ${CREDITOS_TEXTO.escrever} créditos por chamada. O texto volta na resposta (não fica salvo no app).`,
    entrada: z.object({
      personagem_id: z.string().min(1),
      tipo: z.enum(["legenda", "roteiro", "resposta"]),
      plataforma: z.enum(["instagram", "tiktok", "youtube"]).default("instagram"),
      tema: z
        .string()
        .max(1500)
        .default("")
        .describe("Assunto do post ou do vídeo. Opcional quando tipo = resposta."),
      comentario: z
        .string()
        .max(1000)
        .optional()
        .describe("Comentário do seguidor a responder (obrigatório quando tipo = resposta)."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        tipo: string;
        plataforma: string;
        tema: string;
        comentario?: string;
      };
      const character = await personagemOuErro(userId, a.personagem_id);
      const r = await chamarRota(
        escreverPost,
        {
          character,
          tipo: a.tipo,
          plataforma: a.plataforma,
          tema: a.tema,
          comentario: a.comentario,
        },
        req,
      );
      return { opcoes: r.opcoes, creditos_gastos: CREDITOS_TEXTO.escrever };
    },
  },
  {
    name: "criar_video_falado",
    description: [
      "Cria um vídeo do personagem falando um texto com a voz dele (lábios sincronizados). Assíncrono: devolve um job_id; acompanhe com status_do_video (leva alguns minutos).",
      `Custo: ${FALADO_POR_SEGUNDO} créditos por segundo em close (cabeça e ombros) ou ${CORPO_INTEIRO_POR_SEGUNDO} por segundo em corpo inteiro, mais ${CREDITOS_CENARIO} créditos por cenário. Um vídeo de 30s em close custa cerca de ${30 * FALADO_POR_SEGUNDO} créditos; em corpo inteiro, cerca de ${30 * CORPO_INTEIRO_POR_SEGUNDO}. Confirme com a pessoa antes de gerar.`,
      `A fala tem até ${FALA_MAX_CARACTERES} caracteres (cerca de 15 por segundo). Cada parágrafo (separado por linha em branco) é uma cena, até ${MAX_CENAS_FALADAS}; em corpo inteiro cada cena pode ter até 15s de fala.`,
      "O personagem precisa ter uma voz (veja em ver_personagem); sem voz_id, usa a primeira. Sem imagem_key, usa a imagem padrão do personagem.",
    ].join("\n"),
    entrada: z.object({
      personagem_id: z.string().min(1),
      fala: z
        .string()
        .min(2)
        .max(FALA_MAX_CARACTERES)
        .describe("O que o personagem fala, exatamente. Parágrafos separados por linha em branco viram cenas."),
      cenarios: z
        .array(z.string().max(400))
        .max(MAX_CENAS_FALADAS)
        .default([])
        .describe("Cenário de cada cena, na ordem (em inglês funciona melhor). Vazio ou ausente: o fundo da própria imagem."),
      enquadramento: z.enum(["close", "inteiro"]).default("close"),
      imagem_key: z.string().optional().describe("Imagem do personagem (de ver_personagem)."),
      voz_id: z.string().optional().describe("Voz do personagem (de ver_personagem)."),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        fala: string;
        cenarios: string[];
        enquadramento: "close" | "inteiro";
        imagem_key?: string;
        voz_id?: string;
      };
      const c = await personagemOuErro(userId, a.personagem_id);
      const imageKey = a.imagem_key ?? imagemPadrao(c);
      if (!imageKey)
        throw new ErroDaFerramenta(
          "Este personagem ainda não tem imagem. Gere um retrato no app antes de criar vídeos.",
        );
      const voiceId = a.voz_id ?? (await vozesDoPersonagem(userId, c))[0]?.voz_id;
      if (!voiceId)
        throw new ErroDaFerramenta(
          "Este personagem ainda não tem voz. Crie ou escolha uma voz no app (Criar vídeo → Falado → Voz).",
        );
      // A duração é só o teto: o vídeo dura o que a fala durar. Usa o menor que cabe.
      const estimada = Math.ceil(a.fala.trim().length / 15);
      const duracao =
        DURACOES_FALADO.find((d) => d >= estimada * 1.15 + 1) ?? ROTEIRO_INTEIRO;
      const r = await chamarRota(
        faladoPost,
        {
          characterId: c.id,
          imageKey,
          voiceId,
          fala: a.fala,
          cenarios: a.cenarios,
          duracao,
          enquadramento: a.enquadramento,
        },
        req,
      );
      await registrarVideo(userId, c, {
        name: `${c.identidade.nome || "personagem"} · Falado (Claude Code).mp4`,
        jobId: String(r.jobId),
        origem: "criado",
        duracao: Number(r.duracao) || undefined,
      });
      return {
        job_id: r.jobId,
        duracao_segundos: r.duracao,
        creditos_gastos: r.creditos,
        proximo_passo:
          "Chame status_do_video com este job_id a cada 30–60 segundos até o status ser 'concluido'.",
      };
    },
  },
  {
    name: "status_do_video",
    description:
      "Consulta um vídeo em geração (job_id de criar_video_falado). Quando termina, devolve um link para baixar (vale 1 hora). Se falhar, os créditos já foram devolvidos. Não gasta créditos.",
    entrada: z.object({ job_id: z.string().min(1) }),
    executar: async ({ userId, args }) => {
      const { job_id } = args as { job_id: string };
      const e = await finalizarJob(job_id, userId);
      if (!e) throw new ErroDaFerramenta("Vídeo não encontrado nesta conta.");
      const s3 = getS3();
      return {
        status: e.status,
        progresso: e.progresso ?? null,
        duracao_segundos: e.duracao ?? null,
        erro: e.erro ?? null,
        link_para_baixar:
          e.status === "concluido" && e.key && s3
            ? await presignGet(s3, e.key, 3600, `video-${job_id}.mp4`)
            : null,
      };
    },
  },
  {
    name: "roteiro_em_cenas",
    description: `Transforma um roteiro (com falas, marcações e legenda) nas falas e nos cenários de cada cena, prontos para criar_video_falado. Custa ${CREDITOS_TEXTO.cenaDoRoteiro} crédito. duracao = 60 pega o roteiro inteiro; 10, 15 ou 30 resumem as falas para caber.`,
    entrada: z.object({
      roteiro: z.string().min(10).max(8000),
      duracao: z
        .union([z.literal(10), z.literal(15), z.literal(30), z.literal(60)])
        .default(60),
    }),
    executar: async ({ args, req }) => {
      const a = args as { roteiro: string; duracao: number };
      const r = await chamarRota(
        cenaPost,
        { roteiro: a.roteiro, duracao: a.duracao, modo: "falado" },
        req,
      );
      return { fala: r.fala, cenarios: r.cenarios };
    },
  },
  {
    name: "criar_video_de_cena",
    description: [
      "Cria um vídeo SEM fala: a imagem do personagem vira o primeiro quadro e o texto descreve a ação (câmera, movimento, luz). Para o personagem falar, use criar_video_falado. Assíncrono: acompanhe com status_do_video.",
      `Custo por segundo: ${(Object.keys(MODELOS_CRIAR) as ModeloCriar[]).map((m) => `${MODELOS_CRIAR[m].label} ${creditosCriarVideo(m, 1, false)}`).join(", ")} créditos. Durações: ${DURACOES_CRIAR.join(", ")}s. Um vídeo de 10s no ${MODELOS_CRIAR[MODELO_PADRAO_CRIAR].label} custa ${creditosCriarVideo(MODELO_PADRAO_CRIAR, 10, false)} créditos. Confirme com a pessoa antes de gerar.`,
      "Descreva só o que aparece, de preferência em inglês; nomes de pessoas, marcas e personagens famosos costumam ser barrados pela moderação.",
    ].join("\n"),
    entrada: z.object({
      personagem_id: z.string().min(1),
      cena: z.string().min(3).max(1000).describe("O que acontece no vídeo."),
      modelo: z
        .enum(Object.keys(MODELOS_CRIAR) as [ModeloCriar, ...ModeloCriar[]])
        .default(MODELO_PADRAO_CRIAR),
      duracao: z
        .union([z.literal(10), z.literal(15), z.literal(30)])
        .default(10),
      vertical: z.boolean().default(true),
      imagem_key: z.string().optional(),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        cena: string;
        modelo: ModeloCriar;
        duracao: number;
        vertical: boolean;
        imagem_key?: string;
      };
      const c = await personagemOuErro(userId, a.personagem_id);
      const imageKey = a.imagem_key ?? imagemPadrao(c);
      if (!imageKey)
        throw new ErroDaFerramenta(
          "Este personagem ainda não tem imagem. Use gerar_imagem antes.",
        );
      const r = await chamarRota(
        criarPost,
        {
          characterId: c.id,
          imageKey,
          modelo: a.modelo,
          promptText: a.cena,
          duracao: a.duracao,
          vertical: a.vertical,
          audio: false,
        },
        req,
      );
      await registrarVideo(userId, c, {
        name: `${c.identidade.nome || "personagem"} · ${MODELOS_CRIAR[a.modelo].label} (Claude Code).mp4`,
        jobId: String(r.jobId),
        origem: "criado",
        duracao: a.duracao,
      });
      return { job_id: r.jobId, creditos_gastos: r.creditos };
    },
  },
  {
    name: "gerar_imagem",
    description: `Gera uma imagem nova do personagem a partir da ficha dele (retrato, ou folha de referência com vários ângulos). Custa ${creditosImagem("nano-banana", "padrao")} créditos na qualidade padrão e ${creditosImagem("nano-banana", "pro")} na pro. A imagem entra na galeria do personagem e a resposta traz a imagem_key (para usar nos vídeos) e um link para ver.`,
    entrada: z.object({
      personagem_id: z.string().min(1),
      tipo: z.enum(["retrato", "referencia"]).default("retrato"),
      qualidade: z.enum(["padrao", "pro"]).default("padrao"),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        tipo: "retrato" | "referencia";
        qualidade: "padrao" | "pro";
      };
      const c = await personagemOuErro(userId, a.personagem_id);
      // As imagens que o personagem já tem guiam a nova (mesmo rosto).
      const referencias = [
        ...c.visual.referencias.filter((r) => r.key).map((r) => r.key!),
        ...(c.geradas ?? []).map((g) => g.key),
      ]
        .slice(0, 4)
        .map((key) => ({ key }));
      const r = await chamarRota(
        imagemPost,
        {
          character: c,
          tipo: a.tipo,
          qualidade: a.qualidade,
          modelo: "nano-banana",
          referencias,
        },
        req,
      );
      const key = String(r.key ?? "");
      if (!key)
        throw new ErroDaFerramenta("A imagem foi gerada, mas não pôde ser salva.");
      const gerada = {
        id: nanoid(10),
        key,
        tipo: a.tipo,
        estilo: c.visual.estilo,
        qualidade: a.qualidade,
        modelo: "nano-banana",
        size: Number(r.size) || 0,
        createdAt: Date.now(),
      };
      await getPool()!.query(
        `update characters
           set data = jsonb_set(data, '{geradas}', $3::jsonb || coalesce(data->'geradas', '[]'::jsonb)),
               updated_at = now()
         where id = $1 and user_id = $2`,
        [c.id, userId, JSON.stringify([gerada])],
      );
      return {
        imagem_key: key,
        link_para_ver: await linkDoArquivo(key),
        creditos_gastos: creditosImagem("nano-banana", a.qualidade),
      };
    },
  },
  {
    name: "buscar_video_por_link",
    description: `Busca um vídeo de TikTok, Instagram (reel), YouTube (shorts) ou um link direto de .mp4, para depois trocar a pessoa pelo personagem (trocar_pessoa_no_video). Custa ${CREDITOS_LINK} créditos. Devolve o link_id.`,
    entrada: z.object({ url: z.string().url().max(2000) }),
    executar: async ({ args, req }) => {
      const r = await chamarRota(linkPost, { url: (args as { url: string }).url }, req);
      return {
        link_id: r.linkId,
        plataforma: r.plataforma,
        titulo: r.titulo,
        autor: r.autor,
        duracao_segundos: r.duracao,
        creditos_gastos: CREDITOS_LINK,
      };
    },
  },
  {
    name: "trocar_pessoa_no_video",
    description: [
      "Troca a pessoa principal de um vídeo (buscado com buscar_video_por_link) pelo personagem, mantendo cenário, câmera e áudio. Assíncrono (3 a 10 min): acompanhe com status_do_video.",
      `Custo: ${creditosTroca(1, "standard")}, ${creditosTroca(1, "pro")} ou ${creditosTroca(1, "4k")} créditos por segundo (standard, pro, 4k). 10s em pro custam ${creditosTroca(10, "pro")} créditos — é a ação mais cara: confirme com a pessoa antes.`,
      "Só use vídeos que a pessoa tem direito de usar: direitos_confirmados precisa ser true. Para escolher quem trocar quando há várias pessoas, use o app (lá dá para clicar em cada uma).",
    ].join("\n"),
    entrada: z.object({
      personagem_id: z.string().min(1),
      link_id: z.string().min(1),
      direitos_confirmados: z
        .boolean()
        .describe("A pessoa confirmou que tem direito de usar este vídeo."),
      segundos: z
        .union([z.literal(10), z.literal(15), z.literal(30)])
        .optional()
        .describe("Usar só os primeiros N segundos. Ausente: o vídeo inteiro."),
      qualidade: z.enum(["standard", "pro", "4k"]).default("pro"),
      imagem_key: z.string().optional(),
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
        link_id: string;
        direitos_confirmados: boolean;
        segundos?: number;
        qualidade: string;
        estilo: string;
        roupa: "personagem" | "video";
        imagem_key?: string;
      };
      if (!a.direitos_confirmados)
        throw new ErroDaFerramenta(
          "Confirme com a pessoa que ela tem direito de usar este vídeo antes de trocar.",
        );
      const c = await personagemOuErro(userId, a.personagem_id);
      const imageKey = a.imagem_key ?? imagemPadrao(c);
      if (!imageKey)
        throw new ErroDaFerramenta(
          "Este personagem ainda não tem imagem. Use gerar_imagem antes.",
        );
      const r = await chamarRota(
        substituirPost,
        {
          characterId: c.id,
          linkId: a.link_id,
          direitos: true,
          imageKey,
          motor: "kling",
          qualidade: a.qualidade,
          segundos: a.segundos,
          estilo: a.estilo,
          // Na rota, "foto" = manter a roupa do original (o mesmo nome da troca em imagem).
          roupa: a.roupa === "video" ? "foto" : "personagem",
        },
        req,
      );
      await registrarVideo(userId, c, {
        name: "Vídeo por link (com o personagem · Claude Code).mp4",
        jobId: String(r.jobId),
        antesKey: r.antesKey ? String(r.antesKey) : undefined,
        origem: "substituicao",
        duracao: Number(r.duracao) || undefined,
      });
      return {
        job_id: r.jobId,
        duracao_segundos: r.duracao,
        creditos_gastos: r.creditos,
      };
    },
  },
  {
    name: "vozes_prontas",
    description:
      "Lista vozes naturais da ElevenLabs em português do Brasil (gravadas por pessoas), com link para ouvir a prévia. Use escolher_voz para definir uma como a voz do personagem. Não gasta créditos.",
    entrada: z.object({
      genero: z.enum(["female", "male"]).optional(),
      pagina: z.number().int().min(0).max(50).default(0),
    }),
    executar: async ({ args, req }) => {
      const a = args as { genero?: string; pagina: number };
      const r = await chamarRota(
        bibliotecaGet,
        null,
        req,
        `genero=${a.genero ?? ""}&pagina=${a.pagina}`,
      );
      return {
        vozes: (r.vozes as Array<Record<string, unknown>>).map((v) => ({
          voz_id: v.voiceId,
          dono_id: v.publicOwnerId,
          nome: v.nome,
          genero: v.genero,
          uso: v.uso,
          previa: v.previewUrl,
        })),
        tem_mais: r.temMais,
      };
    },
  },
  {
    name: "escolher_voz",
    description:
      "Define uma voz pronta (de vozes_prontas) como a voz do personagem. Passe voz_id, dono_id e nome exatamente como vieram na lista. Não gasta créditos.",
    entrada: z.object({
      personagem_id: z.string().min(1),
      voz_id: z.string().min(1),
      dono_id: z.string().min(1),
      nome: z.string().min(1).max(120),
      previa: z.string().url().optional(),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as {
        personagem_id: string;
        voz_id: string;
        dono_id: string;
        nome: string;
        previa?: string;
      };
      const c = await personagemOuErro(userId, a.personagem_id);
      const r = await chamarRota(
        bibliotecaPost,
        { voiceId: a.voz_id, publicOwnerId: a.dono_id, nome: a.nome },
        req,
      );
      await getPool()!.query(
        `update characters
           set data = jsonb_set(data, '{vozBiblioteca}', $3::jsonb), updated_at = now()
         where id = $1 and user_id = $2`,
        [
          c.id,
          userId,
          JSON.stringify({
            voiceId: r.voiceId,
            nome: a.nome,
            previewUrl: a.previa,
          }),
        ],
      );
      return { voz_id: r.voiceId, nome: a.nome };
    },
  },
  {
    name: "gerar_fala",
    description: `Gera um áudio (MP3) do personagem falando um texto, com a voz dele. Custa ${creditosFala(100)} créditos a cada 100 caracteres (mínimo ${creditosFala(1)}). Devolve um link para baixar (vale 1 hora). Para um vídeo dele falando, use criar_video_falado, que já gera a fala.`,
    entrada: z.object({
      personagem_id: z.string().min(1),
      texto: z.string().min(2).max(1500),
      voz_id: z.string().optional(),
    }),
    executar: async ({ userId, args, req }) => {
      const a = args as { personagem_id: string; texto: string; voz_id?: string };
      const c = await personagemOuErro(userId, a.personagem_id);
      const voiceId = a.voz_id ?? (await vozesDoPersonagem(userId, c))[0]?.voz_id;
      if (!voiceId)
        throw new ErroDaFerramenta(
          "Este personagem ainda não tem voz. Use vozes_prontas e escolher_voz.",
        );
      const r = await chamarRota(
        falarPost,
        { characterId: c.id, voiceId, texto: a.texto },
        req,
      );
      return {
        link_para_baixar: await linkDoArquivo(String(r.key), "fala.mp3"),
        creditos_gastos: r.creditos,
      };
    },
  },
  {
    name: "como_comprar_creditos",
    description:
      "Devolve o link da página de planos e créditos. Compras e reembolsos só são feitos no app, pelo navegador — nunca por aqui.",
    entrada: z.object({}),
    executar: async ({ req }) => ({
      link: `${new URL(req.url).origin}/app/planos`,
    }),
  },
];
