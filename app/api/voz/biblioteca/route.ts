import { NextResponse } from "next/server";
import { z } from "zod";
import { planoAtual } from "@/lib/creditos";
import { bloqueioVoz } from "@/lib/planos";
import { contextoVideo } from "@/lib/video/server";
import {
  adotarVozDaBiblioteca,
  getEleven,
  listarBiblioteca,
  mensagemDeErroVoz,
} from "@/lib/voz/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const semChave = () =>
  NextResponse.json(
    {
      error: "Voz não configurada (ELEVENLABS_API_KEY).",
      code: "CONFIG_MISSING",
    },
    { status: 500 },
  );

/**
 * GET — vozes prontas da biblioteca da ElevenLabs em português do Brasil ou
 * inglês (gravadas por pessoas de verdade), para escolher como voz do personagem.
 * ?genero=female|male · ?idioma=pt|en · ?busca= · ?pagina=
 */
export async function GET(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const el = getEleven();
  if (!el) return semChave();
  const q = new URL(req.url).searchParams;
  const genero = q.get("genero");
  try {
    return NextResponse.json(
      await listarBiblioteca(el, {
        genero: genero === "female" || genero === "male" ? genero : undefined,
        idioma: q.get("idioma") === "en" ? "en" : "pt",
        busca: q.get("busca")?.trim().slice(0, 60) || undefined,
        pagina: Math.min(50, Math.max(0, Number(q.get("pagina")) || 0)),
      }),
    );
  } catch (e) {
    console.error("[voz/biblioteca]", e);
    return NextResponse.json(
      { error: mensagemDeErroVoz(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}

const BodySchema = z.object({
  voiceId: z.string().min(1).max(64),
  publicOwnerId: z.string().min(1).max(128),
  nome: z.string().trim().min(1).max(120),
});

/**
 * POST — deixa a voz escolhida pronta para uso (ela entra na conta ElevenLabs
 * da NIDO, uma vez só, e serve para todos). A escolha em si fica no personagem.
 */
export async function POST(req: Request) {
  const ctx = await contextoVideo();
  if (ctx instanceof NextResponse) return ctx;
  const el = getEleven();
  if (!el) return semChave();
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const bloqueio = bloqueioVoz(await planoAtual(ctx.userId));
  if (bloqueio)
    return NextResponse.json(
      { error: bloqueio, code: "PLANO" },
      { status: 403 },
    );
  try {
    const voiceId = await adotarVozDaBiblioteca(el, parsed.data);
    return NextResponse.json({ voiceId });
  } catch (e) {
    console.error("[voz/biblioteca] adotar", e);
    return NextResponse.json(
      { error: mensagemDeErroVoz(e), code: "PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
