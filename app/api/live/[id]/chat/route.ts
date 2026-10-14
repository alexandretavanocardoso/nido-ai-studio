import { NextResponse } from "next/server";
import { z } from "zod";
import {
  conviteDoBotDiscord,
  desligarChat,
  ligarDiscord,
  ligarKick,
  ligarYoutube,
  lerYoutube,
  mensagensNovas,
  RecusaChat,
  type ChatConfig,
} from "@/lib/live/chat";
import { carregarLive } from "@/lib/live/server";
import { contextoLive, liveNaoEncontrada } from "@/lib/live/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const conectados = (c: ChatConfig) => ({
  youtube: c.youtube?.videoId ?? null,
  kick: c.kick?.slug ?? null,
  discord: c.discord
    ? {
        nome: c.discord.nome ?? null,
        palco: !!c.discord.palco,
        estado: c.discord.estado ?? "aguardando",
        erro: c.discord.erro ?? null,
      }
    : null,
});

/**
 * GET ?cursor= — mensagens novas do chat do YouTube, do Kick e do Discord (a
 * página chama a cada poucos segundos). Busca no YouTube quando dá a hora; as
 * do Kick chegam pelo webhook e as do Discord pelo bot. Sem cursor, devolve só
 * o ponto de partida. Também devolve o estado do bot e o link de convite.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  let erro: string | null = null;
  if (live.status === "no_ar")
    try {
      await lerYoutube(ctx.pool, live);
    } catch (e) {
      if (e instanceof RecusaChat) erro = e.message;
      else console.warn("[live] youtube", (e as Error).message);
    }
  const c = new URL(req.url).searchParams.get("cursor");
  const cursor = c && /^\d+$/.test(c) ? Number(c) : null;
  const novas = await mensagensNovas(ctx.pool, live.id, cursor);
  const atual = erro ? (await carregarLive(ctx.pool, ctx.userId, live.id)) ?? live : live;
  return NextResponse.json({
    ...novas,
    chat: conectados(atual.chat),
    erro,
    discordConvite: conviteDoBotDiscord(),
  });
}

const BodySchema = z.object({
  origem: z.enum(["youtube", "kick", "discord"]),
  /** Link da live do YouTube, nome/link do canal do Kick ou link do canal do Discord. */
  valor: z.string().trim().min(1).max(300),
});

/**
 * POST — liga o chat do YouTube ou do Kick, ou o bot do Discord (voz e chat
 * do canal), nesta live. Precisa estar no ar.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  if (live.status !== "no_ar")
    return NextResponse.json(
      { error: "A live não está no ar.", code: "STATUS" },
      { status: 409 },
    );
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const { origem, valor } = parsed.data;
  try {
    const chat =
      origem === "youtube"
        ? await ligarYoutube(ctx.pool, live, valor)
        : origem === "kick"
          ? await ligarKick(ctx.pool, live, valor)
          : await ligarDiscord(ctx.pool, live, valor);
    return NextResponse.json({ chat: conectados(chat) });
  } catch (e) {
    if (e instanceof RecusaChat)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    console.error("[live] ligar chat", origem, e);
    return NextResponse.json(
      { error: "Não consegui ligar o chat. Tente de novo." },
      { status: 500 },
    );
  }
}

/** DELETE ?origem=youtube|kick|discord — para de ler esse chat (o bot do Discord sai do canal). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await contextoLive();
  if (ctx instanceof NextResponse) return ctx;
  const live = await carregarLive(ctx.pool, ctx.userId, (await params).id);
  if (!live) return liveNaoEncontrada();
  const origem = new URL(req.url).searchParams.get("origem");
  if (origem !== "youtube" && origem !== "kick" && origem !== "discord")
    return NextResponse.json(
      { error: "Origem do chat inválida.", code: "BAD_INPUT" },
      { status: 400 },
    );
  const chat = await desligarChat(ctx.pool, live, origem);
  return NextResponse.json({ chat: conectados(chat) });
}
