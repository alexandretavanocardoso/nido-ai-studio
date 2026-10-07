import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Character } from "@/lib/types";

/**
 * Voz do personagem com a ElevenLabs (server-side).
 *  - design: cria uma voz SINTÉTICA a partir de uma descrição (montada da ficha).
 *  - clone: clonagem instantânea a partir de amostras (exige declaração).
 *  - falar: texto → MP3 com a voz do personagem (modelo multilíngue, fala português).
 * Chave em ELEVENLABS_API_KEY. As vozes ficam na conta ElevenLabs da NIDO; a
 * tabela `vozes` guarda de qual conta/personagem é cada uma.
 */
let client: ElevenLabsClient | null = null;

export function getEleven(): ElevenLabsClient | null {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return null;
  if (!client) client = new ElevenLabsClient({ apiKey });
  return client;
}

const MODELO_FALA = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

export { DECLARACAO_VOZ } from "@/lib/declaracoes";

/** Descrição da voz (em inglês, que o Voice Design entende melhor) a partir da ficha. */
export function descricaoDaFicha(c: Character): string {
  const v = c.voz;
  const genero =
    v.vozGenero ||
    (c.identidade.genero === "feminino" ? "female" : c.identidade.genero === "masculino" ? "male" : "androgynous");
  const partes = [
    `A ${genero} voice`,
    c.identidade.idadeAparente ? `sounding around ${c.identidade.idadeAparente}` : "",
    v.vozTimbre ? `with a ${v.vozTimbre} timbre` : "",
    v.vozRitmo ? `speaking at a ${v.vozRitmo} pace` : "",
    c.identidade.sotaque ? `with a ${c.identidade.sotaque} accent` : "with a Brazilian Portuguese accent",
    c.soul.adjetivos.length ? `personality: ${c.soul.adjetivos.slice(0, 4).join(", ")}` : "",
    "clear social media influencer delivery",
  ].filter(Boolean);
  return partes.join(", ").slice(0, 1000);
}

/** Frase de amostra (o Voice Design pede um texto de 100+ caracteres). */
export function textoAmostra(c: Character): string {
  const base = [c.voz.abertura, ...c.voz.bordoes, c.identidade.bio].filter(Boolean).join(" ");
  const nome = c.identidade.nome || "seu novo personagem favorito";
  const texto = base.length >= 100 ? base : `Oi, gente! Aqui é ${nome}. ${base} Hoje eu trouxe uma novidade que vocês vão amar, então fica comigo até o final que vale a pena.`;
  return texto.slice(0, 1000);
}

async function paraBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/** Cria uma voz sintética pela descrição. Devolve o id e a amostra (MP3). */
export async function criarVozDesign(
  el: ElevenLabsClient,
  o: { nome: string; descricao: string; texto: string }
): Promise<{ voiceId: string; amostra: Buffer }> {
  const design = await el.textToVoice.design({
    voiceDescription: o.descricao,
    text: o.texto.length >= 100 ? o.texto : undefined,
    autoGenerateText: o.texto.length < 100,
  });
  const preview = design.previews[0];
  if (!preview) throw new Error("A ElevenLabs não devolveu nenhuma voz para essa descrição.");
  const voz = await el.textToVoice.create({
    voiceName: o.nome,
    voiceDescription: o.descricao,
    generatedVoiceId: preview.generatedVoiceId,
  });
  return { voiceId: voz.voiceId, amostra: Buffer.from(preview.audioBase64, "base64") };
}

/** Clonagem instantânea a partir de amostras de áudio. */
export async function clonarVoz(
  el: ElevenLabsClient,
  o: { nome: string; amostras: Array<{ buf: Buffer; tipo: string }> }
): Promise<string> {
  const r = await el.voices.ivc.create({
    name: o.nome,
    files: o.amostras.map((a, i) => new File([new Uint8Array(a.buf)], `amostra-${i + 1}`, { type: a.tipo })),
    removeBackgroundNoise: true,
  });
  return r.voiceId;
}

/** Texto → MP3 com a voz do personagem. */
export async function falar(el: ElevenLabsClient, voiceId: string, texto: string): Promise<Buffer> {
  const stream = await el.textToSpeech.convert(voiceId, {
    text: texto,
    modelId: MODELO_FALA,
    outputFormat: "mp3_44100_128",
  });
  return paraBuffer(stream);
}

export function mensagemDeErroVoz(e: unknown): string {
  const status = (e as { statusCode?: number })?.statusCode;
  if (status === 401) return "Chave da ElevenLabs inválida. Confira ELEVENLABS_API_KEY.";
  if (status === 402 || status === 429) return "Limite ou créditos da ElevenLabs esgotados. Confira o plano da conta.";
  if (status === 422 || status === 400) return `A ElevenLabs recusou a entrada: ${(e as Error).message}`;
  return (e as Error)?.message || "Falha na ElevenLabs.";
}
