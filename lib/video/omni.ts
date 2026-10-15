import { writeFile } from "node:fs/promises";
import path from "node:path";
import { FileState, GoogleGenAI } from "@google/genai";
import { shrinkReferencia, type ReferenciaInline } from "@/lib/ai/gemini";
import type { EstadoLote, Segmento } from "./lote";

/**
 * Gemini Omni Flash (Google, API do Gemini): um dos motores da troca de pessoa
 * (ver ./troca.ts), ao lado do Kling e do Seedance. O vídeo enviado para
 * edição pode ter no máximo 10 s, então os trechos são curtos (OMNI_MAX_TRECHO).
 * Cada trecho:
 *  - sobe pela Files API (vídeo não cabe no corpo do pedido) e espera o Google
 *    terminar de processar o arquivo;
 *  - vai como uma interação em segundo plano (`background`), com as imagens
 *    (personagens e quadro-guia) no próprio pedido e o resultado como arquivo
 *    (`delivery: "uri"`), para a consulta do andamento ficar leve;
 *  - na montagem, o arquivo pronto ("omni:<uri>") é baixado com a chave.
 * Chave em GEMINI_API_KEY (a mesma do Nano Banana). ~US$ 0,10/s em 720p.
 */
export const MODELO_OMNI = "gemini-omni-1.1-flash";

/** O Omni só edita vídeo enviado de até 10 s; a folga cobre o arredondamento dos quadros. */
export const OMNI_MAX_TRECHO = 9.5;

/** O Google processa o vídeo enviado antes de ele poder ir num pedido. */
const ESPERA_ARQUIVO_MS = 120_000;

export const RECUSA_OMNI =
  "O Gemini Omni recusou este vídeo ou as imagens enviadas. Ele não aceita algumas pessoas reconhecíveis nem conteúdo sensível. Tente com um dos modelos Kling O3.";

let cliente: GoogleGenAI | null = null;

export function getOmni(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  cliente ??= new GoogleGenAI({ apiKey });
  return cliente;
}

/**
 * O pedido da troca é escrito para os motores do fal (@Video1, @Image1…). O
 * Omni chama o vídeo enviado de "the input video" e as imagens de
 * <IMAGE_REF_0>, <IMAGE_REF_1>…, na ordem em que vão no pedido.
 */
export function pedidoParaOmni(pedido: string): string {
  return pedido
    .replace(/@Video1/g, "the input video")
    .replace(/@Image(\d+)/g, (_, n: string) => `<IMAGE_REF_${Number(n) - 1}>`);
}

