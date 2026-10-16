import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  acertarLivesAbertas,
  avatarReaproveitavel,
  criarAvatarDaImagem,
  resumoDaLive,
  type LiveRow,
} from "@/lib/live/server";
import { avatar3dDaFoto, criarAvatar3d, gerarFundo3d } from "@/lib/live/avatar3d";
import { getDecart } from "@/lib/live/decart";
import { contextoLive } from "@/lib/live/rota";
import { ehSombra } from "@/lib/live/tipos";
import { carregarPersonagem } from "@/lib/personagens";
import {
  cobrarOuResponder,
  estornarSeHouver,
  type Cobranca,
} from "@/lib/creditos";
import { mensagemDeErro } from "@/lib/fal";
import { CREDITOS_AVATAR_3D, CREDITOS_CENARIO, duracaoLiveValida } from "@/lib/planos";
import { ownsKey } from "@/lib/storage/s3";
import { mensagemDeErroRunway } from "@/lib/video/runway";
import { vozPermitida } from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — as lives da conta (mais recentes primeiro). Acerta as que ficaram abertas. */
export async function GET() {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  await acertarLivesAbertas(ctx.pool, ctx.rw, ctx.userId).catch((e) =>
    console.error("[live] acerto", e),
  );
  const { rows } = await ctx.pool.query<LiveRow>(
    "select * from lives where user_id = $1 order by created_at desc limit 20",
    [ctx.userId],
  );
  return NextResponse.json({ lives: rows.map(resumoDaLive) });
}

const BodySchema = z
  .object({
    /**
     * avatar: avatar do Runway falando pela IA · sombra: a webcam vira o
     * influencer · sombra3d: a webcam mexe um avatar 3D do influencer.
     */
    tipo: z.enum(["avatar", "sombra", "sombra3d"]).default("avatar"),
    /** Sombra sem personagem: só o nome de quem aparece. */
    nomeSombra: z.string().trim().max(60).optional(),
    /** Live com personagem: a ficha dele vira a personalidade. */
    characterId: z.string().min(1).optional(),
    /** Live sem personagem: quem é e como fala, escrito na hora. */
    persona: z
      .object({
        nome: z.string().trim().min(1, "Escreva o nome de quem vai aparecer.").max(60),
        descricao: z
          .string()
          .trim()
          .min(10, "Descreva quem é e como fala (pelo menos uma frase).")
          .max(1500),
        vozNome: z.string().trim().max(120).optional(),
      })
      .optional(),
    imageKey: z.string().min(1, "Escolha a imagem do personagem."),
    /** Na sombra, vazio = a voz da própria pessoa. */
    voiceId: z.string().min(1).nullable().optional(),
    duracaoMin: z.number().int(),
    /** Cenário (lib/live/cena.ts): descrito ou por imagem. Sem ele, o fundo da foto. */
    cena: z
      .union([
        z.object({
          prompt: z
            .string()
            .trim()
            .min(3, "Descreva o cenário (ex.: numa praia ao pôr do sol).")
            .max(400),
        }),
        z.object({ imageKey: z.string().min(1) }),
      ])
      .optional(),
  })
  .refine(
    (b) =>
      ehSombra(b.tipo)
        ? !!b.characterId || !!b.nomeSombra
        : !!b.characterId !== !!b.persona,
    { message: "Escolha um personagem ou envie uma foto." },
  )
  .refine((b) => ehSombra(b.tipo) || !!b.voiceId, {
    message: "Escolha a voz do personagem.",
  })
  .refine((b) => b.tipo !== "sombra" || !b.cena || "prompt" in b.cena, {
    message: "Na Sombra ao vivo, o cenário é só por texto.",
  });

/**
 * POST — prepara uma live: monta (ou reaproveita) o avatar do Runway a partir
 * da imagem. A duração só é cobrada ao entrar no ar (/iniciar); aqui, só o
 * cenário (CREDITOS_CENARIO), quando precisa de uma imagem nova.
 */
