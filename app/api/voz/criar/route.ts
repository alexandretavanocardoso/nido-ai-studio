import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { readIp } from "@/lib/ai/rate-limit";
import {
  cobrarOuResponder,
  estornarSeHouver,
  planoAtual,
} from "@/lib/creditos";
import { getPool } from "@/lib/db";
import { somarArmazenamento } from "@/lib/limites";
import { carregarPersonagem } from "@/lib/personagens";
import { bloqueioVoz, CREDITOS_CRIAR_VOZ } from "@/lib/planos";
import { getObjectBuffer, newKey, ownsKey, putObject } from "@/lib/storage/s3";
import { contextoVideo } from "@/lib/video/server";
import {
  clonarVoz,
  criarVozDesign,
  DECLARACAO_VOZ,
  descricaoDaFicha,
  getEleven,
  mensagemDeErroVoz,
  textoAmostra,
} from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TIPO_POR_EXTENSAO: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  weba: "audio/webm",
  ogg: "audio/ogg",
};

const BodySchema = z.object({
  characterId: z.string().min(1),
  /** design = voz sintética pela descrição · clone = a partir de amostras de áudio */
  modo: z.enum(["design", "clone"]),
  descricao: z.string().trim().max(1000).optional(),
  amostraKeys: z.array(z.string().min(1)).max(3).optional(),
  /** Obrigatória para clonar (declaração de que a voz é sintética ou autorizada). */
  consentimento: z.boolean().optional(),
});

/** POST — cria a voz do personagem na ElevenLabs (design ou clone). */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, s3 } = ctx;
  const el = getEleven();
  const pool = getPool();
  if (!el || !pool)
    return NextResponse.json(
      {
        error: "Voz não configurada (ELEVENLABS_API_KEY).",
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
  const bloqueio = bloqueioVoz(await planoAtual(userId));
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );

  const amostras = body.amostraKeys ?? [];
  if (body.modo === "clone") {
    if (!amostras.length)
      return NextResponse.json(
        {
          error: "Envie pelo menos uma amostra de voz (1 a 3 arquivos).",
          code: "BAD_INPUT",
        },
        { status: 400 },
      );
    if (!amostras.every((k) => ownsKey(userId, k)))
      return NextResponse.json(
        { error: "Amostra não encontrada." },
        { status: 404 },
      );
    if (body.consentimento !== true)
      return NextResponse.json(
        { error: "Marque a declaração para clonar a voz.", code: "BAD_INPUT" },
        { status: 400 },
      );
    // Declaração obrigatória: fica registrada (quem, o quê, quando, de onde).
    await pool.query(
      "insert into consentimentos (id, user_id, character_id, tipo, texto, ip) values ($1, $2, $3, 'clone_voz', $4, $5)",
      [nanoid(14), userId, body.characterId, DECLARACAO_VOZ, readIp(req)],
    );
  }

  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_CRIAR_VOZ,
    `voz_${body.modo}`,
    body.characterId,
  );
  if (cobrado instanceof NextResponse) return cobrado;

  try {
    const personagem = await carregarPersonagem(userId, body.characterId);
    const nome = `${personagem?.identidade.nome || "Personagem"} · NIDO ${nanoid(5)}`;
    let voiceId: string;
    let descricao: string | null = null;
    let amostraKey: string | null = null;

    if (body.modo === "design") {
      descricao =
        body.descricao ||
        (personagem
          ? descricaoDaFicha(personagem)
          : "A warm, friendly Brazilian Portuguese voice");
      const r = await criarVozDesign(el, {
        nome,
        descricao,
        texto: personagem ? textoAmostra(personagem) : "",
      });
      voiceId = r.voiceId;
      amostraKey = newKey(userId, "audios", "audio/mpeg");
      await putObject(s3, amostraKey, r.amostra, "audio/mpeg");
      await somarArmazenamento(userId, r.amostra.length);
    } else {
      const arquivos = await Promise.all(
        amostras.map(async (k) => ({
          buf: await getObjectBuffer(s3, k),
          tipo: TIPO_POR_EXTENSAO[k.split(".").pop() ?? ""] ?? "audio/mpeg",
        })),
      );
      voiceId = await clonarVoz(el, { nome, amostras: arquivos });
      amostraKey = amostras[0];
    }

    await pool.query(
      `insert into vozes (voice_id, user_id, character_id, nome, origem, descricao, amostra_key)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        voiceId,
        userId,
        body.characterId,
        nome,
        body.modo,
        descricao,
        amostraKey,
      ],
    );
    return NextResponse.json({
      voiceId,
      nome,
      origem: body.modo,
      descricao,
      amostraKey,
    });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    console.error("[voz/criar]", e);
    return NextResponse.json(
      { error: mensagemDeErroVoz(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
