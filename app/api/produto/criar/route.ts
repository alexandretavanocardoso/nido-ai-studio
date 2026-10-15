import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { ImageBlockedError, ImageConfigError, ImageProviderError } from "@/lib/ai/gemini";
import { gerarQuadradaComModelo, modeloDisponivel } from "@/lib/ai/gerar-com-modelo";
import { OpenAIImagemError } from "@/lib/ai/openai-imagem";
import { allow } from "@/lib/ai/rate-limit";
import { cobrarOuResponder, estornarSeHouver, planoAtual } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { mensagemDeErro } from "@/lib/fal";
import { armazenamentoOuResponder, liberarVaga, somarArmazenamento, vagaOuResponder } from "@/lib/limites";
import { bloqueioImagem } from "@/lib/planos";
import {
  creditosProdutoCriado,
  DESCRICAO_PRODUTO_MAX,
  NOME_PRODUTO_MAX,
  opcaoProduto,
  PRODUTOS_NA_TELA,
  PROMPT_PRODUTO_MAX,
  promptProdutoCriado,
  type ProdutoCriado,
} from "@/lib/produto-criado";
import { newKey, ownsKey, putObject } from "@/lib/storage/s3";
import { contextoVideo } from "@/lib/video/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Geração leva de ~10s a ~1min (Nano Banana Pro 2K, GPT Image alta). */
export const maxDuration = 120;

const PER_MINUTE = Number(process.env.IMAGE_RATE_LIMIT_PER_MINUTE ?? 5);

const BodySchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao produto.").max(NOME_PRODUTO_MAX),
  descricao: z.string().trim().max(DESCRICAO_PRODUTO_MAX).default(""),
  /** Foto básica do produto (S3). Sem ela, vale o `prompt`. */
  fotoKey: z.string().min(1).optional(),
  prompt: z.string().trim().max(PROMPT_PRODUTO_MAX).default(""),
  logoKey: z.string().min(1, "Envie a logo da empresa."),
  /** "logo": o produto ganha as cores da logo · "produto": mantém as cores dele e só recebe a logo. */
  cores: z.enum(["logo", "produto"]).default("logo"),
  /** Modelo e qualidade (ver OPCOES_PRODUTO). */
  opcao: z.string().min(1),
});

type Linha = { id: string; nome: string; descricao: string; image_key: string; modelo: string; created_at: Date };

const paraTela = (r: Linha): ProdutoCriado => ({
  id: r.id,
  nome: r.nome,
  descricao: r.descricao,
  imageKey: r.image_key,
  modelo: r.modelo,
  criadoEm: r.created_at.toISOString(),
});

/** Banco sem a tabela (migration 0044 ainda não aplicada). */
const semTabela = (e: unknown) => (e as { code?: string })?.code === "42P01";

/** GET — os produtos criados da conta, dos mais novos para os mais antigos. */
export async function GET() {
  const bloqueio = await liberadoOuResponder("video_produto");
  if (bloqueio) return bloqueio;
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const pool = getPool();
  if (!pool) return NextResponse.json({ produtos: [] });
  try {
    const { rows } = await pool.query<Linha>(
      `select id, nome, descricao, image_key, modelo, created_at from produtos
       where user_id = $1 order by created_at desc limit ${PRODUTOS_NA_TELA}`,
      [ctx.userId],
    );
    return NextResponse.json({ produtos: rows.map(paraTela) });
  } catch (e) {
    if (semTabela(e)) return NextResponse.json({ produtos: [] });
    throw e;
  }
}

/**
 * POST — cria o produto em 3D com a logo da empresa (nas cores da logo, ou
 * mantendo as cores do produto), a partir da foto básica (ou da descrição de
 * como ele é), com o modelo de imagem escolhido.
 * Cobra como uma imagem do modelo; a imagem fica no S3 e o produto, salvo.
 */