/** Baixa uma imagem (do storage do fal) e deixa no formato do pedido: JPEG de até 1024 px. */
export async function imagemParaOmni(url: string): Promise<ReferenciaInline> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download da imagem falhou (HTTP ${res.status})`);
  return shrinkReferencia(Buffer.from(await res.arrayBuffer()));
}

async function subirVideo(
  ai: GoogleGenAI,
  arquivo: string,
  conferir?: () => void,
): Promise<string> {
  let f = await ai.files.upload({
    file: arquivo,
    config: { mimeType: "video/mp4" },
  });
  const ate = Date.now() + ESPERA_ARQUIVO_MS;
  while (f.state === FileState.PROCESSING) {
    conferir?.();
    if (Date.now() > ate)
      throw new Error("O Google demorou demais para receber um trecho do vídeo.");
    await new Promise((ok) => setTimeout(ok, 2000));
    f = await ai.files.get({ name: f.name! });
  }
  if (f.state === FileState.FAILED || !f.uri)
    throw new Error("O Google não conseguiu ler um trecho do vídeo.");
  return f.uri;
}

/** Manda um trecho ao Omni. Devolve o id da interação (o "pedido na fila" do lote). */
export async function enviarTrechoOmni(
  ai: GoogleGenAI,
  o: {
    arquivo: string;
    /** Na ordem das referências do pedido (<IMAGE_REF_0>…). */
    imagens: ReferenciaInline[];
    pedido: string;
    /** Para no meio da espera se outro trecho falhou ou o prazo da rota acabou. */
    conferir?: () => void;
  },
): Promise<string> {
  try {
    const uri = await subirVideo(ai, o.arquivo, o.conferir);
    o.conferir?.();
    const r = await ai.interactions.create({
      model: MODELO_OMNI,
      background: true,
      input: [
        { type: "video", uri, mime_type: "video/mp4" },
        ...o.imagens.map((i) => ({
          type: "image" as const,
          data: i.data,
          mime_type: i.mimeType,
        })),
        { type: "text", text: o.pedido },
      ],
      // Sem `aspect_ratio`: na edição o formato é o do vídeo enviado (a API recusa o campo).
      response_format: { type: "video", resolution: "720p", delivery: "uri" },
      generation_config: { video_config: { task: "edit" } },
    });
    return r.id;
  } catch (e) {
    // Sem resposta HTTP (prazo da rota, outro trecho que falhou, rede): segue como veio.
    if (statusDoErro(e) === undefined) throw e;
    throw new Error(mensagemDoOmni(e));
  }
}

export const cancelarOmni = (ai: GoogleGenAI, id: string) =>
  ai.interactions.cancel(id);

type EstadoTrecho =
  | { estado: "na_fila" | "processando" }
  | { estado: "pronto"; ref: string }
  | { estado: "erro"; mensagem: string };

/** Estados da interação que não terminam com o vídeo. */
const FALHOU = ["failed", "cancelled", "incomplete", "budget_exceeded"];

/** "files/abc123" a partir da URI do arquivo (null se não der para ler). */
export function nomeDoArquivo(uri: string): string | null {
  const m = uri.match(/files\/([a-z0-9-]+)/i);
  return m ? `files/${m[1]}` : null;
}

async function estadoTrecho(ai: GoogleGenAI, id: string): Promise<EstadoTrecho> {
  let r;
  try {
    r = await ai.interactions.get(id);
  } catch (e) {
    const status = statusDoErro(e);
    if (status === 404)
      return { estado: "erro", mensagem: "O Google não encontrou um dos trechos do vídeo." };
    // O bloqueio do filtro chega assim: HTTP 400 na consulta ("Request blocked
    // for an unspecified policy reason"), não como status "failed". Testado.
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429)
      return {
        estado: "erro",
        mensagem: motivoDaFalha({ errors: [{ message: (e as Error).message }] }),
      };
    // Falha passageira: segue "processando" e a próxima consulta tenta de novo.
    console.warn("[omni] status", id, (e as Error).message);
    return { estado: "processando" };
  }
  if (r.status === "queued") return { estado: "na_fila" };
  if (FALHOU.includes(r.status))
    return { estado: "erro", mensagem: motivoDaFalha(r) };
  if (r.status !== "completed") return { estado: "processando" };
  const video = r.output_video;
  // Veio no corpo da resposta em vez de arquivo: a montagem pega pela interação.
  if (!video?.uri)
    return video?.data
      ? { estado: "pronto", ref: `interacao:${id}` }
      : { estado: "erro", mensagem: RECUSA_OMNI };
  // O arquivo do resultado também é processado antes de poder ser baixado.
  const nome = nomeDoArquivo(video.uri);
  if (nome)
    try {
      const f = await ai.files.get({ name: nome });
      if (f.state === FileState.FAILED)
        return { estado: "erro", mensagem: "O Google não conseguiu salvar um dos trechos." };
      if (f.state !== FileState.ACTIVE) return { estado: "processando" };
    } catch (e) {
      console.warn("[omni] arquivo", nome, (e as Error).message);
      return { estado: "processando" };
    }
  return { estado: "pronto", ref: video.uri };
}

/** Andamento do lote no Omni, no formato do fal (ver ./lote.ts). Pronto: "omni:<ref>" de cada trecho. */
export async function estadoLoteOmni(
  ai: GoogleGenAI,
  segmentos: Segmento[],
): Promise<EstadoLote> {
  const estados = await Promise.all(
    segmentos.map((s): Promise<EstadoTrecho> =>
      s.urlPronta
        ? Promise.resolve({ estado: "pronto", ref: "" })
        : estadoTrecho(ai, s.requestId),
    ),
  );
  const erro = estados.find((e) => e.estado === "erro");
  if (erro) return erro;
  const prontos = estados.filter((e) => e.estado === "pronto").length;
  if (prontos < segmentos.length)
    return estados.some((e) => e.estado === "processando") || prontos > 0
      ? { estado: "processando", progresso: prontos / segmentos.length }
      : { estado: "na_fila" };
  return {
    estado: "concluido",
    urls: estados.map((e, i) =>
      segmentos[i].urlPronta ?? `omni:${(e as { ref: string }).ref}`,
    ),
  };
}

/** Baixa os trechos prontos ("omni:<uri>" ou "omni:interacao:<id>") para arquivos locais, na ordem. */
export async function baixarTrechosOmni(
  ai: GoogleGenAI,
  urls: string[],
  dir: string,
): Promise<string[]> {
  return Promise.all(
    urls.map(async (url, i) => {
      const ref = url.slice("omni:".length);
      const destino = path.join(dir, `omni-${i}.mp4`);
      if (ref.startsWith("interacao:")) {
        const r = await ai.interactions.get(ref.slice("interacao:".length));
        const data = r.output_video?.data;
        if (!data) throw new Error(`o trecho ${i + 1} do Gemini Omni veio sem vídeo`);
        await writeFile(destino, Buffer.from(data, "base64"));
      } else await ai.files.download({ file: ref, downloadPath: destino });
      return destino;
    }),
  );
}

/** Status HTTP do erro do SDK (ApiError e os erros das interações têm `status`). */
function statusDoErro(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

/** O que mostrar quando a interação termina sem o vídeo. */
function motivoDaFalha(r: {
  errors?: Array<{ message?: string }>;
  steps?: Array<{ type: string; error?: { message?: string } }>;
}): string {
  const detalhe = [
    ...(r.errors ?? []).map((e) => e.message),
    ...(r.steps ?? []).map((s) => s.error?.message),
  ]
    .filter(Boolean)
    .join(" ");
  if (/recogni|celebrit|public figure|likeness|safety|policy|prohibit|block|person|people/i.test(detalhe))
    return RECUSA_OMNI;
  console.warn("[omni] trecho falhou:", detalhe || "(sem detalhe)");
  return "O Gemini Omni não conseguiu trocar a pessoa num dos trechos do vídeo.";
}

/** Mensagem para a tela quando o pedido ao Omni é recusado. */
export function mensagemDoOmni(e: unknown): string {
  const status = statusDoErro(e);
  const msg = (e as Error)?.message ?? "";
  console.error("[omni]", status ?? "", msg);
  if (status === 429 || /quota|rate limit/i.test(msg))
    return "Limite de uso do Gemini atingido. Tente de novo em alguns minutos.";
  if (status === 401 || status === 403 || /api key/i.test(msg))
    return "A chave do Gemini não tem acesso ao Gemini Omni. Confira GEMINI_API_KEY (precisa de faturamento ativo).";
  if (status === 404) return "O Gemini Omni não está disponível nesta chave do Gemini.";
  if (/recogni|celebrit|public figure|likeness|safety|policy|prohibit|block/i.test(msg))
    return RECUSA_OMNI;
  return `Falha no Gemini Omni${status ? ` (HTTP ${status})` : ""}.`;
}
