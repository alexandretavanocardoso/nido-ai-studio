import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { z } from "zod";
import { adminOuResponder } from "@/lib/admin/acesso";
import { getPool } from "@/lib/db";
import { getFal } from "@/lib/fal";
import { recortarFigura } from "@/lib/figurinha";
import { listarMotions, workerLigado } from "@/lib/motion";
import { carregarPersonagem } from "@/lib/personagens";
import { getObjectBuffer, getS3, ownsKey, putObject } from "@/lib/storage/s3";
import { ehModeloMotion, MODELOS_MOTION } from "@/worker/motion/modelos";
import {
  DURACOES_MOTION,
  TIPOS_MOTION,
  type AssetMotion,
  type InputMotion,
  type PapelAsset,
} from "@/worker/motion/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  tipo: z.enum(TIPOS_MOTION as [string, ...string[]]),
  brief: z.string().trim().max(3000).default(""),
  formato: z.enum(["9:16", "16:9", "1:1"]),
  duracao: z.number().int().refine((d) => (DURACOES_MOTION as readonly number[]).includes(d), "Duração inválida."),
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
});

/** GET — os motions da conta e se o worker está ligado. */
export async function GET() {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pool = getPool();
  if (!pool) return NextResponse.json({ error: "Banco não configurado." }, { status: 500 });
  const [motions, worker] = await Promise.all([listarMotions(pool, admin.userId), workerLigado(pool)]);
  return NextResponse.json({ motions, worker });
}

/**
 * POST — novo motion: guarda o pedido na fila do worker. As imagens enviadas
 * viram assets (`asset://a1`…), com uma versão recortada (sem fundo) de cada
 * produto e do influencer quando o fal está configurado.
 */
export async function POST(req: Request) {
  const admin = await adminOuResponder();
  if (admin instanceof NextResponse) return admin;
  const pool = getPool();
  const s3 = getS3();
  if (!pool || !s3)
    return NextResponse.json({ error: "Banco ou armazenamento não configurados." }, { status: 500 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message, code: "BAD_INPUT" }, { status: 400 });
  const body = parsed.data;
  const userId = admin.userId;

  const comProduto = !!body.produto?.keys.length;
  const faltando =
    body.tipo === "site" && !body.site
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

  // Cada imagem vira um asset; com o fal, também a versão sem fundo.
  const fal = body.recortar ? getFal() : null;
  const fotos: Array<{ key: string; papel: "produto" | "influencer" }> = [
    ...(body.produto?.keys ?? []).map((key) => ({ key, papel: "produto" as const })),
    ...(body.influencer ? [{ key: body.influencer.imageKey, papel: "influencer" as const }] : []),
  ];
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
          console.warn("[admin/motion] recorte falhou:", (e as Error).message);
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
    formato: body.formato,
    duracao: body.duracao,
    assets,
    ...(body.site ? { site: { url: body.site.url } } : {}),
    ...(body.produto ? { produto: { nome: body.produto.nome, descricao: body.produto.descricao || undefined } } : {}),
    ...(influencer ? { influencer } : {}),
  };

  const id = nanoid(12);
  await pool.query(
    "insert into motions (id, user_id, tipo, modelo, esforco, input) values ($1, $2, $3, $4, $5, $6)",
    [id, userId, body.tipo, body.modelo, body.esforco, JSON.stringify(input)],
  );
  const [item] = await listarMotions(pool, userId, id);
  return NextResponse.json({ motion: item });
}
