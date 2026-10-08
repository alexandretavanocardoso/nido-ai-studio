import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth/server";
import {
  cobrarOuResponder,
  creditosAtivos,
  estornarSeHouver,
} from "@/lib/creditos";
import { CREDITOS_TEXTO } from "@/lib/planos";
import {
  AIConfigError,
  AIParseError,
  AIProviderError,
  askClaude,
} from "@/lib/ai/anthropic";
import { allow, readIp } from "@/lib/ai/rate-limit";
import { cenasDaResposta } from "@/lib/video/cenas-roteiro";
import {
  CARACTERES_POR_SEGUNDO,
  DURACOES_CRIAR,
  DURACOES_FALADO,
  FALA_MAX_CARACTERES,
  MAX_CENAS_FALADAS,
  ROTEIRO_INTEIRO,
} from "@/lib/video/precos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Folga para o usuário ainda editar dentro do limite de 1000 da cena. */
const MAX_SAIDA = 700;

const BodySchema = z.object({
  roteiro: z.string().trim().min(10, "Roteiro vazio.").max(8000),
  duracao: z
    .number()
    .refine((d) => (DURACOES_FALADO as readonly number[]).includes(d))
    .default(DURACOES_CRIAR[0]),
  /** "falado": devolve também a fala (o que o personagem diz), no tempo pedido. */
  modo: z.enum(["cena", "falado"]).default("cena"),
});

const REGRAS_VISUAIS = [
  '- English, one paragraph, present tense. Refer to the character as "the person" (or "the character" if not human): never use names.',
  "- No dialogue, no quoted speech, no on-screen text, no captions, no hashtags, no emojis, no scene numbers, no timestamps.",
  "- No names of real people, brands, products, songs, films, anime or other copyrighted characters; describe them generically if they matter to the action.",
  "- Nothing violent, sexual, hateful or dangerous: if the script has it, keep the harmless visual idea and drop the rest.",
];

const SISTEMA_CENA = [
  "You turn a short-form video script (written in Portuguese, with spoken lines, on-screen text, captions and hashtags) into ONE visual prompt for an image-to-video model (Runway Gen-4 / Veo).",
  "The model animates a still image of the character, so describe only what is SEEN: the subject's action and expression, the camera movement, the setting and the light.",
  "",
  "Rules:",
  ...REGRAS_VISUAIS,
  "- At most 90 words. One continuous shot that fits the requested length: pick the strongest visual moment of the script instead of listing every scene.",
  "- Answer with the prompt only: no preface, no quotes, no explanation.",
].join("\n");

const sistemaFalado = (duracao: number) =>
  [
    "You prepare a talking-head video from a short-form video script. A text-to-speech voice reads each scene's speech and an avatar model shows the character saying it, lips in sync, in that scene's setting.",
    "",
    `Split the script into its scenes (at most ${MAX_CENAS_FALADAS}; merge neighbouring ones if there are more) and answer with JSON only:`,
    '{"cenas": [{"fala": "<what the character says in this scene>", "cenario": "<where the character is>"}]}',
    "",
    '"fala" rules:',
    "- Same language as the script. Use the character's own spoken lines from the script, in order, keeping their slang and catchphrases: it must be recognisably this script, not a rewrite.",
    duracao === ROTEIRO_INTEIRO
      ? `- All scenes together are the WHOLE script: every spoken line, from the hook to the closing call, word for word, nothing summarised or dropped. Only if the total passes ${Math.floor((duracao * CARACTERES_POR_SEGUNDO * 0.95) / 10) * 10} characters, trim the weakest middle lines and still end on the closing line.`
      : `- All scenes together are read aloud in about ${duracao} seconds: at most ${Math.floor((duracao * CARACTERES_POR_SEGUNDO * 0.9) / 10) * 10} characters in total. If the script is longer, keep the hook and the strongest lines and end on a complete sentence (the closing line if it fits). Short videos may have a single scene.`,
    "- Only words to be spoken: no stage directions, no labels (GANCHO, CENA 1), no on-screen text, no hashtags, no emojis, no quotes inside the text. Punctuate for natural pauses.",
    "",
    '"cenario" rules:',
    "- English, at most 22 words: the place and the light behind the character in this scene, taken from what the script says appears on screen (location, time of day, mood). Background only: the character is always shown close-up, talking to the camera.",
    "- No names of real people, brands, songs, films, anime or other copyrighted characters; describe generically. Nothing violent, sexual, hateful or dangerous. No text or captions in the scene.",
    "- If the script gives no hint for a scene, invent a setting that fits what is being said. Vary the settings between scenes only when the script changes place.",
  ].join("\n");

