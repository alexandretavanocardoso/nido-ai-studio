import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import { idiomaDoPedido } from "@/lib/ai/idioma";
import { allow } from "@/lib/ai/rate-limit";
import { recursosDisponiveis } from "@/lib/recursos";
import {
  atualizarRadar,
  marcarVisto,
  RadarErro,
  radaresDoPersonagem,
  salvarConfiguracao,
} from "@/lib/radar/server";
import { MAX_TEMAS } from "@/lib/radar/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Busca no X (até ~1 min) + pesquisa de notícias (~30s). */
export const maxDuration = 300;

type Ctx = { params: Promise<{ characterId: string }> };

async function usuario() {
  const rec = recursosDisponiveis();
  if (!rec.login || !rec.ia)
    return NextResponse.json(
      {
        error: "O radar precisa de login e da IA de texto configurados.",
        code: "CONFIG_MISSING",
      },
      { status: 500 },
    );
  const userId = await getUserId();
  return (
    userId ??
    NextResponse.json(
      { error: "Entre na sua conta.", code: "UNAUTHORIZED" },
      { status: 401 },
    )
  );
}

/** GET — radares do personagem (até 30 dias, do mais recente para o mais antigo). */
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  return NextResponse.json({
    radares: await radaresDoPersonagem(userId, (await params).characterId),
  });
}

const Body = z.object({
  comX: z.boolean().optional(),
  temas: z.array(z.string().trim().min(1).max(80)).max(MAX_TEMAS).optional(),
});

/** POST — gera (ou refaz) o radar de hoje. Cobra créditos; devolve se falhar. */
export async function POST(req: Request, { params }: Ctx) {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  const gate = await allow(`radar:${userId}`, 3);
  if (!gate.ok)
    return NextResponse.json(
      {
        error: `Muitos pedidos seguidos. Tente de novo em ${gate.retryAfter}s.`,
        code: "RATE_LIMITED",
      },
      { status: 429 },
    );
  const body = Body.safeParse(await req.json().catch(() => ({})));
  try {
    const radar = await atualizarRadar({
      userId,
      characterId: (await params).characterId,
      comX: body.success ? body.data.comX : undefined,
      temas: body.success ? body.data.temas : undefined,
      idioma: idiomaDoPedido(req),
    });
    // Quem pediu está olhando agora: não vira aviso.
    await marcarVisto(userId, radar.characterId);
    return NextResponse.json({ radar });
  } catch (e) {
    if (e instanceof RadarErro)
      return NextResponse.json(
        { error: e.message, code: e.code },
        {
          status:
            e.code === "SEM_CREDITOS"
              ? 402
              : e.code === "NAO_ENCONTRADO"
                ? 404
                : e.code === "SEM_TEMAS"
                  ? 400
                  : 502,
        },
      );
    console.error("[radar]", e);
    return NextResponse.json(
      { error: "Não consegui montar o radar agora.", code: "FALHA" },
      { status: 502 },
    );
  }
}

/** PATCH — marca os radares do personagem como vistos (some o aviso). */
export async function PATCH(_req: Request, { params }: Ctx) {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  await marcarVisto(userId, (await params).characterId);
  return NextResponse.json({ ok: true });
}

const Config = z.object({
  ativo: z.boolean(),
  comX: z.boolean(),
  temas: z.array(z.string().trim().min(1).max(80)).max(MAX_TEMAS),
  idioma: z.enum(["pt", "en"]).default("pt"),
});

/**
 * PUT — grava as opções do radar (ligado, X, temas) na ficha salva no
 * servidor, que é de onde a tarefa diária lê. Pedido pequeno, enviado com
 * keepalive: chega mesmo se a aba for fechada logo depois.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const userId = await usuario();
  if (userId instanceof NextResponse) return userId;
  const cfg = Config.safeParse(await req.json().catch(() => null));
  if (!cfg.success)
    return NextResponse.json(
      { error: "Configuração inválida.", code: "BAD_INPUT" },
      { status: 400 },
    );
  // false = a ficha ainda não chegou ao servidor; ela leva o radar junto quando sincronizar.
  const salvo = await salvarConfiguracao(
    userId,
    (await params).characterId,
    cfg.data,
  );
  return NextResponse.json({ ok: true, salvo });
}