export async function POST(req: Request) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, pool, rw, s3, el } = ctx;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;
  if (!duracaoLiveValida(body.duracaoMin))
    return NextResponse.json(
      { error: "Duração da live inválida: use de 1 a 120 minutos.", code: "BAD_INPUT" },
      { status: 400 },
    );
  if (!ownsKey(userId, body.imageKey))
    return NextResponse.json(
      { error: "Imagem não encontrada." },
      { status: 404 },
    );
  const cena = body.cena ?? null;
  if (cena && "imageKey" in cena && !ownsKey(userId, cena.imageKey))
    return NextResponse.json(
      { error: "Imagem do cenário não encontrada." },
      { status: 404 },
    );
  if (body.voiceId && !(await vozPermitida(pool, el, userId, body.voiceId)))
    return NextResponse.json({ error: "Voz não encontrada." }, { status: 404 });
  let nome = body.persona?.nome ?? "";
  if (body.characterId) {
    const personagem = await carregarPersonagem(userId, body.characterId);
    if (!personagem)
      return NextResponse.json(
        { error: "Personagem não encontrado." },
        { status: 404 },
      );
    nome = personagem.identidade.nome;
  }

  // Shadow ao vivo: não há avatar a montar — a foto vai direto para a Decart
  // quando a live entrar no ar. Já fica pronta.
  if (body.tipo === "sombra") {
    if (!getDecart())
      return NextResponse.json(
        { error: "Sombra não configurada no servidor (DECART_API_KEY).", code: "CONFIG_MISSING" },
        { status: 500 },
      );
    const id = nanoid(12);
    const { rows } = await pool.query<LiveRow>(
      `insert into lives (id, user_id, tipo, character_id, persona, cena, status, image_key, voice_id, duracao_min, sala)
       values ($1, $2, 'sombra', $3, $4, $5, 'pronta', $6, $7, $8, $9) returning *`,
      [
        id,
        userId,
        body.characterId ?? null,
        body.nomeSombra ? JSON.stringify({ nome: body.nomeSombra, descricao: "" }) : null,
        cena ? JSON.stringify(cena) : null,
        body.imageKey,
        body.voiceId ?? null,
        body.duracaoMin,
        `live-${id}`,
      ],
    );
    return NextResponse.json({ live: resumoDaLive(rows[0]) });
  }

  // Sombra 3D: monta (ou reaproveita) o avatar 3D da foto — fica "preparando"
  // até o modelo 3D sair (GET /api/live/[id] acompanha). Fundo descrito em
  // texto vira uma imagem do lugar; imagem enviada vai como está.
  if (body.tipo === "sombra3d") {
    let cobrancaAvatar: Cobranca | null = null;
    let cobrancaFundo: Cobranca | null = null;
    try {
      const anterior = await avatar3dDaFoto(pool, userId, body.imageKey);
      if (!anterior) {
        const cobrado = await cobrarOuResponder(userId, CREDITOS_AVATAR_3D, "live_avatar3d");
        if (cobrado instanceof NextResponse) return cobrado;
        cobrancaAvatar = cobrado.cobranca;
      }
      const lugar = cena && "prompt" in cena ? cena.prompt : null;
      if (lugar) {
        const cobrado = await cobrarOuResponder(userId, CREDITOS_CENARIO, "live_cena");
        if (cobrado instanceof NextResponse) {
          await estornarSeHouver(cobrancaAvatar);
          return cobrado;
        }
        cobrancaFundo = cobrado.cobranca;
      }
      const [avatar, fundoKey] = await Promise.all([
        anterior ?? criarAvatar3d(pool, s3, { userId, imageKey: body.imageKey, cobranca: cobrancaAvatar }),
        lugar ? gerarFundo3d(s3, userId, lugar) : null,
      ]);
      const fundo = fundoKey ? { imageKey: fundoKey } : cena;
      const id = nanoid(12);
      const { rows } = await pool.query<LiveRow>(
        `insert into lives (id, user_id, tipo, character_id, persona, cena, status, image_key, voice_id, duracao_min, sala, avatar3d_id)
         values ($1, $2, 'sombra3d', $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
        [
          id,
          userId,
          body.characterId ?? null,
          body.nomeSombra ? JSON.stringify({ nome: body.nomeSombra, descricao: "" }) : null,
          fundo ? JSON.stringify(fundo) : null,
          avatar.status === "pronto" ? "pronta" : "preparando",
          body.imageKey,
          body.voiceId ?? null,
          body.duracaoMin,
          `live-${id}`,
          avatar.id,
        ],
      );
      return NextResponse.json({ live: resumoDaLive(rows[0]) });
    } catch (e) {
      await estornarSeHouver(cobrancaAvatar);
      await estornarSeHouver(cobrancaFundo);
      console.error("[live] avatar 3d", e);
      return NextResponse.json(
        { error: mensagemDeErro(e) || "Não consegui montar o avatar 3D.", code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    }
  }

  let avatarId: string;
  let pronto = false;
  let cobranca: Cobranca | null = null;
  try {
    const anterior = await avatarReaproveitavel(pool, rw, userId, body.imageKey, cena);
    pronto = !!anterior;
    if (!anterior && cena) {
      // Pôr a pessoa no cenário é uma imagem nova (Nano Banana): cobra agora.
      const cobrado = await cobrarOuResponder(userId, CREDITOS_CENARIO, "live_cena");
      if (cobrado instanceof NextResponse) return cobrado;
      cobranca = cobrado.cobranca;
    }
    avatarId =
      anterior ??
      (await criarAvatarDaImagem(rw, s3, {
        userId,
        nome: nome || "Personagem",
        imageKey: body.imageKey,
        cena,
      }));
  } catch (e) {
    await estornarSeHouver(cobranca);
    console.error("[live] avatar", e);
    return NextResponse.json(
      { error: mensagemDeErroRunway(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }

  const id = nanoid(12);
  const { rows } = await pool.query<LiveRow>(
    `insert into lives (id, user_id, character_id, persona, cena, status, image_key, voice_id, avatar_id, duracao_min, sala)
     values ($1, $2, $3, $10, $11, $4, $5, $6, $7, $8, $9) returning *`,
    [
      id,
      userId,
      body.characterId ?? null,
      pronto ? "pronta" : "preparando",
      body.imageKey,
      body.voiceId!,
      avatarId,
      body.duracaoMin,
      `live-${id}`,
      body.persona ? JSON.stringify(body.persona) : null,
      cena ? JSON.stringify(cena) : null,
    ],
  );
  return NextResponse.json({ live: resumoDaLive(rows[0]) });
}