/**
 * POST — prepara um roteiro salvo (texto de fala) para o "Criar vídeo".
 * Modo "cena": a descrição visual que vai para o modelo (roteiro cru costuma
 * ser barrado pela moderação: tem falas, nomes e hashtags). Modo "falado":
 * também a fala, do tamanho da duração pedida, para a voz do personagem ler.
 */
export async function POST(req: Request) {
  const gate = await allow(readIp(req));
  if (!gate.ok)
    return NextResponse.json(
      {
        error: `Muitas chamadas seguidas. Tente de novo em ${gate.retryAfter}s.`,
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: "BAD_INPUT" },
      { status: 400 },
    );
  const body = parsed.data;

  const userId = await getUserId();
  if (creditosAtivos() && !userId)
    return NextResponse.json(
      { error: "Entre na sua conta para usar a IA.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  const cobrado = await cobrarOuResponder(
    userId,
    CREDITOS_TEXTO.cenaDoRoteiro,
    "texto",
    "cena-do-roteiro",
  );
  if (cobrado instanceof NextResponse) return cobrado;

  const limpar = (t: string) =>
    t
      .trim()
      .replace(/^["“]|["”]$/g, "")
      .replace(/\s+/g, " ");

  try {
    const texto = await askClaude({
      system:
        body.modo === "falado" ? sistemaFalado(body.duracao) : SISTEMA_CENA,
      user: `Video length: ${body.duracao} seconds.\n\nScript:\n${body.roteiro}`,
      maxTokens: 1200,
    });
    if (body.modo === "falado") {
      const cenas = cenasDaResposta(texto)
        .map((c) => ({
          fala: limpar(c.fala),
          cenario: limpar(c.cenario).slice(0, 400),
        }))
        .filter((c) => c.fala.length >= 2)
        .slice(0, MAX_CENAS_FALADAS);
      if (!cenas.length)
        console.warn(
          "[videos/cena] resposta sem cenas:",
          texto.slice(0, 1500),
        );
      // Cada cena é um parágrafo da fala: é assim que o vídeo falado as separa.
      const fala = cenas
        .map((c) => c.fala)
        .join("\n\n")
        .slice(0, FALA_MAX_CARACTERES);
      if (fala.length < 2) throw new AIParseError("A IA não devolveu a fala.");
      return NextResponse.json({ fala, cenarios: cenas.map((c) => c.cenario) });
    }
    const cena = limpar(texto).slice(0, MAX_SAIDA);
    if (cena.length < 10) throw new AIParseError("A IA não devolveu a cena.");
    return NextResponse.json({ cena });
  } catch (e) {
    await estornarSeHouver(cobrado.cobranca);
    if (e instanceof AIConfigError)
      return NextResponse.json(
        {
          error: "Chave da Anthropic não configurada no servidor.",
          code: "CONFIG_MISSING",
        },
        { status: 500 },
      );
    if (e instanceof AIProviderError || e instanceof AIParseError)
      return NextResponse.json(
        { error: e.message, code: "PROVIDER_ERROR" },
        { status: 502 },
      );
    return NextResponse.json(
      { error: (e as Error).message, code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
