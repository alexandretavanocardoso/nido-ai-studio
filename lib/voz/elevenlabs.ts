import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Pool } from "@neondatabase/serverless";
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

/** Voz pronta da biblioteca da ElevenLabs (gravada por uma pessoa de verdade). */
export interface VozDaBiblioteca {
  voiceId: string;
  publicOwnerId: string;
  nome: string;
  genero: string;
  idade: string;
  uso: string;
  descricao: string;
  previewUrl: string | null;
}

/** Vozes da biblioteca em português do Brasil, as mais usadas primeiro. */
export async function listarBiblioteca(
  el: ElevenLabsClient,
  o: { genero?: "female" | "male"; busca?: string; pagina?: number },
): Promise<{ vozes: VozDaBiblioteca[]; temMais: boolean }> {
  const r = await el.voices.getShared({
    pageSize: 6,
    page: o.pagina ?? 0,
    language: "pt",
    locale: "pt-BR",
    gender: o.genero,
    search: o.busca,
    // Vozes com tarifa própria custariam mais que o previsto nos créditos.
    includeCustomRates: false,
  });
  return {
    temMais: r.hasMore,
    vozes: r.voices.map((v) => ({
      voiceId: v.voiceId,
      publicOwnerId: v.publicOwnerId,
      nome: v.name,
      genero: v.gender,
      idade: v.age,
      uso: v.useCase,
      descricao: v.description ?? v.descriptive ?? "",
      previewUrl: v.previewUrl ?? null,
    })),
  };
}

/**
 * A voz está na conta da NIDO e veio da biblioteca (ou é uma das padrão)?
 * Vozes criadas ou clonadas por um usuário nunca passam aqui: essas só valem
 * para o dono, pela tabela `vozes`.
 */
async function ehVozDaBiblioteca(
  el: ElevenLabsClient,
  voiceId: string,
): Promise<boolean> {
  try {
    const v = await el.voices.get(voiceId);
    // Tudo que um usuário cria aqui é "generated" (descrição) ou "cloned".
    return v.category !== "generated" && v.category !== "cloned";
  } catch {
    return false;
  }
}

/** Põe a voz da biblioteca na conta da NIDO (se ainda não estiver). */
export async function adotarVozDaBiblioteca(
  el: ElevenLabsClient,
  o: { voiceId: string; publicOwnerId: string; nome: string },
): Promise<string> {
  if (await ehVozDaBiblioteca(el, o.voiceId)) return o.voiceId;
  const r = await el.voices.share(o.publicOwnerId, o.voiceId, {
    newName: o.nome.slice(0, 100),
  });
  return r.voiceId;
}

/** O usuário pode falar com esta voz? As dele (tabela `vozes`) ou as da biblioteca. */
export async function vozPermitida(
  pool: Pool,
  el: ElevenLabsClient,
  userId: string,
  voiceId: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "select 1 from vozes where voice_id = $1 and user_id = $2",
    [voiceId, userId],
  );
  return !!rowCount || ehVozDaBiblioteca(el, voiceId);
}

export function mensagemDeErroVoz(e: unknown): string {
  const status = (e as { statusCode?: number })?.statusCode;
  if (/voice_limit_reached|maximum amount of custom voices/i.test(JSON.stringify((e as { body?: unknown })?.body ?? (e as Error)?.message ?? "")))
    return "A conta da ElevenLabs chegou ao limite de vozes do plano. Apague vozes que não usa ou aumente o plano da ElevenLabs.";
  if (status === 401) return "Chave da ElevenLabs inválida. Confira ELEVENLABS_API_KEY.";
  if (status === 402 || status === 429) return "Limite ou créditos da ElevenLabs esgotados. Confira o plano da conta.";
  if (status === 422 || status === 400) return `A ElevenLabs recusou a entrada: ${(e as Error).message}`;
  return (e as Error)?.message || "Falha na ElevenLabs.";
}
