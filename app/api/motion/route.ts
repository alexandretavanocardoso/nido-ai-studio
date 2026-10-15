import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { z } from "zod";
import { liberadoOuResponder } from "@/lib/admin/acesso";
import { idiomaDoPedido } from "@/lib/ai/idioma";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { getUserId } from "@/lib/auth/server";
import { cobrarOuResponder, estornarSeHouver } from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { DECLARACAO_REFERENCIA_MOTION } from "@/lib/declaracoes";
import { getFal } from "@/lib/fal";
import { recortarFigura } from "@/lib/figurinha";
import { listarMotions, workerLigado } from "@/lib/motion";
import { acertarMotions } from "@/lib/motion-creditos";
import { carregarPersonagem } from "@/lib/personagens";
import { getObjectBuffer, getS3, ownsKey, presignGet, putObject } from "@/lib/storage/s3";
import { probe } from "@/lib/video/ffmpeg";
import {
  creditosMotion,
  ehModeloMotion,
  estimativaMotion,
  MODELOS_MOTION,
  type EsforcoMotion,
  type ModeloMotion,
} from "@/worker/motion/modelos";
import {
  DURACOES_MOTION,
  duracaoDaReferencia,
  REFERENCIA_MAX_SEGUNDOS,
  TIPOS_MOTION,
  type AssetMotion,
  type InputMotion,
  type PapelAsset,
  type ReferenciaMotion,
} from "@/worker/motion/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  tipo: z.enum(TIPOS_MOTION as [string, ...string[]]),
  brief: z.string().trim().max(3000).default(""),
  formato: z.enum(["9:16", "16:9", "1:1"]),
  // Sem vídeo de referência, uma das durações da tela; com ele, a do vídeo (o servidor mede).
  duracao: z.number().int().min(3, "Duração inválida.").max(REFERENCIA_MAX_SEGUNDOS, "Duração inválida."),
  modelo: z.string().refine(ehModeloMotion, "Modelo inválido."),
  esforco: z.enum(["low", "medium", "high", "xhigh", "max"]),
  site: z.object({ url: z.string().trim().min(4, "Informe o endereço do site.").max(500) }).optional(),
  produto: z
    .object({
      nome: z.string().trim().min(2, "Diga qual é o produto.").max(120),
      descricao: z.string().trim().max(400).default(""),
      keys: z.array(z.string().min(1)).max(3).default([]),
    })
    .optional(),
  influencer: z
    .object({
      characterId: z.string().min(1).nullable().default(null),
      imageKey: z.string().min(1, "Escolha o influencer."),
      descricao: z.string().trim().max(400).default(""),
    })
    .optional(),
  /** Também manda as fotos sem o fundo (recorte por IA), para flutuarem na animação. */
  recortar: z.boolean().default(true),
  /** Vídeo de referência (estilo Katana): enviado (pasta videos) ou buscado por link em /api/motion/referencia. */
  referencia: z
    .object({
      key: z.string().min(1),
      origem: z.enum(["upload", "link"]).default("upload"),
      url: z.string().max(2000).optional(),
      titulo: z.string().trim().max(200).optional(),
      usarAudio: z.boolean().default(true),
      declaracao: z.literal(DECLARACAO_REFERENCIA_MOTION, {
        message: "Confirme que tem direito de usar o vídeo de referência.",
      }),
    })
    .optional(),
});

/** GET — os motions da conta e se o worker está ligado. */
export async function GET() {
  const bloqueio = await liberadoOuResponder("motion");
  if (bloqueio) return bloqueio;
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  // Os que terminaram: cobra o custo real (ou devolve tudo, se falhou) antes de listar.
  await acertarMotions(pool, userId);
  const [motions, worker] = await Promise.all([listarMotions(pool, userId), workerLigado(pool)]);
  return NextResponse.json({ motions, worker });
}

/**
 * POST — novo motion: guarda o pedido na fila do worker. As imagens enviadas
 * viram assets (`asset://a1`…), com uma versão recortada (sem fundo) de cada
 * produto e do influencer quando o fal está configurado. Reserva a estimativa
 * em créditos; o acerto pelo custo real vem quando o worker termina
 * (lib/motion-creditos.ts).
 */