export async function POST(req: Request) {
  const bloqueado = await liberadoOuResponder("video_produto");
  if (bloqueado) return bloqueado;
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const pool = getPool();
  if (!pool)
    return NextResponse.json({ error: "Banco de dados não configurado.", code: "CONFIG_MISSING" }, { status: 500 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message, code: "BAD_INPUT" }, { status: 400 });
  const body = parsed.data;
  const opcao = opcaoProduto(body.opcao);
  if (!opcao) return NextResponse.json({ error: "Modelo inválido.", code: "BAD_INPUT" }, { status: 400 });
  if (!body.fotoKey && body.prompt.length < 3)
    return NextResponse.json(
      { error: "Envie a foto básica do produto ou descreva como ele é.", code: "BAD_INPUT" },
      { status: 400 },
    );
  if (!ownsKey(userId, body.logoKey) || (body.fotoKey && !ownsKey(userId, body.fotoKey)))
    return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  if (!modeloDisponivel(opcao.modelo))
    return NextResponse.json(
      { error: "Este modelo de imagem não está configurado neste servidor.", code: "CONFIG_MISSING" },
      { status: 500 },
    );
  // Antes de cobrar: sem a tabela, o produto não teria onde ficar.
  try {
    await pool.query("select 1 from produtos limit 0");
  } catch (e) {
    if (semTabela(e))
      return NextResponse.json(
        { error: "Criar produto ainda não está disponível neste servidor.", code: "CONFIG_MISSING" },
        { status: 500 },
      );
    throw e;
  }

  const gate = await allow(`img:${userId}`, PER_MINUTE);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitas imagens seguidas. Tente de novo em ${gate.retryAfter}s.`, code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  const motivo = bloqueioImagem(await planoAtual(userId), opcao.modelo, opcao.qualidade);
  if (motivo) return NextResponse.json({ error: motivo, code: "PLANO" }, { status: 403 });
  const semEspaco = await armazenamentoOuResponder(userId);
  if (semEspaco) return semEspaco;
  const vaga = await vagaOuResponder(userId, "imagem");
  if (vaga instanceof NextResponse) return vaga;
  const cobrado = await cobrarOuResponder(userId, creditosProdutoCriado(opcao), "imagem", `produto:${opcao.id}`);
  if (cobrado instanceof NextResponse) {
    await liberarVaga(vaga.vaga);
    return cobrado;
  }

  try {
    const jpeg = await gerarQuadradaComModelo({
      s3,
      modelo: opcao.modelo,
      qualidade: opcao.qualidade,
      prompt: promptProdutoCriado({
        nome: body.nome,
        descricao: body.descricao,
        prompt: body.prompt,
        temFoto: !!body.fotoKey,
        cores: body.cores,
      }),
      // A foto básica primeiro, a logo por último (o prompt conta com essa ordem).
      keys: body.fotoKey ? [body.fotoKey, body.logoKey] : [body.logoKey],
    });
    const imageKey = newKey(userId, "generated", "image/jpeg");
    await putObject(s3, imageKey, jpeg, "image/jpeg");
    await somarArmazenamento(userId, jpeg.length);
    const { rows } = await pool.query<Linha>(
      `insert into produtos (id, user_id, nome, descricao, image_key, logo_key, foto_key, prompt, cores, modelo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, nome, descricao, image_key, modelo, created_at`,
      [
        nanoid(12),
        userId,
        body.nome,
        body.descricao,
        imageKey,
        body.logoKey,
        body.fotoKey ?? null,
        body.prompt || null,
        body.cores,
        opcao.id,
      ],
    );
    return NextResponse.json({ produto: paraTela(rows[0]) });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof ImageBlockedError)
      return NextResponse.json({ error: e.message, code: "BLOCKED" }, { status: 422 });
    if (e instanceof OpenAIImagemError)
      return NextResponse.json(
        { error: e.message, code: e.bloqueado ? "BLOCKED" : "PROVIDER_ERROR" },
        { status: e.bloqueado ? 422 : 502 },
      );
    if (e instanceof ImageConfigError)
      return NextResponse.json(
        { error: "Chave do Gemini não configurada no servidor.", code: "CONFIG_MISSING" },
        { status: 500 },
      );
    if (e instanceof ImageProviderError)
      return NextResponse.json({ error: e.message, code: "PROVIDER_ERROR" }, { status: 502 });
    console.error("[produto/criar]", e);
    return NextResponse.json({ error: mensagemDeErro(e), code: "PROVIDER_ERROR" }, { status: 502 });
  } finally {
    await liberarVaga(vaga.vaga);
  }
}

/** DELETE ?id= — tira o produto da lista (a imagem sai na limpeza diária, se nenhum vídeo usar). */
export async function DELETE(req: Request) {
  const bloqueado = await liberadoOuResponder("video_produto");
  if (bloqueado) return bloqueado;
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const id = new URL(req.url).searchParams.get("id");
  const pool = getPool();
  if (!id || !pool) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  const { rowCount } = await pool.query("delete from produtos where id = $1 and user_id = $2", [id, ctx.userId]);
  if (!rowCount) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