export async function POST(req: Request) {
  const bloqueio = await liberadoOuResponder("motion");
  if (bloqueio) return bloqueio;
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "Entre na sua conta.", code: "UNAUTHORIZED" }, { status: 401 });
  const pool = getPool();
  const s3 = getS3();
  if (!pool || !s3)
    return NextResponse.json({ error: "Banco ou armazenamento não configurados." }, { status: 500 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message, code: "BAD_INPUT" }, { status: 400 });
  const body = parsed.data;

  const comProduto = !!body.produto?.keys.length;
  const faltando =
    body.tipo === "video" && !body.referencia
      ? "Envie o vídeo de referência (arquivo ou link)."
      : !body.referencia && !(DURACOES_MOTION as readonly number[]).includes(body.duracao)
        ? "Duração inválida."
        : body.tipo === "site" && !body.site
      ? "Informe o endereço do site."
      : body.tipo === "produto" && !comProduto
        ? "Envie ao menos uma foto do produto."
        : body.tipo === "influencer" && !body.influencer
          ? "Escolha o influencer."
          : body.tipo === "misto" && (!body.influencer || (!comProduto && !body.site))
            ? "No misto, escolha o influencer e envie o produto ou o site."
            : null;
  if (faltando) return NextResponse.json({ error: faltando, code: "BAD_INPUT" }, { status: 400 });
  const esforcos: readonly string[] = MODELOS_MOTION[body.modelo as keyof typeof MODELOS_MOTION].esforcos;
  if (!esforcos.includes(body.esforco))
    return NextResponse.json({ error: "Este modelo não aceita esse esforço.", code: "BAD_INPUT" }, { status: 400 });
  const keys = [...(body.produto?.keys ?? []), ...(body.influencer ? [body.influencer.imageKey] : [])];
  if (keys.some((k) => !ownsKey(userId, k)))
    return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });

  // O vídeo de referência: a duração e o tamanho medidos aqui (até 1 minuto); o motion dura o mesmo.
  let referencia: ReferenciaMotion | undefined;
  if (body.referencia) {
    if (!ownsKey(userId, body.referencia.key))
      return NextResponse.json({ error: "Vídeo de referência não encontrado." }, { status: 404 });
    const info = await probe(await presignGet(s3, body.referencia.key, 600)).catch(() => null);
    if (!info)
      return NextResponse.json({ error: "Não consegui ler o vídeo de referência. Envie outro.", code: "BAD_INPUT" }, { status: 400 });
    if (info.duracao > REFERENCIA_MAX_SEGUNDOS + 1)
      return NextResponse.json(
        { error: `O vídeo de referência tem ${Math.round(info.duracao)}s — o máximo é ${REFERENCIA_MAX_SEGUNDOS}s.`, code: "BAD_INPUT" },
        { status: 400 },
      );
    referencia = {
      key: body.referencia.key,
      duracao: Number(info.duracao.toFixed(2)),
      largura: info.largura,
      altura: info.altura,
      origem: body.referencia.origem,
      ...(body.referencia.url ? { url: body.referencia.url } : {}),
      ...(body.referencia.titulo ? { titulo: body.referencia.titulo } : {}),
      usarAudio: body.referencia.usarAudio,
    };
  }
  const duracao = referencia ? duracaoDaReferencia(referencia.duracao) : body.duracao;

  const gate = await allow(`motion:${userId}`, 6);
  if (!gate.ok)
    return NextResponse.json(
      { error: `Muitos pedidos seguidos. Tente em ${gate.retryAfter}s.` },
      { status: 429 },
    );

  // Cada imagem vira um asset; com o fal, também a versão sem fundo.
  const fal = body.recortar ? getFal() : null;
  const fotos: Array<{ key: string; papel: "produto" | "influencer" }> = [
    ...(body.produto?.keys ?? []).map((key) => ({ key, papel: "produto" as const })),
    ...(body.influencer ? [{ key: body.influencer.imageKey, papel: "influencer" as const }] : []),
  ];

  // Reserva a estimativa da tela (as imagens que o modelo vai ver: as fotos, os
  // recortes e ~3 do site). O custo real é acertado quando ficar pronto.
  const imagens = fotos.length * (fal ? 2 : 1) + (body.site ? 3 : 0);
  const reserva = creditosMotion(
    estimativaMotion(body.modelo as ModeloMotion, body.esforco as EsforcoMotion, imagens, referencia?.duracao ?? 0),
  );
  const cobrado = await cobrarOuResponder(userId, reserva, "motion");
  if (cobrado instanceof NextResponse) return cobrado;
  try {
    const lidas = await Promise.all(
      fotos.map(async (f) => {
        const imagem = await getObjectBuffer(s3, f.key);
        const meta = await sharp(imagem).metadata();
        let recorte: { key: string; largura?: number; altura?: number } | null = null;
        if (fal) {
          try {
            const png = await recortarFigura(fal, imagem);
            const m = await sharp(png).metadata();
            const key = `users/${userId}/motion/${nanoid(12)}.png`;
            await putObject(s3, key, png, "image/png");
            recorte = { key, largura: m.width, altura: m.height };
          } catch (e) {
            console.warn("[motion] recorte falhou:", (e as Error).message);
          }
        }
        return { ...f, largura: meta.width, altura: meta.height, recorte };
      }),
    );
    const assets: AssetMotion[] = [];
    for (const l of lidas) {
      assets.push({ id: `a${assets.length + 1}`, key: l.key, papel: l.papel, largura: l.largura, altura: l.altura });
      if (l.recorte)
        assets.push({
          id: `a${assets.length + 1}`,
          key: l.recorte.key,
          papel: `${l.papel}-recorte` as PapelAsset,
          largura: l.recorte.largura,
          altura: l.recorte.altura,
          transparente: true,
        });
    }

    let influencer: InputMotion["influencer"];
    if (body.influencer) {
      const c = body.influencer.characterId ? await carregarPersonagem(userId, body.influencer.characterId) : null;
      const sobre = [c?.identidade.ocupacao, c?.identidade.bio].filter(Boolean).join(". ");
      influencer = {
        nome: c?.identidade.nome || "Influencer",
        descricao: [body.influencer.descricao, sobre].filter(Boolean).join(" — ").slice(0, 600) || undefined,
      };
    }
    const input: InputMotion = {
      brief: body.brief,
      // Os textos na tela saem no idioma da conta, mesmo com o pedido vazio ou em outra língua.
      idioma: idiomaDoPedido(req),
      formato: body.formato,
      duracao,
      assets,
      ...(body.site ? { site: { url: body.site.url } } : {}),
      ...(body.produto ? { produto: { nome: body.produto.nome, descricao: body.produto.descricao || undefined } } : {}),
      ...(influencer ? { influencer } : {}),
      ...(referencia ? { referencia } : {}),
    };

    const id = nanoid(12);
    await pool.query(
      "insert into motions (id, user_id, tipo, modelo, esforco, input, cobranca) values ($1, $2, $3, $4, $5, $6, $7)",
      [
        id,
        userId,
        body.tipo,
        body.modelo,
        body.esforco,
        JSON.stringify(input),
        cobrado.cobranca ? JSON.stringify(cobrado.cobranca) : null,
      ],
    );
    if (body.referencia)
      await pool
        .query(
          "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'uso_referencia_motion', $4, $5)",
          [nanoid(14), userId, "motion", `${body.referencia.declaracao} [${body.referencia.key}]`, readIp(req)],
        )
        .catch((e) => console.warn("[motion] declaração da referência:", (e as Error).message));
    const [item] = await listarMotions(pool, userId, id);
    return NextResponse.json({ motion: item });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    console.error("[motion] criar", e);
    return NextResponse.json(
      { error: "Não consegui criar o motion. Os créditos foram devolvidos." },
      { status: 500 },
    );
  }
}
